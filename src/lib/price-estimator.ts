// Price estimator field definitions + default unit prices (in RIAL) per game.
// Admins can override unit prices via the price_estimator_rates table; these
// defaults are used as a fallback when no override exists.
//
// Two kinds of fields exist:
//   - "number" fields: the user enters a count; price contribution = count * unit.
//   - "choice"  fields: the user picks an option; each option carries a
//                       multiplier that scales the WHOLE estimate (e.g. number
//                       of saves / region / ban history / full-access). This
//                       mirrors how specialist Iranian shops (e.g. vg-store)
//                       price accounts: items add value, but security/region
//                       act as multipliers on the final number.

export type EstimatorGame = "cod_mobile" | "clash_royale" | "fortnite";

export interface ChoiceOption {
  value: string;
  label: string;
  /** Multiplier applied to the whole estimate when this option is selected. */
  multiplier: number;
}

export interface EstimatorField {
  key: string;
  label: string;
  /** "number" = numeric count input; "choice" = single select that scales price. */
  kind: "number" | "choice";
  /** Minimum acceptable value for number fields (e.g. account level >= 1). */
  min?: number;
  /** Default unit price in RIAL per unit (number fields only). */
  defaultUnitRial?: number;
  /** Options for choice fields. */
  options?: ChoiceOption[];
  /** Default selected value for choice fields. */
  defaultValue?: string;
  /** Optional helper hint shown under the field. */
  hint?: string;
}

export const ESTIMATOR_GAMES: Array<{ id: EstimatorGame; label: string; icon: string }> = [
  { id: "cod_mobile", label: "کالاف دیوتی موبایل", icon: "🔫" },
  { id: "clash_royale", label: "کلش رویال", icon: "👑" },
  { id: "fortnite", label: "فورتنایت", icon: "🛡️" },
];

// Toman defaults (converted to RIAL = toman * 10 below). Reasonable starting
// points; admins are expected to tune them to the live market.
const T = (toman: number) => toman * 10;

// Convenience builders.
const num = (
  key: string,
  label: string,
  toman: number,
  opts: { min?: number; hint?: string } = {}
): EstimatorField => ({
  key,
  label,
  kind: "number",
  min: opts.min ?? 0,
  defaultUnitRial: T(toman),
  hint: opts.hint,
});

const choice = (
  key: string,
  label: string,
  options: ChoiceOption[],
  hint?: string
): EstimatorField => ({
  key,
  label,
  kind: "choice",
  options,
  defaultValue: options[0]?.value,
  hint,
});

