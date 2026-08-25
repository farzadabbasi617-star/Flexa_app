export function hasMeaningfulText(value: unknown, minimum = 80) {
  return String(value || "").replace(/\s+/g, " ").trim().length >= minimum;
}

export function isIndexablePlayerProfile(input: {
  wins: number;
  losses: number;
  isVerified?: boolean | null;
  hasClashRoyale?: boolean | null;
  hasCodMobile?: boolean | null;
  hasFortnite?: boolean | null;
}) {
  const matches = Math.max(0, input.wins) + Math.max(0, input.losses);
  const linkedGame = Boolean(input.hasClashRoyale || input.hasCodMobile || input.hasFortnite);
  return matches > 0 || (Boolean(input.isVerified) && linkedGame);
}

export function isIndexableTournament(input: {
  status: string;
  name: string;
  description?: string | null;
  rules?: string | null;
  startDate?: Date | string | null;
}) {
  if (input.status === "cancelled") return false;
  if (String(input.name || "").trim().length < 5) return false;
  return Boolean(input.startDate || hasMeaningfulText(input.description, 60) || hasMeaningfulText(input.rules, 80));
}

export function isIndexableStoreListing(input: {
  status: string;
  title: string;
  description?: string | null;
  images?: unknown;
  stock?: number | null;
  metadata?: unknown;
}) {
  if (input.status !== "active" || (input.stock ?? 0) <= 0) return false;
  if (String(input.title || "").trim().length < 5) return false;
  const images = Array.isArray(input.images) ? input.images.filter((image) => typeof image === "string" && image.length > 0) : [];
  const hasMetadata = Boolean(input.metadata && typeof input.metadata === "object" && Object.keys(input.metadata as object).length);
  return hasMeaningfulText(input.description, 50) || images.length > 0 || hasMetadata;
}

export function isIndexableCodRoom(input: {
  isPublished: boolean;
  status: string;
  title: string;
  description?: string | null;
  rules?: string | null;
  startsAt?: Date | string | null;
}) {
  if (!input.isPublished || input.status === "draft" || input.status === "cancelled") return false;
  if (String(input.title || "").trim().length < 5) return false;
  return Boolean(input.startsAt && (hasMeaningfulText(input.description, 50) || hasMeaningfulText(input.rules, 80)));
}

export function isIndexableTeam(input: {
  name: string;
  description?: string | null;
  memberCount: number;
}) {
  return String(input.name || "").trim().length >= 3 &&
    (hasMeaningfulText(input.description, 40) || input.memberCount >= 2);
}

export function isIndexableHonor(input: {
  status: string;
  title: string;
  description: string;
  source?: string | null;
  publishedAt?: Date | string | null;
  createdAt?: Date | string | null;
}) {
  if (input.status !== "approved") return false;
  if (String(input.title || "").trim().length < 8 || !hasMeaningfulText(input.description, 100)) return false;
  if (input.source !== "ai_news") return true;

  const published = new Date(input.publishedAt || input.createdAt || 0).getTime();
  return Number.isFinite(published) && published >= Date.now() - 7 * 24 * 60 * 60 * 1000;
}
