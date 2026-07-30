export const COD_REGIONS = ["global", "garena"] as const;
export const COD_BR_TEAM_MODES = ["solo", "duo", "squad"] as const;
export const COD_ROOM_STATUSES = [
  "draft",
  "registration",
  "check_in",
  "lobby_open",
  "in_progress",
  "settling",
  "completed",
  "cancelled",
] as const;
export const COD_PLACEMENT_PAYOUTS = ["per_team", "per_entry"] as const;

export type CodRegion = (typeof COD_REGIONS)[number];
export type CodBrTeamMode = (typeof COD_BR_TEAM_MODES)[number];
export type CodRoomStatus = (typeof COD_ROOM_STATUSES)[number];
export type CodPlacementPayout = (typeof COD_PLACEMENT_PAYOUTS)[number];

export interface CodPlacementRewardRule {
  from: number;
  to: number;
  amountRial: string;
}

/**
 * Diminishing per-kill payout, e.g. 1st kill 100k toman, 2nd 50k, 3rd 25k...
 * The infinite sum converges to `firstKillRial * divisor / (divisor - 1)`, which
 * is what makes this model safe to offer with a high headline number.
 */
export interface CodKillLadderConfig {
  firstKillRial: string;
  divisor: number;
  minKillRial: string;
}

export interface CodRewardConfig {
  perKillRial: string;
  participationRial: string;
  maxKillsPerEntry: number;
  /** Room-wide ceiling on scoring kills. 0 derives it from capacity * maxKillsPerEntry. */
  maxTotalKills: number;
  placementRules: CodPlacementRewardRule[];
  /**
   * `per_team` treats a placement amount as the prize for the whole squad and splits
   * it between the players that actually finished in that placement. `per_entry`
   * pays the full amount to every single player.
   */
  placementPayout: CodPlacementPayout;
  killLadder: CodKillLadderConfig | null;
}

export const DEFAULT_COD_REWARD_CONFIG: CodRewardConfig = {
  perKillRial: "0",
  participationRial: "0",
  maxKillsPerEntry: 40,
  maxTotalKills: 0,
  placementRules: [],
  placementPayout: "per_team",
  killLadder: null,
};

function nonNegativeMoney(value: unknown, field: string) {
  const normalized = String(value ?? "0").trim();
  if (!/^\d+$/.test(normalized)) throw new Error(`${field} باید عدد صحیح و غیرمنفی باشد`);
  return BigInt(normalized).toString();
}

