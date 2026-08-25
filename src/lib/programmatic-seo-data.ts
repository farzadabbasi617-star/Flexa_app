import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { ProgrammaticSeoPage } from "@/lib/programmatic-seo";
import { gameNamesFa } from "@/lib/seo";

export type ProgrammaticLiveItem = {
  id: string;
  title: string;
  href: string;
  eyebrow: string;
  description: string;
  metric?: string;
  image?: string | null;
  updatedAt?: Date | null;
};

export type ProgrammaticLiveData = {
  items: ProgrammaticLiveItem[];
  total: number;
  fetchedAt: Date | null;
  available: boolean;
};

const EMPTY: ProgrammaticLiveData = { items: [], total: 0, fetchedAt: null, available: false };

function duringProductionBuild() {
  return process.env.NEXT_PHASE === "phase-production-build";
}

function normalize(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase("en-US");
}

function isFreeEntry(value: unknown) {
  const normalized = normalize(value).replace(/[\s,_٬]/g, "");
  return !normalized || normalized === "0" || normalized.includes("رایگان") || normalized === "free";
}

function modeMatches(value: unknown, terms: string[] | undefined) {
  if (!terms?.length) return true;
  const normalized = normalize(value);
  return terms.some((term) => normalized.includes(normalize(term)));
}

function tomanFromRial(value: unknown) {
  try {
    return `${(BigInt(String(value || "0")) / BigInt(10)).toLocaleString("fa-IR")} تومان`;
  } catch {
    return "قیمت نامشخص";
  }
}

