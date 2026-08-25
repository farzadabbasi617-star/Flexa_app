import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  codRooms,
  players,
  storeListings,
  teamMembers,
  teams,
  tournaments,
  users,
} from "@/db/schema";

export type SeoLookup<T> =
  | { state: "found"; data: T }
  | { state: "missing" }
  | { state: "unavailable" };

function uuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export const getTournamentSeoEntity = cache(async (id: string): Promise<SeoLookup<{
  id: string;
  name: string;
  game: "clash_royale" | "cod_mobile" | "fortnite";
  format: "single_elimination" | "double_elimination" | "round_robin";
  status: "registration" | "in_progress" | "completed" | "cancelled";
  description: string | null;
  rules: string | null;
  prizePool: string | null;
  entryFee: string | null;
  maxPlayers: number;
  gameMode: string | null;
  mapName: string | null;
  bannerUrl: string | null;
  startDate: Date | null;
  endDate: Date | null;
  updatedAt: Date;
}>> => {
  if (!uuidLike(id)) return { state: "missing" };
  try {
    const [row] = await db
      .select({
        id: tournaments.id,
        name: tournaments.name,
        game: tournaments.game,
        format: tournaments.format,
        status: tournaments.status,
        description: tournaments.description,
        rules: tournaments.rules,
        prizePool: tournaments.prizePool,
        entryFee: tournaments.entryFee,
        maxPlayers: tournaments.maxPlayers,
        gameMode: tournaments.gameMode,
        mapName: tournaments.mapName,
        bannerUrl: tournaments.bannerUrl,
        startDate: tournaments.startDate,
        endDate: tournaments.endDate,
        updatedAt: tournaments.updatedAt,
      })
      .from(tournaments)
      .where(eq(tournaments.id, id))
      .limit(1);
    return row ? { state: "found", data: row } : { state: "missing" };
  } catch (error) {
    console.error("[SEO] Tournament lookup unavailable", { id, error });
    return { state: "unavailable" };
  }
});

export const getPlayerSeoEntity = cache(async (id: string): Promise<SeoLookup<{
  id: string;
  username: string;
  displayName: string;
  rating: number;
  wins: number;
  losses: number;
  createdAt: Date;
  avatarUrl: string | null;
  gamentId: string | null;
  isVerified: boolean | null;
  bio: string | null;
  hasClashRoyale: boolean;
  hasCodMobile: boolean;
  hasFortnite: boolean;
  clashRoyaleUsername: string | null;
  codMobileUsername: string | null;
  fortniteUsername: string | null;
}>> => {
  if (!uuidLike(id)) return { state: "missing" };
  try {
    const [row] = await db
      .select({
        id: players.id,
        username: players.username,
        displayName: players.displayName,
        rating: players.rating,
        wins: players.wins,
        losses: players.losses,
        createdAt: players.createdAt,
        avatarUrl: users.avatarUrl,
        gamentId: users.gamentId,
        isVerified: users.isVerified,
        bio: users.bio,
        hasClashRoyale: sql<boolean>`${users.clashRoyaleId} IS NOT NULL`,
        hasCodMobile: sql<boolean>`${users.codMobileId} IS NOT NULL`,
        hasFortnite: sql<boolean>`${users.fortniteId} IS NOT NULL`,
        clashRoyaleUsername: users.clashRoyaleUsername,
        codMobileUsername: users.codMobileUsername,
        fortniteUsername: users.fortniteUsername,
      })
      .from(players)
      .leftJoin(users, eq(players.visibleUserId, users.id))
      .where(eq(players.id, id))
      .limit(1);
    return row ? { state: "found", data: row } : { state: "missing" };
  } catch (error) {
    console.error("[SEO] Player lookup unavailable", { id, error });
    return { state: "unavailable" };
  }
});

