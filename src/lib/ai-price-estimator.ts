// AI-powered account price estimator.
//
// Strategy:
//  1. Build a human-readable description of the account from the entered stats.
//  2. Scrape a few live comparable ads from Divar/Sheypoor for the same game.
//  3. Ask the AI model to weigh the account's items/level/currency against those
//     real market listings and return a fair price (in Toman) + a short rationale.
//  4. If AI is unavailable or returns nothing usable, fall back to the
//     deterministic formula (count * unit price).

import { askOpenRouter } from "@/lib/openrouter";
import { scrapeDivarCity, scrapeSheypoorCity, type ScrapedAd } from "@/lib/classified-scraper";
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

// Search queries tuned per game to surface comparable account listings.
const MARKET_QUERY: Record<EstimatorGame, string> = {
  cod_mobile: "اکانت کالاف دیوتی موبایل",
  clash_royale: "اکانت کلش رویال",
  fortnite: "اکانت فورتنایت",
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

/** Fetch a handful of comparable market ads (best-effort; never throws). */
async function fetchComparables(game: EstimatorGame, limit = 8): Promise<ScrapedAd[]> {
  const query = MARKET_QUERY[game];
  const results: ScrapedAd[] = [];
  try {
    // Tehran tends to have the most listings; keep it to one city for speed.
    const divar = await scrapeDivarCity("tehran", { limit, query }).catch(() => []);
    results.push(...divar);
  } catch (err) {
    logger.warn({ err, game }, "Divar comparables fetch failed");
  }
  if (results.length < 4) {
    try {
      const sheypoor = await scrapeSheypoorCity("tehran", { limit, query }).catch(() => []);
      results.push(...sheypoor);
    } catch (err) {
      logger.warn({ err, game }, "Sheypoor comparables fetch failed");
    }
  }
  // Only keep ads that actually have a price (useful as a comparable).
  return results.filter((a) => a.price).slice(0, limit);
}

function comparablesToText(ads: ScrapedAd[]): string {
  if (!ads.length) return "هیچ آگهی مشابهی در حال حاضر یافت نشد.";
  return ads
    .map((a, i) => `${i + 1}. ${a.title}${a.price ? ` — قیمت: ${a.price}` : ""}${a.description ? `\n   ${a.description.slice(0, 160)}` : ""}`)
    .join("\n");
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

  const fallback = (): AiEstimateResult => ({
    priceToman: formulaToman,
    minToman: Math.round(formulaToman * 0.85),
    maxToman: Math.round(formulaToman * 1.15),
    rationale: "این قیمت بر اساس فرمول پایه‌ی پلتفرم محاسبه شده است (ارزیابی هوشمند در دسترس نبود).",
    source: "formula",
    comparablesCount: 0,
  });

  try {
    const comparables = await fetchComparables(game);
    const accountDesc = describeAccount(game, values);

    const systemPrompt =
      `تو یک کارشناس قیمت‌گذاری اکانت‌های بازی موبایل در بازار ایران هستی. ` +
      `وظیفه‌ات این است که با توجه به مشخصات اکانت و قیمت آگهی‌های واقعی و روز بازار (دیوار و شیپور)، ` +
      `یک قیمت منصفانه و واقع‌بینانه به تومان تعیین کنی. ` +
      `قیمت‌ها در ایران به تومان است. زیادی خوش‌بینانه یا بدبینانه قیمت نده؛ منصفانه و مطابق بازار روز باش. ` +
      `حتماً در همان ابتدای پاسخ، در یک خط، فقط به این شکل قیمت را بده: PRICE: <عدد تومان بدون جداکننده>. ` +
      `سپس در ۲ تا ۴ جمله‌ی کوتاه فارسی دلیل قیمت را توضیح بده.`;

    const userPrompt =
      `بازی: ${GAME_LABEL[game]}\n\n` +
      `مشخصات اکانت برای فروش:\n${accountDesc}\n\n` +
      `قیمت پایه‌ی تخمینی پلتفرم (صرفاً برای مرجع): ${formulaToman.toLocaleString("fa-IR")} تومان\n\n` +
      `آگهی‌های واقعی و مشابه از بازار (دیوار/شیپور):\n${comparablesToText(comparables)}\n\n` +
      `حالا یک قیمت منصفانه و مطابق بازار روز برای این اکانت تعیین کن.`;

    const aiText = await askOpenRouter(userPrompt, systemPrompt);
    if (!aiText) return fallback();

    const aiPrice = parseTomanFromText(aiText);
    if (!aiPrice) {
      // AI replied but no parseable number — keep the text as rationale but use formula number.
      const fb = fallback();
      return { ...fb, rationale: aiText.slice(0, 600), source: "formula", comparablesCount: comparables.length };
    }

    // Strip the leading "PRICE: ..." line from the rationale shown to users.
    const rationale = aiText.replace(/^.*PRICE\s*[:=].*$/im, "").trim().slice(0, 600) ||
      "قیمت بر اساس ارزش آیتم‌ها و مقایسه با بازار روز تعیین شد.";

    return {
      priceToman: aiPrice,
      minToman: Math.round(aiPrice * 0.9),
      maxToman: Math.round(aiPrice * 1.12),
      rationale,
      source: "ai",
      comparablesCount: comparables.length,
    };
  } catch (err) {
    logger.error({ err, game }, "AI price estimation failed; using formula fallback");
    return fallback();
  }
}
