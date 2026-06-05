import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tournaments, registrations } from "@/db/schema";
import { desc, eq, count, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const game = searchParams.get("game");

  try {
    // Use a single query with LEFT JOIN and GROUP BY to avoid N+1 problem
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
      .orderBy(desc(tournaments.createdAt));

    // Format results to match the original API response structure
    const formattedResults = results.map(({ tournament, registeredCount }) => ({
      ...tournament,
      registeredCount,
    }));

    return NextResponse.json(formattedResults);
  } catch (err) {
    console.error("Fetch tournaments error:", err);
    return NextResponse.json({ error: "Failed to fetch tournaments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name, game, format, description, maxPlayers, prizePool, rules, startDate,
      entryFee, gameMode, mapName, serverSlots, prize1st, prize2nd, prize3rd, prize4to10,
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
        entryFee: entryFee || "رایگان",
        gameMode: gameMode || null,
        mapName: mapName || null,
        serverSlots: serverSlots || maxPlayers || 16,
        prize1st: prize1st || null,
        prize2nd: prize2nd || null,
        prize3rd: prize3rd || null,
        prize4to10: prize4to10 || null,
        rules: rules || null,
        startDate: startDate ? new Date(startDate) : null,
      })
      .returning();

    return NextResponse.json(tournament, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create tournament" }, { status: 500 });
  }
}