export const getStoreListingSeoEntity = cache(async (id: string): Promise<SeoLookup<{
  id: string;
  title: string;
  slug: string | null;
  source: "official" | "user";
  kind: "currency" | "account" | "item" | "service";
  game: "clash_royale" | "cod_mobile" | "fortnite" | null;
  description: string | null;
  priceRial: string;
  currencyKind: string | null;
  currencyAmount: number | null;
  stock: number;
  soldCount: number;
  warrantyDays: number;
  status: "draft" | "pending_review" | "active" | "paused" | "sold_out" | "rejected" | "archived";
  images: unknown;
  metadata: unknown;
  sellerName: string | null;
  sellerVerified: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}>> => {
  if (!uuidLike(id)) return { state: "missing" };
  try {
    const [row] = await db
      .select({
        id: storeListings.id,
        title: storeListings.title,
        slug: storeListings.slug,
        source: storeListings.source,
        kind: storeListings.kind,
        game: storeListings.game,
        description: storeListings.description,
        priceRial: storeListings.priceRial,
        currencyKind: storeListings.currencyKind,
        currencyAmount: storeListings.currencyAmount,
        stock: storeListings.stock,
        soldCount: storeListings.soldCount,
        warrantyDays: storeListings.warrantyDays,
        status: storeListings.status,
        images: storeListings.images,
        metadata: storeListings.metadata,
        sellerName: users.displayName,
        sellerVerified: users.isVerified,
        createdAt: storeListings.createdAt,
        updatedAt: storeListings.updatedAt,
      })
      .from(storeListings)
      .leftJoin(users, eq(users.id, storeListings.sellerId))
      .where(eq(storeListings.id, id))
      .limit(1);
    return row ? { state: "found", data: row } : { state: "missing" };
  } catch (error) {
    console.error("[SEO] Store listing lookup unavailable", { id, error });
    return { state: "unavailable" };
  }
});

export const getTeamSeoEntity = cache(async (id: string): Promise<SeoLookup<{
  id: string;
  name: string;
  tag: string;
  logoUrl: string | null;
  description: string | null;
  createdAt: Date;
  ownerName: string | null;
  memberCount: number;
}>> => {
  if (!uuidLike(id)) return { state: "missing" };
  try {
    const [row] = await db
      .select({
        id: teams.id,
        name: teams.name,
        tag: teams.tag,
        logoUrl: teams.logoUrl,
        description: teams.description,
        createdAt: teams.createdAt,
        ownerName: users.displayName,
        memberCount: sql<number>`(SELECT count(*)::int FROM ${teamMembers} WHERE ${teamMembers.teamId} = ${teams.id})`,
      })
      .from(teams)
      .leftJoin(users, eq(users.id, teams.ownerId))
      .where(eq(teams.id, id))
      .limit(1);
    return row ? { state: "found", data: row } : { state: "missing" };
  } catch (error) {
    console.error("[SEO] Team lookup unavailable", { id, error });
    return { state: "unavailable" };
  }
});

export const getCodRoomSeoEntity = cache(async (id: string): Promise<SeoLookup<{
  id: string;
  title: string;
  description: string | null;
  region: string;
  map: string;
  teamMode: string;
  perspective: string;
  status: string;
  isPublished: boolean;
  capacity: number;
  entryFeeRial: string;
  prizeBudgetRial: string;
  bannerImageUrl: string | null;
  category: string | null;
  rules: string | null;
  faq: unknown;
  startsAt: Date;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>> => {
  if (!uuidLike(id)) return { state: "missing" };
  try {
    // Deliberately exclude roomCode, roomPassword and officialJoinUrl from this
    // public SEO projection. Structured data must never leak lobby credentials.
    const [row] = await db
      .select({
        id: codRooms.id,
        title: codRooms.title,
        description: codRooms.description,
        region: codRooms.region,
        map: codRooms.map,
        teamMode: codRooms.teamMode,
        perspective: codRooms.perspective,
        status: codRooms.status,
        isPublished: codRooms.isPublished,
        capacity: codRooms.capacity,
        entryFeeRial: codRooms.entryFeeRial,
        prizeBudgetRial: codRooms.prizeBudgetRial,
        bannerImageUrl: codRooms.bannerImageUrl,
        category: codRooms.category,
        rules: codRooms.rules,
        faq: codRooms.faq,
        startsAt: codRooms.startsAt,
        endsAt: codRooms.endsAt,
        createdAt: codRooms.createdAt,
        updatedAt: codRooms.updatedAt,
      })
      .from(codRooms)
      .where(eq(codRooms.id, id))
      .limit(1);
    return row ? { state: "found", data: row } : { state: "missing" };
  } catch (error) {
    console.error("[SEO] COD room lookup unavailable", { id, error });
    return { state: "unavailable" };
  }
});