async function tournamentItems(pageDefinition: ProgrammaticSeoPage): Promise<ProgrammaticLiveData> {
  const [{ db }, schema] = await Promise.all([import("@/db"), import("@/db/schema")]);
  const {
    tournaments,
    registrations,
    codRooms,
    codRoomEntries,
    matches,
    players,
    privateTournamentStandings,
  } = schema;
  const filter = pageDefinition.dataFilter.source === "tournaments" ? pageDefinition.dataFilter : null;

  const tournamentRows = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      status: tournaments.status,
      gameMode: tournaments.gameMode,
      categoryLabel: tournaments.categoryLabel,
      entryFee: tournaments.entryFee,
      prizePool: tournaments.prizePool,
      maxPlayers: tournaments.maxPlayers,
      startDate: tournaments.startDate,
      description: tournaments.description,
      bannerUrl: tournaments.bannerUrl,
      updatedAt: tournaments.updatedAt,
      registeredCount: sql<number>`count(${registrations.id})::int`,
    })
    .from(tournaments)
    .leftJoin(registrations, eq(registrations.tournamentId, tournaments.id))
    .where(and(
      eq(tournaments.game, pageDefinition.gameId),
      sql`${tournaments.status} <> 'cancelled'`,
      sql`length(trim(${tournaments.name})) >= 5`,
      sql`(
        ${tournaments.startDate} IS NOT NULL
        OR length(trim(COALESCE(${tournaments.description}, ''))) >= 60
        OR length(trim(COALESCE(${tournaments.rules}, ''))) >= 80
      )`,
      ...(filter?.completedOnly ? [eq(tournaments.status, "completed")] : []),
    ))
    .groupBy(tournaments.id)
    .orderBy(desc(tournaments.updatedAt))
    .limit(80);

  const filteredTournaments = tournamentRows.filter((row) => {
    if (filter?.freeOnly && !isFreeEntry(row.entryFee)) return false;
    if (filter?.completedOnly && row.status !== "completed") return false;
    if (filter?.modeTerms?.length && !modeMatches(`${row.gameMode || ""} ${row.categoryLabel || ""} ${row.name}`, filter.modeTerms)) return false;
    return row.status !== "cancelled";
  });

  // Result pages name a winner only when a first-party result record supports
  // it. Verified leaderboard rank 1 takes precedence; otherwise the most
  // advanced completed bracket match is described conservatively as the last
  // recorded match winner rather than being promoted to an invented champion.
  const tournamentResultLabels = new Map<string, string>();
  if (filter?.completedOnly && filteredTournaments.length) {
    const tournamentIds = filteredTournaments.map((row) => row.id);
    const standingWinners = await db
      .select({
        tournamentId: privateTournamentStandings.tournamentId,
        playerName: privateTournamentStandings.playerName,
      })
      .from(privateTournamentStandings)
      .where(and(
        inArray(privateTournamentStandings.tournamentId, tournamentIds),
        eq(privateTournamentStandings.rank, 1),
        eq(privateTournamentStandings.verified, true),
      ))
      .orderBy(desc(privateTournamentStandings.updatedAt));
    for (const standing of standingWinners) {
      if (!tournamentResultLabels.has(standing.tournamentId)) {
        tournamentResultLabels.set(standing.tournamentId, `رتبه اول تأییدشده: ${standing.playerName}`);
      }
    }

    const completedMatchWinners = await db
      .select({
        tournamentId: matches.tournamentId,
        round: matches.round,
        matchNumber: matches.matchNumber,
        playerName: players.displayName,
      })
      .from(matches)
      .innerJoin(players, eq(matches.winnerId, players.id))
      .where(and(
        inArray(matches.tournamentId, tournamentIds),
        eq(matches.status, "completed"),
        isNotNull(matches.winnerId),
      ))
      .orderBy(desc(matches.round), desc(matches.matchNumber));
    for (const match of completedMatchWinners) {
      if (!tournamentResultLabels.has(match.tournamentId)) {
        tournamentResultLabels.set(match.tournamentId, `برنده آخرین مسابقه ثبت‌شده: ${match.playerName}`);
      }
    }
  }

  const items: ProgrammaticLiveItem[] = filteredTournaments.slice(0, 8).map((row) => ({
    id: row.id,
    title: row.name,
    href: `/tournaments/${row.id}`,
    eyebrow: `${gameNamesFa[pageDefinition.gameId]} · ${row.status}`,
    description: row.description?.trim().slice(0, 180) || `${row.registeredCount.toLocaleString("fa-IR")} بازیکن از ظرفیت ${row.maxPlayers.toLocaleString("fa-IR")}`,
    metric: tournamentResultLabels.get(row.id) || (filter?.completedOnly
      ? "مسابقه پایان‌یافته؛ جزئیات نتیجه در صفحه رویداد"
      : `${row.entryFee || "رایگان"}${row.prizePool ? ` · جایزه ${row.prizePool}` : ""}`),
    image: row.bannerUrl,
    updatedAt: row.updatedAt,
  }));

  // COD Arena uses its own hardened room engine. Surface those published rooms
  // on COD programmatic pages as well as legacy tournaments, without ever
  // selecting roomCode, password or other private lobby credentials.
  if (pageDefinition.gameId === "cod_mobile") {
    const roomRows = await db
      .select({
        id: codRooms.id,
        title: codRooms.title,
        description: codRooms.description,
        status: codRooms.status,
        teamMode: codRooms.teamMode,
        map: codRooms.map,
        region: codRooms.region,
        capacity: codRooms.capacity,
        entryFeeRial: codRooms.entryFeeRial,
        prizeBudgetRial: codRooms.prizeBudgetRial,
        bannerImageUrl: codRooms.bannerImageUrl,
        startsAt: codRooms.startsAt,
        updatedAt: codRooms.updatedAt,
        registeredCount: sql<number>`count(${codRoomEntries.id})::int`,
      })
      .from(codRooms)
      .leftJoin(codRoomEntries, eq(codRoomEntries.roomId, codRooms.id))
      .where(and(
        eq(codRooms.isPublished, true),
        sql`${codRooms.status} NOT IN ('draft', 'cancelled')`,
        sql`length(trim(${codRooms.title})) >= 5`,
        sql`${codRooms.startsAt} IS NOT NULL`,
        sql`(
          length(trim(COALESCE(${codRooms.description}, ''))) >= 50
          OR length(trim(COALESCE(${codRooms.rules}, ''))) >= 80
        )`,
        ...(filter?.completedOnly ? [sql`${codRooms.status} IN ('completed', 'settled')`] : []),
      ))
      .groupBy(codRooms.id)
      .orderBy(desc(codRooms.updatedAt))
      .limit(40);

    const filteredRooms = roomRows.filter((row) => {
      if (filter?.freeOnly && BigInt(String(row.entryFeeRial || "0")) > BigInt(0)) return false;
      if (filter?.completedOnly && !["completed", "settled"].includes(row.status)) return false;
      if (filter?.modeTerms?.length && !modeMatches(`${row.teamMode} ${row.map} ${row.title}`, filter.modeTerms)) return false;
      return row.status !== "cancelled" && row.status !== "draft";
    });

    const codResultLabels = new Map<string, string>();
    if (filter?.completedOnly && filteredRooms.length) {
      const firstPlaceEntries = await db
        .select({
          roomId: codRoomEntries.roomId,
          playerName: codRoomEntries.codUsernameSnapshot,
          kills: codRoomEntries.kills,
        })
        .from(codRoomEntries)
        .where(and(
          inArray(codRoomEntries.roomId, filteredRooms.map((row) => row.id)),
          eq(codRoomEntries.resultStatus, "verified"),
          eq(codRoomEntries.placement, 1),
        ))
        .orderBy(desc(codRoomEntries.settledAt), desc(codRoomEntries.updatedAt));
      for (const entry of firstPlaceEntries) {
        if (!codResultLabels.has(entry.roomId)) {
          codResultLabels.set(
            entry.roomId,
            `رتبه اول تأییدشده: ${entry.playerName}${entry.kills != null ? ` · ${entry.kills.toLocaleString("fa-IR")} کیل` : ""}`,
          );
        }
      }
    }

    const codItems = filteredRooms.slice(0, 8).map<ProgrammaticLiveItem>((row) => ({
      id: row.id,
      title: row.title,
      href: `/cod-arena/${row.id}`,
      eyebrow: `COD Arena · ${row.region.toUpperCase()} · ${row.teamMode.toUpperCase()}`,
      description: row.description?.trim().slice(0, 180) || `کاستوم‌روم ${row.map} با ظرفیت ${row.capacity.toLocaleString("fa-IR")} بازیکن`,
      metric: codResultLabels.get(row.id) || (filter?.completedOnly
        ? "روم پایان‌یافته؛ جزئیات نتیجه در صفحه رویداد"
        : `${BigInt(String(row.entryFeeRial || "0")) === BigInt(0) ? "رایگان" : tomanFromRial(row.entryFeeRial)} · ${row.registeredCount.toLocaleString("fa-IR")}/${row.capacity.toLocaleString("fa-IR")} نفر`),
      image: row.bannerImageUrl,
      updatedAt: row.updatedAt,
    }));

    items.unshift(...codItems);
  }

  const deduped = [...new Map(items.map((item) => [item.href, item])).values()].slice(0, 8);
  return {
    items: deduped,
    total: filteredTournaments.length + (items.length - filteredTournaments.slice(0, 8).length),
    fetchedAt: new Date(),
    available: true,
  };
}

