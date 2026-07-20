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

export type CodRegion = (typeof COD_REGIONS)[number];
export type CodBrTeamMode = (typeof COD_BR_TEAM_MODES)[number];
export type CodRoomStatus = (typeof COD_ROOM_STATUSES)[number];

export interface CodPlacementRewardRule {
  from: number;
  to: number;
  amountRial: string;
}

export interface CodRewardConfig {
  perKillRial: string;
  participationRial: string;
  maxKillsPerEntry: number;
  placementRules: CodPlacementRewardRule[];
  placementPayout: "per_entry";
}

export const DEFAULT_COD_REWARD_CONFIG: CodRewardConfig = {
  perKillRial: "0",
  participationRial: "0",
  maxKillsPerEntry: 40,
  placementRules: [],
  placementPayout: "per_entry",
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

  return {
    perKillRial: nonNegativeMoney(raw.perKillRial, "جایزه هر Kill"),
    participationRial: nonNegativeMoney(raw.participationRial, "جایزه حضور"),
    maxKillsPerEntry: boundedInteger(raw.maxKillsPerEntry ?? 40, 1, 100, "سقف Kill"),
    placementRules,
    placementPayout: "per_entry",
  };
}

export function calculateCodEntryReward(configInput: unknown, killsInput: number, placementInput?: number | null) {
  const config = normalizeCodRewardConfig(configInput);
  const kills = boundedInteger(killsInput, 0, config.maxKillsPerEntry, "تعداد Kill");
  const placement = placementInput == null ? null : boundedInteger(placementInput, 1, 100, "جایگاه");
  const killRewardRial = BigInt(config.perKillRial) * BigInt(kills);
  const placementRule = placement == null
    ? undefined
    : config.placementRules.find((rule) => placement >= rule.from && placement <= rule.to);
  const placementRewardRial = BigInt(placementRule?.amountRial || "0");
  const participationRewardRial = BigInt(config.participationRial);
  return {
    kills,
    placement,
    killRewardRial,
    placementRewardRial,
    participationRewardRial,
    totalRewardRial: killRewardRial + placementRewardRial + participationRewardRial,
  };
}

function teamSize(mode: CodBrTeamMode) {
  if (mode === "duo") return 2;
  if (mode === "squad") return 4;
  return 1;
}

/** Conservative maximum liability used before an operator publishes a room. */
export function estimateCodRoomMaximumLiability(
  configInput: unknown,
  capacityInput: number,
  mode: CodBrTeamMode,
) {
  const config = normalizeCodRewardConfig(configInput);
  const capacity = boundedInteger(capacityInput, 2, 100, "ظرفیت روم");
  const killLiability = BigInt(config.perKillRial) * BigInt(config.maxKillsPerEntry) * BigInt(capacity);
  const participationLiability = BigInt(config.participationRial) * BigInt(capacity);
  const membersPerPlacement = teamSize(mode);
  let placementLiability = BigInt(0);
  let rewardedEntries = 0;
  for (const rule of config.placementRules) {
    const available = Math.max(0, capacity - rewardedEntries);
    const positions = rule.to - rule.from + 1;
    const entries = Math.min(available, positions * membersPerPlacement);
    placementLiability += BigInt(rule.amountRial) * BigInt(entries);
    rewardedEntries += entries;
  }
  return killLiability + participationLiability + placementLiability;
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