export const ESTIMATOR_FIELDS: Record<EstimatorGame, EstimatorField[]> = {
  // ── Call of Duty Mobile ──────────────────────────────────────────────
  // Mirrors the exact vg-store fields (9 item fields) + region & security
  // modifiers that strongly drive real market price.
  cod_mobile: [
    num("level", "لول اکانت", 1000, { min: 50, hint: "حداقل لول ۵۰ · هر لول" }),
    num("cp", "تعداد CP", 20, { min: 0, hint: "سی‌پی باقی‌مانده · هر CP" }),
    num("gun_epic", "تعداد گان اپیک (کادر بنفش)", 8000, { min: 0, hint: "حداقل ۵ گان اپیک" }),
    num("gun_legendary_free", "تعداد گان لجندری رایگان (کادر طلایی)", 15000, { min: 0 }),
    num("gun_legendary_paid", "تعداد گان لجندری غیررایگان (کادر طلایی)", 45000, { min: 0 }),
    num("gun_mythic", "تعداد گان متیک غیررایگان (کادر قرمز)", 120000, { min: 0 }),
    num("skin_epic", "تعداد اسکین اپیک (لباس کادر بنفش)", 6000, { min: 0 }),
    num("skin_legendary", "تعداد اسکین لجندری (لباس کادر طلایی)", 25000, { min: 0 }),
    num("skin_mythic", "تعداد اسکین متیک (لباس کادر قرمز)", 90000, { min: 0 }),
    choice(
      "region",
      "ریجن اکانت",
      [
        { value: "global", label: "گلوبال (Activision)", multiplier: 1.0 },
        { value: "india", label: "هند (خوش‌فروش‌تر)", multiplier: 1.08 },
        { value: "garena", label: "گارنا (Garena)", multiplier: 0.85 },
      ],
      "ریجن هند معمولاً خوش‌فروش‌تر است"
    ),
    choice(
      "security",
      "وضعیت امنیت/سیو",
      [
        { value: "raw_gmail", label: "جیمیل خام / تک‌سیو امن", multiplier: 1.0 },
        { value: "two_save", label: "دو سیو", multiplier: 0.8 },
        { value: "three_save", label: "سه سیو یا بیشتر", multiplier: 0.6 },
        { value: "locked_email", label: "ایمیل غیرقابل تغییر", multiplier: 0.55 },
      ],
      "هرچه سیو کمتر و ایمیل قابل تغییر باشد، امن‌تر و گران‌تر"
    ),
  ],

  // ── Clash Royale ─────────────────────────────────────────────────────
  clash_royale: [
    num("king_level", "لول کینگ (King Level)", 25000, { min: 1, hint: "هر لول کینگ" }),
    num("max_cards", "تعداد کارت مکس‌شده (Lvl 15/Elite)", 9000, { min: 0 }),
    num("evolution_cards", "تعداد کارت Evolution", 14000, { min: 0 }),
    num("champion_cards", "تعداد کارت چمپیون باز شده", 12000, { min: 0 }),
    num("legendary_cards", "تعداد کارت لجندری", 5000, { min: 0 }),
    num("trophies", "بیشترین جام (Best Trophy)", 60, { min: 0 }),
    num("emotes", "تعداد ایموت کمیاب", 3000, { min: 0 }),
    num("tower_skins", "تعداد اسکین تاور (Tower Skin)", 9000, { min: 0, hint: "حداکثر ۱۰۰" }),
    num("gems", "تعداد جم باقی‌مانده", 30, { min: 0 }),
  ],

  // ── Fortnite ─────────────────────────────────────────────────────────
  fortnite: [
    num("og_skins", "تعداد اسکین OG/کمیاب", 250000, {
      min: 0,
      hint: "مثل Black Knight، Renegade Raider، Galaxy، Ikonik، Travis Scott",
    }),
    num("old_battlepasses", "تعداد بتل‌پس قدیمی (فصل‌های ابتدایی)", 70000, { min: 0 }),
    num("rare_pickaxes", "تعداد کلنگ کمیاب (Pickaxe)", 15000, { min: 0 }),
    num("rare_emotes", "تعداد ایموت کمیاب (Emote)", 12000, { min: 0 }),
    num("total_skins", "تعداد کل اسکین", 12000, { min: 0 }),
    num("vbucks", "موجودی وی‌باکس (V-Bucks)", 80, { min: 0 }),
    num("level", "لول اکانت", 300, { min: 1, hint: "اثر کم بر قیمت" }),
    choice(
      "full_access",
      "نوع دسترسی",
      [
        { value: "full", label: "فول‌اکسس Epic (قابل تغییر ایمیل)", multiplier: 1.0 },
        { value: "mail_access", label: "میل‌اکسس (ایمیل در دسترس)", multiplier: 0.8 },
        { value: "no_access", label: "بدون دسترسی ایمیل", multiplier: 0.55 },
      ]
    ),
    choice(
      "platform",
      "قابلیت لینک پلتفرم",
      [
        { value: "psn_linkable", label: "قابل لینک به PSN/Xbox", multiplier: 1.0 },
        { value: "no_psn", label: "بدون قابلیت لینک PSN", multiplier: 0.55 },
      ],
      "خریدار ایرانی اغلب PS دارد؛ نبود لینک PSN قیمت را پایین می‌آورد"
    ),
  ],
};

export function isEstimatorGame(value: string): value is EstimatorGame {
  return value === "cod_mobile" || value === "clash_royale" || value === "fortnite";
}

export function getFieldDef(game: EstimatorGame, key: string): EstimatorField | undefined {
  return ESTIMATOR_FIELDS[game].find((f) => f.key === key);
}

/** Resolve the multiplier for a selected choice value (defaults to 1 / chosen default). */
function resolveMultiplier(field: EstimatorField, selected: string | undefined): number {
  if (field.kind !== "choice" || !field.options?.length) return 1;
  const value = selected ?? field.defaultValue;
  const opt = field.options.find((o) => o.value === value) ?? field.options[0];
  return opt?.multiplier ?? 1;
}

/**
 * Compute the estimated price (in RIAL) from entered values and a resolved
 * per-field RIAL unit-price map (admin overrides + defaults).
 *
 * `values` may contain numbers (for number fields) and strings (selected
 * option values for choice fields). Number fields are summed (count * unit);
 * choice fields multiply the running total.
 */
export function computeEstimate(
  game: EstimatorGame,
  values: Record<string, number | string>,
  unitPrices: Record<string, bigint>
): bigint {
  // Additive part (number fields).
  let total = 0;
  for (const field of ESTIMATOR_FIELDS[game]) {
    if (field.kind !== "number") continue;
    const raw = Number(values[field.key]);
    const count = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
    if (count <= 0) continue;
    const unit = unitPrices[field.key] ?? BigInt(field.defaultUnitRial ?? 0);
    total += Number(unit) * count;
  }

  // Multiplicative part (choice fields).
  let multiplier = 1;
  for (const field of ESTIMATOR_FIELDS[game]) {
    if (field.kind !== "choice") continue;
    const sel = values[field.key];
    multiplier *= resolveMultiplier(field, typeof sel === "string" ? sel : undefined);
  }

  const result = Math.round(total * multiplier);
  return result < 0 ? BigInt(0) : BigInt(result);
}
