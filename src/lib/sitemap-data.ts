import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  codRooms,
  honors,
  players,
  storeListings,
  teamMembers,
  teams,
  tournaments,
  users,
} from "@/db/schema";
import { gameLandings } from "@/lib/game-landing";
import { PROGRAMMATIC_SEO_PAGES, programmaticPath } from "@/lib/programmatic-seo";

export const SITEMAP_PAGE_SIZE = 10_000;
export const SITEMAP_KINDS = ["tournaments", "players", "store", "cod-arena", "honors", "teams"] as const;
export type SitemapKind = (typeof SITEMAP_KINDS)[number];

export type SitemapEntry = {
  path: string;
  lastModified?: Date | string | null;
  changeFrequency?: "hourly" | "daily" | "weekly" | "monthly" | "yearly";
  priority?: number;
};

const tournamentCondition = and(
  ne(tournaments.status, "cancelled"),
  sql`length(trim(${tournaments.name})) >= 5`,
  sql`(
    ${tournaments.startDate} IS NOT NULL
    OR length(trim(COALESCE(${tournaments.description}, ''))) >= 60
    OR length(trim(COALESCE(${tournaments.rules}, ''))) >= 80
  )`,
);

const playerCondition = sql`(
  (${players.wins} + ${players.losses}) > 0
  OR (
    COALESCE(${users.isVerified}, false) = true
    AND (${users.clashRoyaleId} IS NOT NULL OR ${users.codMobileId} IS NOT NULL OR ${users.fortniteId} IS NOT NULL)
  )
)`;

const storeCondition = and(
  eq(storeListings.status, "active"),
  sql`${storeListings.stock} > 0`,
  sql`length(trim(${storeListings.title})) >= 5`,
  sql`(
    length(trim(COALESCE(${storeListings.description}, ''))) >= 50
    OR (jsonb_typeof(${storeListings.images}) = 'array' AND jsonb_array_length(${storeListings.images}) > 0)
    OR (${storeListings.metadata} IS NOT NULL AND ${storeListings.metadata} <> '{}'::jsonb)
  )`,
);

const codRoomCondition = and(
  eq(codRooms.isPublished, true),
  sql`${codRooms.status} NOT IN ('draft', 'cancelled')`,
  sql`length(trim(${codRooms.title})) >= 5`,
  sql`${codRooms.startsAt} IS NOT NULL`,
  sql`(
    length(trim(COALESCE(${codRooms.description}, ''))) >= 50
    OR length(trim(COALESCE(${codRooms.rules}, ''))) >= 80
  )`,
);

const honorCondition = and(
  eq(honors.status, "approved"),
  sql`length(trim(${honors.title})) >= 8`,
  sql`length(trim(${honors.description})) >= 100`,
  sql`(
    ${honors.source} <> 'ai_news'
    OR COALESCE(${honors.publishedAt}, ${honors.createdAt}) >= NOW() - INTERVAL '7 days'
  )`,
);

const teamCondition = and(
  sql`length(trim(${teams.name})) >= 3`,
  sql`(
    length(trim(COALESCE(${teams.description}, ''))) >= 40
    OR EXISTS (SELECT 1 FROM ${teamMembers} member WHERE member.team_id = ${teams.id} OFFSET 1 LIMIT 1)
  )`,
);

export function isSitemapKind(value: string): value is SitemapKind {
  return (SITEMAP_KINDS as readonly string[]).includes(value);
}

export function getStaticSitemapEntries(): SitemapEntry[] {
  const publicPages: SitemapEntry[] = [
    { path: "/", changeFrequency: "daily", priority: 1 },
    { path: "/tournaments", changeFrequency: "hourly", priority: 0.95 },
    { path: "/cod-arena", changeFrequency: "hourly", priority: 0.95 },
    { path: "/store", changeFrequency: "hourly", priority: 0.9 },
    { path: "/leaderboard", changeFrequency: "daily", priority: 0.9 },
    { path: "/players", changeFrequency: "daily", priority: 0.8 },
    { path: "/teams", changeFrequency: "daily", priority: 0.75 },
    { path: "/honors", changeFrequency: "daily", priority: 0.85 },
    { path: "/games", changeFrequency: "weekly", priority: 0.85 },
    { path: "/guide/tournaments", changeFrequency: "monthly", priority: 0.75 },
    { path: "/guide/wallet", changeFrequency: "monthly", priority: 0.65 },
    { path: "/store/price-estimate", changeFrequency: "weekly", priority: 0.7 },
    { path: "/achievements", changeFrequency: "weekly", priority: 0.6 },
    { path: "/judging", changeFrequency: "monthly", priority: 0.6 },
    { path: "/media-partners", changeFrequency: "monthly", priority: 0.55 },
    { path: "/about", changeFrequency: "monthly", priority: 0.55 },
    { path: "/faq", changeFrequency: "monthly", priority: 0.55 },
    { path: "/rules", changeFrequency: "monthly", priority: 0.5 },
    { path: "/contact", changeFrequency: "yearly", priority: 0.4 },
  ];

  const gamePages = gameLandings.map<SitemapEntry>((game) => ({
    path: `/games/${game.slug}`,
    changeFrequency: "weekly",
    priority: 0.85,
  }));
  const programmaticPages = PROGRAMMATIC_SEO_PAGES.map<SitemapEntry>((page) => ({
    path: programmaticPath(page),
    changeFrequency: page.cluster === "tournaments" || page.cluster === "store" ? "daily" : "weekly",
    priority: page.cluster === "guides" ? 0.78 : 0.82,
  }));

  const unique = new Map<string, SitemapEntry>();
  for (const entry of [...publicPages, ...gamePages, ...programmaticPages]) unique.set(entry.path, entry);
  return [...unique.values()];
}