function boundedInteger(value: unknown, min: number, max: number, field: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${field} باید بین ${min} و ${max} باشد`);
  }
  return parsed;
}

function normalizeKillLadder(input: unknown): CodKillLadderConfig | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const firstKillRial = nonNegativeMoney(raw.firstKillRial, "جایزه اولین Kill");
  if (BigInt(firstKillRial) === BigInt(0)) return null;
  return {
    firstKillRial,
    divisor: boundedInteger(raw.divisor ?? 2, 2, 10, "ضریب کاهش نردبان Kill"),
    minKillRial: nonNegativeMoney(raw.minKillRial, "کف جایزه هر Kill"),
  };
}

export function normalizeCodRewardConfig(input: unknown): CodRewardConfig {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const rulesInput = Array.isArray(raw.placementRules) ? raw.placementRules : [];
  const placementRules = rulesInput.map((item, index) => {
    const rule = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const from = boundedInteger(rule.from, 1, 100, `شروع جایگاه ${index + 1}`);
    const to = boundedInteger(rule.to ?? rule.from, from, 100, `پایان جایگاه ${index + 1}`);
    return {
      from,
      to,
      amountRial: nonNegativeMoney(rule.amountRial, `جایزه جایگاه ${index + 1}`),
    };
  }).sort((a, b) => a.from - b.from);

  for (let index = 1; index < placementRules.length; index += 1) {
    if (placementRules[index].from <= placementRules[index - 1].to) {
      throw new Error("بازه‌های جایزه جایگاه نباید هم‌پوشانی داشته باشند");
    }
  }

  const placementPayoutRaw = String(raw.placementPayout ?? "per_team");
  if (!(COD_PLACEMENT_PAYOUTS as readonly string[]).includes(placementPayoutRaw)) {
    throw new Error("نوع پرداخت جایزه جایگاه معتبر نیست");
  }

  return {
    perKillRial: nonNegativeMoney(raw.perKillRial, "جایزه هر Kill"),
    participationRial: nonNegativeMoney(raw.participationRial, "جایزه حضور"),
    maxKillsPerEntry: boundedInteger(raw.maxKillsPerEntry ?? 40, 1, 100, "سقف Kill"),
    maxTotalKills: boundedInteger(raw.maxTotalKills ?? 0, 0, 10_000, "سقف Kill کل روم"),
    placementRules,
    placementPayout: placementPayoutRaw as CodPlacementPayout,
    killLadder: normalizeKillLadder(raw.killLadder),
  };
}

/** Total payout for `kills` kills under a halving ladder. */
export function codKillLadderTotalRial(ladder: CodKillLadderConfig, kills: number) {
  const first = BigInt(ladder.firstKillRial);
  const floorRial = BigInt(ladder.minKillRial);
  const divisor = BigInt(ladder.divisor);
  let current = first;
  let total = BigInt(0);
  for (let index = 0; index < kills; index += 1) {
    const payout = current > floorRial ? current : floorRial;
    total += payout;
    current = current / divisor;
  }
  return total;
}

function killRewardRial(config: CodRewardConfig, kills: number) {
  if (config.killLadder) return codKillLadderTotalRial(config.killLadder, kills);
  return BigInt(config.perKillRial) * BigInt(kills);
}

export function calculateCodEntryReward(
  configInput: unknown,
  killsInput: number,
  placementInput?: number | null,
  options: { placementSharers?: number } = {},
) {
  const config = normalizeCodRewardConfig(configInput);
  const kills = boundedInteger(killsInput, 0, config.maxKillsPerEntry, "تعداد Kill");
  const placement = placementInput == null ? null : boundedInteger(placementInput, 1, 100, "جایگاه");
  const killRewardTotal = killRewardRial(config, kills);
  const placementRule = placement == null
    ? undefined
    : config.placementRules.find((rule) => placement >= rule.from && placement <= rule.to);
  const nominalPlacementRial = BigInt(placementRule?.amountRial || "0");
  const sharers = config.placementPayout === "per_team"
    ? BigInt(Math.max(1, Math.floor(Number(options.placementSharers) || 1)))
    : BigInt(1);
  const placementRewardRial = nominalPlacementRial / sharers;
  const participationRewardRial = BigInt(config.participationRial);
  return {
    kills,
    placement,
    killRewardRial: killRewardTotal,
    placementRewardRial,
    participationRewardRial,
    totalRewardRial: killRewardTotal + placementRewardRial + participationRewardRial,
  };
}

function teamSize(mode: CodBrTeamMode) {
  if (mode === "duo") return 2;
  if (mode === "squad") return 4;
  return 1;
}

/**
 * Worst-case kill spend for the room. A diminishing ladder pays the most when kills are
 * spread one-per-player (every kill is somebody's expensive first kill), so the ceiling is
 * the flattest legal distribution of the room-wide kill budget.
 */
export function estimateCodKillLiability(config: CodRewardConfig, capacity: number) {
  const perEntryCeiling = capacity * config.maxKillsPerEntry;
  const totalKills = config.maxTotalKills > 0
    ? Math.min(config.maxTotalKills, perEntryCeiling)
    : perEntryCeiling;
  if (!config.killLadder) return BigInt(config.perKillRial) * BigInt(totalKills);
  const base = Math.floor(totalKills / capacity);
  const remainder = totalKills % capacity;
  return codKillLadderTotalRial(config.killLadder, base + 1) * BigInt(remainder)
    + codKillLadderTotalRial(config.killLadder, base) * BigInt(capacity - remainder);
}

/** Conservative maximum liability used before an operator publishes a room. */
export function estimateCodRoomMaximumLiability(
  configInput: unknown,
  capacityInput: number,
  mode: CodBrTeamMode,
) {
  const config = normalizeCodRewardConfig(configInput);
  const capacity = boundedInteger(capacityInput, 2, 100, "ظرفیت روم");
  const killLiability = estimateCodKillLiability(config, capacity);
  const participationLiability = BigInt(config.participationRial) * BigInt(capacity);
  const membersPerPlacement = teamSize(mode);
  let placementLiability = BigInt(0);
  let rewardedEntries = 0;
  for (const rule of config.placementRules) {
    const available = Math.max(0, capacity - rewardedEntries);
    const positions = rule.to - rule.from + 1;
    const entries = Math.min(available, positions * membersPerPlacement);
    if (config.placementPayout === "per_team") {
      // The amount is the squad prize, so each rewarded squad costs it exactly once.
      const squads = Math.ceil(entries / membersPerPlacement);
      placementLiability += BigInt(rule.amountRial) * BigInt(squads);
    } else {
      placementLiability += BigInt(rule.amountRial) * BigInt(entries);
    }
    rewardedEntries += entries;
  }
  return killLiability + participationLiability + placementLiability;
}

/**
 * Structured match settings. Iranian Call of Duty rooms all publish the same
 * handful of lobby toggles, and burying them in free text means players cannot
 * filter on them and operators mistype them.
 */
export const COD_REVIVE_MODES = ["disabled", "enabled", "auto"] as const;
export const COD_ZONE_SPEEDS = ["slow", "normal", "fast"] as const;

export interface CodMatchSettings {
  revive: (typeof COD_REVIVE_MODES)[number] | null;
  limitedAmmo: boolean | null;
  zoneSpeed: (typeof COD_ZONE_SPEEDS)[number] | null;
  doubleGroundLoot: boolean | null;
  vehiclesEnabled: boolean | null;
}

export function normalizeCodMatchSettings(input: unknown): CodMatchSettings {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const enumOrNull = <T extends readonly string[]>(value: unknown, allowed: T) => {
    const normalized = String(value ?? "").trim();
    return (allowed as readonly string[]).includes(normalized) ? normalized as T[number] : null;
  };
  const boolOrNull = (value: unknown) => (typeof value === "boolean" ? value : null);
  return {
    revive: enumOrNull(raw.revive, COD_REVIVE_MODES),
    limitedAmmo: boolOrNull(raw.limitedAmmo),
    zoneSpeed: enumOrNull(raw.zoneSpeed, COD_ZONE_SPEEDS),
    doubleGroundLoot: boolOrNull(raw.doubleGroundLoot),
    vehiclesEnabled: boolOrNull(raw.vehiclesEnabled),
  };
}

export interface CodFaqEntry {
  question: string;
  answer: string;
}

export function normalizeCodFaq(input: unknown): CodFaqEntry[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      const entry = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        question: String(entry.question ?? "").trim().slice(0, 200),
        answer: String(entry.answer ?? "").trim().slice(0, 4_000),
      };
    })
    .filter((entry) => entry.question.length > 0 && entry.answer.length > 0)
    .slice(0, 20);
}

/**
 * Room key art is rendered full-bleed at the top of the room page, so it must
 * not be an attacker-supplied `javascript:` or `data:` URL. Same-origin paths
 * (our own bundled art) and plain HTTPS URLs are the only things allowed.
 */
export function normalizeCodBannerUrl(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw.slice(0, 500);
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") throw new Error("فقط آدرس HTTPS برای بنر روم مجاز است");
    return url.toString().slice(0, 500);
  } catch (error) {
    if (error instanceof Error && error.message.includes("HTTPS")) throw error;
    throw new Error("آدرس بنر روم معتبر نیست");
  }
}

export function codReferralCommissionRial(serviceFeeRialInput: bigint, referralRateBpsInput: number) {
  const bps = boundedInteger(referralRateBpsInput, 0, 10_000, "درصد کمیسیون معرفی");
  if (serviceFeeRialInput <= BigInt(0) || bps === 0) return BigInt(0);
  return (serviceFeeRialInput * BigInt(bps)) / BigInt(10_000);
}

export function codRankTier(pointsInput: number) {
  const points = Math.max(0, Math.floor(Number(pointsInput) || 0));
  if (points >= 5_000) return "legend";
  if (points >= 3_000) return "ultra";
  if (points >= 1_800) return "pro";
  if (points >= 1_000) return "gold";
  if (points >= 500) return "silver";
  if (points >= 150) return "bronze";
  return "rookie";
}

export function codRankPointsForResult(killsInput: number, placementInput?: number | null) {
  const kills = Math.max(0, Math.min(100, Math.floor(Number(killsInput) || 0)));
  const placement = placementInput == null ? null : Math.max(1, Math.min(100, Math.floor(Number(placementInput) || 100)));
  const placementPoints = placement === 1 ? 120 : placement && placement <= 3 ? 80 : placement && placement <= 10 ? 35 : 0;
  return kills * 10 + placementPoints + 5;
}

const STATUS_TRANSITIONS: Record<CodRoomStatus, CodRoomStatus[]> = {
  draft: ["registration", "cancelled"],
  registration: ["check_in", "cancelled"],
  check_in: ["lobby_open", "cancelled"],
  lobby_open: ["in_progress", "cancelled"],
  in_progress: ["settling", "cancelled"],
  settling: ["completed", "in_progress", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransitionCodRoomStatus(from: CodRoomStatus, to: CodRoomStatus) {
  return from === to || STATUS_TRANSITIONS[from].includes(to);
}

export function isOfficialCodMobileInviteUrl(value: unknown) {
  if (!value) return false;
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && url.hostname.toLowerCase() === "www.callofduty.com" && url.pathname.startsWith("/cdn/codm/teaminvite/");
  } catch {
    return false;
  }
}

export function shouldRevealCodRoomCredentials(input: {
  isAdmin: boolean;
  isRegistered: boolean;
  checkedIn: boolean;
  revealAt: Date | string | null;
  status: CodRoomStatus;
  now?: Date;
}) {
  if (input.isAdmin) return true;
  if (!input.isRegistered || !input.checkedIn) return false;
  if (["lobby_open", "in_progress", "settling", "completed"].includes(input.status)) return true;
  if (!input.revealAt) return false;
  const reveal = new Date(input.revealAt);
  return !Number.isNaN(reveal.getTime()) && (input.now || new Date()).getTime() >= reveal.getTime();
}