async function storeItems(pageDefinition: ProgrammaticSeoPage): Promise<ProgrammaticLiveData> {
  const [{ db }, { storeListings }] = await Promise.all([import("@/db"), import("@/db/schema")]);
  if (pageDefinition.dataFilter.source !== "store") return EMPTY;
  const filter = pageDefinition.dataFilter;
  const conditions = [
    eq(storeListings.status, "active"),
    eq(storeListings.game, pageDefinition.gameId),
    eq(storeListings.kind, filter.kind),
    sql`${storeListings.stock} > 0`,
    sql`length(trim(${storeListings.title})) >= 5`,
    sql`(
      length(trim(COALESCE(${storeListings.description}, ''))) >= 50
      OR (jsonb_typeof(${storeListings.images}) = 'array' AND jsonb_array_length(${storeListings.images}) > 0)
      OR (${storeListings.metadata} IS NOT NULL AND ${storeListings.metadata} <> '{}'::jsonb)
    )`,
  ];
  if (filter.currencyKind) conditions.push(eq(storeListings.currencyKind, filter.currencyKind));

  const rows = await db
    .select({
      id: storeListings.id,
      title: storeListings.title,
      description: storeListings.description,
      source: storeListings.source,
      priceRial: storeListings.priceRial,
      currencyAmount: storeListings.currencyAmount,
      currencyKind: storeListings.currencyKind,
      stock: storeListings.stock,
      images: storeListings.images,
      updatedAt: storeListings.updatedAt,
    })
    .from(storeListings)
    .where(and(...conditions))
    .orderBy(desc(storeListings.updatedAt))
    .limit(24);

  return {
    items: rows.slice(0, 8).map((row) => {
      const images = Array.isArray(row.images) ? row.images.filter((image): image is string => typeof image === "string") : [];
      return {
        id: row.id,
        title: row.title,
        href: `/store/${row.id}`,
        eyebrow: row.source === "official" ? "فروشگاه رسمی گیمنت" : "آگهی کاربر تأییدشده",
        description: row.description?.trim().slice(0, 180) || `محصول فعال ${pageDefinition.gameName} با ${row.stock.toLocaleString("fa-IR")} عدد موجودی`,
        metric: `${row.currencyAmount ? `${row.currencyAmount.toLocaleString("fa-IR")} ${row.currencyKind || ""} · ` : ""}${tomanFromRial(row.priceRial)}`,
        image: images[0] || null,
        updatedAt: row.updatedAt,
      };
    }),
    total: rows.length,
    fetchedAt: new Date(),
    available: true,
  };
}

