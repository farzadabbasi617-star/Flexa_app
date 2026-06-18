import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tournaments, registrations } from "@/db/schema";
import { desc, eq, count } from "drizzle-orm";
import { requireRole, validateSession } from "@/lib/auth";
import { publishTournamentToTelegramChannel } from "@/lib/telegram";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";


export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const game = searchParams.get("game");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "10");
  const offset = (page - 1) * limit;

  try {
    // 1. Get total count for pagination
    const [totalResult] = await db
      .select({ value: count() })
      .from(tournaments)
      .where(
        game && ["clash_royale", "cod_mobile", "fortnite"].includes(game)
          ? eq(tournaments.game, game as "clash_royale" | "cod_mobile" | "fortnite")
          : undefined
      );

    // 2. Get paginated results with JOIN to avoid N+1
    const results = await db
      .select({
        tournament: tournaments,
        registeredCount: count(registrations.id),
      })
      .from(tournaments)
      .leftJoin(registrations, eq(tournaments.id, registrations.tournamentId))
      .where(
        game && ["clash_royale", "cod_mobile", "fortnite"].includes(game)
          ? eq(tournaments.game, game as "clash_royale" | "cod_mobile" | "fortnite")
          : undefined
      )
      .groupBy(tournaments.id)
      .orderBy(desc(tournaments.createdAt))
      .limit(limit)
      .offset(offset);

    let registeredTournamentIds = new Set<string>();
    let registeredPlayerByTournament = new Map<string, string>();

    const token = request.cookies.get("session")?.value;
    if (token) {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
      const ua = request.headers.get("user-agent") || "unknown";
      const user = await validateSession(token, ip, ua, request);
      if (user) {
        const myRegistrations = await db
          .select({ tournamentId: registrations.tournamentId, playerId: registrations.playerId })
          .from(registrations)
          .where(eq(registrations.visibleUserId, user.id));
        registeredTournamentIds = new Set(myRegistrations.map((reg) => reg.tournamentId));
        registeredPlayerByTournament = new Map(myRegistrations.map((reg) => [reg.tournamentId, reg.playerId]));
      }
    }

    const formattedResults = results.map(({ tournament, registeredCount }) => ({
      ...tournament,
      registeredCount,
      isRegistered: registeredTournamentIds.has(tournament.id),
      myPlayerId: registeredPlayerByTournament.get(tournament.id) || null,
    }));

    return NextResponse.json({
      data: formattedResults,
      pagination: {
        total: totalResult.value,
        page,
        limit,
        totalPages: Math.ceil(totalResult.value / limit),
      },
    });
  } catch (err) {
    console.error("Fetch tournaments error:", err);
    return NextResponse.json({ error: "Failed to fetch tournaments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Only admins may create tournaments.
  const auth = await requireRole(request, ["admin", "super_admin"]);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const body = await request.json();
    const {
      name, game, format, description, maxPlayers, prizePool, rules, startDate,
      entryFee, gameMode, mapName, serverSlots, winnersCount, categoryLabel,
      prize1st, prize2nd, prize3rd, prize4to10, bannerUrl
    } = body;

    if (!name || !game) {
      return NextResponse.json({ error: "Name and game are required" }, { status: 400 });
    }

    const [tournament] = await db
      .insert(tournaments)
      .values({
        name,
        game,
        format: format || "single_elimination",
        description: description || null,
        maxPlayers: maxPlayers || 16,
        prizePool: prizePool || null,
        winnersCount: winnersCount || 1,
        categoryLabel: categoryLabel || null,
        entryFee: entryFee || "رایگان",
        gameMode: gameMode || null,
        mapName: mapName || null,
        serverSlots: serverSlots || maxPlayers || 16,
        createdById: auth.user.id,
        prize1st: prize1st || null,
        prize2nd: prize2nd || null,
        prize3rd: prize3rd || null,
        prize4to10: prize4to10 || null,
        bannerUrl: bannerUrl || null,
        rules: rules || null,
        startDate: startDate ? new Date(startDate) : null,
      })
      .returning();

    publishTournamentToTelegramChannel(tournament).catch((err) => {
      logger.warn({ err, tournamentId: tournament.id }, "Failed to publish new tournament to Telegram channel");
    });

    return NextResponse.json(tournament, { status: 201 });
  } catch (err) {
    console.error("Create tournament error:", err);
    return NextResponse.json({ error: "Failed to create tournament" }, { status: 500 });
  }
}