async function countRows(kind: SitemapKind): Promise<number> {
  if (kind === "tournaments") {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(tournaments).where(tournamentCondition);
    return Number(row?.count || 0);
  }
  if (kind === "players") {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(players).leftJoin(users, eq(players.visibleUserId, users.id)).where(playerCondition);
    return Number(row?.count || 0);
  }
  if (kind === "store") {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(storeListings).where(storeCondition);
    return Number(row?.count || 0);
  }
  if (kind === "cod-arena") {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(codRooms).where(codRoomCondition);
    return Number(row?.count || 0);
  }
  if (kind === "honors") {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(honors).where(honorCondition);
    return Number(row?.count || 0);
  }
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(teams).where(teamCondition);
  return Number(row?.count || 0);
}

export async function getSitemapShardCounts(): Promise<Record<SitemapKind, number>> {
  const pairs = await Promise.all(SITEMAP_KINDS.map(async (kind) => {
    const count = await countRows(kind);
    return [kind, Math.ceil(count / SITEMAP_PAGE_SIZE)] as const;
  }));
  return Object.fromEntries(pairs) as Record<SitemapKind, number>;
}

export async function getSitemapEntries(kind: SitemapKind, page: number): Promise<SitemapEntry[]> {
  const offset = page * SITEMAP_PAGE_SIZE;
  if (kind === "tournaments") {
    const rows = await db.select({ id: tournaments.id, updatedAt: tournaments.updatedAt }).from(tournaments)
      .where(tournamentCondition).orderBy(asc(tournaments.id)).limit(SITEMAP_PAGE_SIZE).offset(offset);
    return rows.map((row) => ({ path: `/tournaments/${row.id}`, lastModified: row.updatedAt, changeFrequency: "daily", priority: 0.82 }));
  }
  if (kind === "players") {
    const rows = await db.select({ id: players.id, createdAt: players.createdAt }).from(players)
      .leftJoin(users, eq(players.visibleUserId, users.id)).where(playerCondition).orderBy(asc(players.id)).limit(SITEMAP_PAGE_SIZE).offset(offset);
    return rows.map((row) => ({ path: `/players/${row.id}`, lastModified: row.createdAt, changeFrequency: "weekly", priority: 0.67 }));
  }
  if (kind === "store") {
    const rows = await db.select({ id: storeListings.id, updatedAt: storeListings.updatedAt }).from(storeListings)
      .where(storeCondition).orderBy(asc(storeListings.id)).limit(SITEMAP_PAGE_SIZE).offset(offset);
    return rows.map((row) => ({ path: `/store/${row.id}`, lastModified: row.updatedAt, changeFrequency: "daily", priority: 0.78 }));
  }
  if (kind === "cod-arena") {
    const rows = await db.select({ id: codRooms.id, updatedAt: codRooms.updatedAt }).from(codRooms)
      .where(codRoomCondition).orderBy(asc(codRooms.id)).limit(SITEMAP_PAGE_SIZE).offset(offset);
    return rows.map((row) => ({ path: `/cod-arena/${row.id}`, lastModified: row.updatedAt, changeFrequency: "hourly", priority: 0.86 }));
  }
  if (kind === "honors") {
    const rows = await db.select({ id: honors.id, updatedAt: honors.updatedAt }).from(honors)
      .where(honorCondition).orderBy(asc(honors.id)).limit(SITEMAP_PAGE_SIZE).offset(offset);
    return rows.map((row) => ({ path: `/honors/${row.id}`, lastModified: row.updatedAt, changeFrequency: "weekly", priority: 0.72 }));
  }
  const rows = await db.select({ id: teams.id, createdAt: teams.createdAt }).from(teams)
    .where(teamCondition).orderBy(asc(teams.id)).limit(SITEMAP_PAGE_SIZE).offset(offset);
  return rows.map((row) => ({ path: `/teams/${row.id}`, lastModified: row.createdAt, changeFrequency: "weekly", priority: 0.65 }));
}