async function leaderboardItems(pageDefinition: ProgrammaticSeoPage): Promise<ProgrammaticLiveData> {
  const [{ db }, { players, users }] = await Promise.all([import("@/db"), import("@/db/schema")]);
  if (pageDefinition.dataFilter.source !== "leaderboard") return EMPTY;
  const metric = pageDefinition.dataFilter.metric;
  const gameColumn = pageDefinition.gameId === "cod_mobile"
    ? users.codMobileId
    : pageDefinition.gameId === "fortnite"
      ? users.fortniteId
      : users.clashRoyaleId;
  const order = metric === "wins"
    ? desc(players.wins)
    : metric === "win-rate"
      ? desc(sql<number>`case when (${players.wins} + ${players.losses}) > 0 then (${players.wins}::float / (${players.wins} + ${players.losses})) else 0 end`)
      : desc(players.rating);

  const rows = await db
    .select({
      id: players.id,
      displayName: players.displayName,
      username: players.username,
      rating: players.rating,
      wins: players.wins,
      losses: players.losses,
      avatarUrl: users.avatarUrl,
      verified: users.isVerified,
      createdAt: players.createdAt,
    })
    .from(players)
    .leftJoin(users, eq(players.visibleUserId, users.id))
    .where(and(
      isNotNull(gameColumn),
      sql`((${players.wins} + ${players.losses}) > 0 OR COALESCE(${users.isVerified}, false) = true)`,
    ))
    .orderBy(order, desc(players.rating))
    .limit(20);

  return {
    items: rows.slice(0, 10).map((row, index) => {
      const total = row.wins + row.losses;
      const winRate = total > 0 ? Math.round((row.wins / total) * 100) : 0;
      const metricValue = metric === "wins" ? `${row.wins.toLocaleString("fa-IR")} برد` : metric === "win-rate" ? `${winRate.toLocaleString("fa-IR")}٪ نرخ برد` : `${row.rating.toLocaleString("fa-IR")} Rating`;
      return {
        id: row.id,
        title: row.displayName,
        href: `/players/${row.id}`,
        eyebrow: `رتبه ${index + 1} · ${row.verified ? "پروفایل تأییدشده" : `@${row.username}`}`,
        description: `${row.wins.toLocaleString("fa-IR")} برد، ${row.losses.toLocaleString("fa-IR")} باخت و ${winRate.toLocaleString("fa-IR")}٪ نرخ برد ثبت‌شده`,
        metric: metricValue,
        image: row.avatarUrl,
        updatedAt: row.createdAt,
      };
    }),
    total: rows.length,
    fetchedAt: new Date(),
    available: true,
  };
}

export async function loadProgrammaticLiveData(pageDefinition: ProgrammaticSeoPage): Promise<ProgrammaticLiveData> {
  // Builds and contributor CI intentionally work without production secrets.
  // Evergreen copy still renders, while ISR/runtime requests enrich the page
  // with live first-party records once DATABASE_URL exists.
  if (!process.env.DATABASE_URL || duringProductionBuild()) return EMPTY;

  try {
    switch (pageDefinition.dataFilter.source) {
      case "tournaments":
      case "latest-tournaments":
        return await tournamentItems(pageDefinition);
      case "store":
        return await storeItems(pageDefinition);
      case "leaderboard":
        return await leaderboardItems(pageDefinition);
      default:
        return EMPTY;
    }
  } catch (error) {
    console.error("[PSEO] Failed to load live data", {
      path: `${pageDefinition.gameSlug}/${pageDefinition.cluster}/${pageDefinition.facet}`,
      error,
    });
    return EMPTY;
  }
}
