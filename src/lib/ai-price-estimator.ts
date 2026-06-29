// AI-powered account price estimator.
//
// Strategy:
//  1. Build a human-readable description of the account from the entered stats.
//  2. Scrape a few live comparable ads from Divar/Sheypoor for the same game.
//  3. Ask the AI model to weigh the account's items/level/currency against those
//     real market listings and return a fair price (in Toman) + a short rationale.
//  4. If AI is unavailable or returns nothing usable, fall back to the
//     deterministic formula (count * unit price).

import { fetchAIResponse } from "@/lib/ai-provider-manager";
import { gatherComparables, comparablesToText, type Comparable } from "@/lib/market-comparables";
import {
  ESTIMATOR_FIELDS,
  computeEstimate,
  type EstimatorGame,
} from "@/lib/price-estimator";
import logger from "@/lib/logger";

const GAME_LABEL: Record<EstimatorGame, string> = {
  cod_mobile: "کالاف دیوتی موبایل (Call of Duty Mobile)",
  clash_royale: "کلش رویال (Clash Royale)",
  fortnite: "فورتنایت (Fortnite)",
};

export interface AiEstimateResult {
  priceToman: number;
  /** Fair range to display (min/max around the point estimate). */
  minToman: number;
  maxToman: number;
  rationale: string;
  /** "ai" when the model produced the price, "formula" when it fell back. */
  source: "ai" | "formula";
  comparablesCount: number;
  /** Distinct market sources the comparables came from (divar, sheypoor, torob, ...). */
  sources: string[];
  /** Which AI provider/model produced the price (for transparency). */
  aiModel?: string;
}

/** Turn the entered numeric stats into a readable Persian description. */
function describeAccount(game: EstimatorGame, values: Record<string, number>): string {
  const lines: string[] = [];
  for (const field of ESTIMATOR_FIELDS[game]) {
    const n = values[field.key];
    if (Number.isFinite(n) && n > 0) {
      lines.push(`- ${field.label}: ${Math.floor(n).toLocaleString("fa-IR")}`);
    }
  }
  return lines.length ? lines.join("\n") : "- اطلاعاتی وارد نشده است";
}

/** Extract the first integer Toman value from a free-form AI text. */
function parseTomanFromText(text: string): number | null {
  // Prefer an explicit JSON-ish "price": number
  const jsonMatch = text.match(/"?(?:price|قیمت|priceToman)"?\s*[:=]\s*"?([\d,]+)/i);
  const candidate = jsonMatch?.[1] || (text.match(/([\d]{1,3}(?:[,،]\d{3})+|\d{5,})/)?.[1] ?? "");
  const digits = candidate.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Main entry: returns a fair AI-backed estimate, or a formula-based fallback.
 * `unitPrices` is the resolved per-field RIAL map (admin overrides + defaults),
 * used both for the formula fallback and as a baseline hint to the AI.
 */
export async function estimateAccountPrice(params: {
  game: EstimatorGame;
  values: Record<string, number>;
  unitPrices: Record<string, bigint>;
}): Promise<AiEstimateResult> {
  const { game, values, unitPrices } = params;

  // Deterministic baseline (also the fallback).
  const formulaRial = computeEstimate(game, values, unitPrices);
  const formulaToman = Number(formulaRial / BigInt(10));

  const fallback = (extra?: Partial<AiEstimateResult>): AiEstimateResult => ({
    priceToman: formulaToman,
    minToman: Math.round(formulaToman * 0.85),
    maxToman: Math.round(formulaToman * 1.15),
    rationale: "این قیمت بر اساس فرمول پایه‌ی پلتفرم محاسبه شده است (ارزیابی هوشمند در دسترس نبود).",
    source: "formula",
    comparablesCount: 0,
    sources: [],
    ...extra,
  });

  try {
    // Gather comparables from many Iranian sources (Divar, Sheypoor, Torob, shops).
    const comparables: Comparable[] = await gatherComparables(game).catch(() => []);
    const sources = [...new Set(comparables.map((c) => c.source))];
    const accountDesc = describeAccount(game, values);

    const systemPrompt =
      `تو یک کارشناس حرفه‌ای قیمت‌گذاری اکانت‌های بازی موبایل در بازار ایران هستی. ` +
      `وظیفه‌ات این است که با توجه به مشخصات دقیق اکانت و قیمت آگهی‌های واقعی و روز در بازار ایران ` +
      `(از جمله دیوار، شیپور، ترب و فروشگاه‌های تخصصی فروش اکانت)، یک قیمت منصفانه، دقیق و واقع‌بینانه به تومان تعیین کنی. ` +
      `ارزش هر آیتم، لول اکانت، میزان ارز داخل‌بازی و کمیاب‌بودن آیتم‌ها را در نظر بگیر و با اکانت‌های هم‌رده و هم‌لول مقایسه کن. ` +
      `قیمت‌ها در ایران به تومان است. زیادی خوش‌بینانه یا بدبینانه نباش؛ دقیقاً مطابق بازار روز قیمت بده. ` +
      `حتماً در همان ابتدای پاسخ، در یک خط، فقط به این شکل قیمت را بده: PRICE: <عدد تومان بدون جداکننده>. ` +
      `سپس در ۲ تا ۴ جمله‌ی کوتاه فارسی دلیل قیمت را توضیح بده و در صورت امکان به مقایسه با بازار اشاره کن.`;

    const userPrompt =
      `بازی: ${GAME_LABEL[game]}\n\n` +
      `مشخصات اکانت برای فروش:\n${accountDesc}\n\n` +
      `قیمت پایه‌ی تخمینی پلتفرم (صرفاً برای مرجع، نه لزوماً درست): ${formulaToman.toLocaleString("fa-IR")} تومان\n\n` +
      `آگهی‌ها و قیمت‌های واقعی و روز از بازار ایران (${sources.join("، ") || "بدون داده"}):\n${comparablesToText(comparables)}\n\n` +
      `با تکیه بر این داده‌های واقعی بازار، یک قیمت منصفانه و دقیق برای این اکانت تعیین کن.`;

    // Uses the project's multi-provider auto-switch (OpenRouter models -> Groq).
    const ai = await fetchAIResponse(userPrompt, systemPrompt);
    const aiText = ai?.content;
    if (!aiText) return fallback({ comparablesCount: comparables.length, sources });

    const aiModel = ai?.model ? `${ai.provider}/${ai.model}` : ai?.provider;
    const aiPrice = parseTomanFromText(aiText);
    if (!aiPrice) {
      return fallback({
        rationale: aiText.slice(0, 600),
        comparablesCount: comparables.length,
        sources,
        aiModel,
      });
    }

    // Strip the leading "PRICE: ..." line from the rationale shown to users.
    const rationale =
      aiText.replace(/^.*PRICE\s*[:=].*$/im, "").trim().slice(0, 600) ||
      "قیمت بر اساس ارزش آیتم‌ها و مقایسه با بازار روز تعیین شد.";

    return {
      priceToman: aiPrice,
      minToman: Math.round(aiPrice * 0.9),
      maxToman: Math.round(aiPrice * 1.12),
      rationale,
      source: "ai",
      comparablesCount: comparables.length,
      sources,
      aiModel,
    };
  } catch (err) {
    logger.error({ err, game }, "AI price estimation failed; using formula fallback");
    return fallback();
  }
}
