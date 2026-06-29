// Price estimator field definitions + default unit prices (in RIAL) per game.
// Admins can override unit prices via the price_estimator_rates table; these
// defaults are used as a fallback when no override exists.

export type EstimatorGame = "cod_mobile" | "clash_royale" | "fortnite";

export interface EstimatorField {
  key: string;
  label: string;
  /** Minimum acceptable value (e.g. account level >= 1). */
  min: number;
  /** Default unit price in RIAL per unit (used when no admin override). */
  defaultUnitRial: number;
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

export const ESTIMATOR_FIELDS: Record<EstimatorGame, EstimatorField[]> = {
  cod_mobile: [
    { key: "level", label: "لول اکانت", min: 1, defaultUnitRial: T(1000), hint: "هر لول" },
    { key: "cp", label: "تعداد CP", min: 0, defaultUnitRial: T(20), hint: "هر CP باقی‌مانده" },
    { key: "gun_epic", label: "گان اپیک (کادر بنفش)", min: 0, defaultUnitRial: T(8000) },
    { key: "gun_legendary_free", label: "گان لجندری رایگان", min: 0, defaultUnitRial: T(15000) },
    { key: "gun_legendary_paid", label: "گان لجندری غیررایگان", min: 0, defaultUnitRial: T(45000) },
    { key: "gun_mythic", label: "گان متیک (کادر قرمز)", min: 0, defaultUnitRial: T(120000) },
    { key: "skin_epic", label: "اسکین اپیک (کادر بنفش)", min: 0, defaultUnitRial: T(6000) },
    { key: "skin_legendary", label: "اسکین لجندری (کادر طلایی)", min: 0, defaultUnitRial: T(25000) },
    { key: "skin_mythic", label: "اسکین متیک (کادر قرمز)", min: 0, defaultUnitRial: T(90000) },
  ],
  clash_royale: [
    { key: "king_level", label: "لول کینگ", min: 1, defaultUnitRial: T(20000), hint: "هر لول کینگ" },
    { key: "trophies", label: "تعداد جام (Trophy)", min: 0, defaultUnitRial: T(50) },
    { key: "max_cards", label: "تعداد کارت مکس‌شده", min: 0, defaultUnitRial: T(8000) },
    { key: "legendary_cards", label: "تعداد کارت لجندری", min: 0, defaultUnitRial: T(5000) },
    { key: "champion_cards", label: "تعداد کارت چمپیون", min: 0, defaultUnitRial: T(12000) },
    { key: "emotes", label: "تعداد ایموت", min: 0, defaultUnitRial: T(2000) },
    { key: "gems", label: "تعداد جم باقی‌مانده", min: 0, defaultUnitRial: T(30) },
  ],
  fortnite: [
    { key: "level", label: "لول اکانت", min: 1, defaultUnitRial: T(1500) },
    { key: "vbucks", label: "موجودی وی‌باکس (V-Bucks)", min: 0, defaultUnitRial: T(80) },
    { key: "skins", label: "تعداد اسکین", min: 0, defaultUnitRial: T(20000) },
    { key: "rare_skins", label: "تعداد اسکین کمیاب/OG", min: 0, defaultUnitRial: T(120000) },
    { key: "pickaxes", label: "تعداد کلنگ (Pickaxe)", min: 0, defaultUnitRial: T(8000) },
    { key: "emotes", label: "تعداد ایموت/دنس", min: 0, defaultUnitRial: T(6000) },
    { key: "battlepass_seasons", label: "تعداد فصل بتل‌پس", min: 0, defaultUnitRial: T(50000) },
  ],
};

export function isEstimatorGame(value: string): value is EstimatorGame {
  return value === "cod_mobile" || value === "clash_royale" || value === "fortnite";
}

export function getFieldDef(game: EstimatorGame, key: string): EstimatorField | undefined {
  return ESTIMATOR_FIELDS[game].find((f) => f.key === key);
}

/**
 * Compute the estimated price (in RIAL) from entered field counts and a
 * resolved per-field unit-price map (RIAL). Falls back to field defaults when
 * a unit price is not provided.
 */
export function computeEstimate(
  game: EstimatorGame,
  values: Record<string, number>,
  unitPrices: Record<string, bigint>
): bigint {
  let total = BigInt(0);
  for (const field of ESTIMATOR_FIELDS[game]) {
    const raw = values[field.key];
    const count = Number.isFinite(raw) ? Math.max(field.min <= 0 ? 0 : 0, Math.floor(raw)) : 0;
    if (count <= 0) continue;
    const unit = unitPrices[field.key] ?? BigInt(field.defaultUnitRial);
    total += unit * BigInt(count);
  }
  return total < BigInt(0) ? BigInt(0) : total;
}
