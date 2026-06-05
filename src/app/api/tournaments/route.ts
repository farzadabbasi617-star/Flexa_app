import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tournaments, registrations } from "@/db/schema";
import { desc, eq, count } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const game = searchParams.get("game");

  try {
    let results;

    if (game && ["clash_royale", "cod_mobile", "fortnite"].includes(game)) {
      results = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.game, game as "clash_royale" | "cod_mobile" | "fortnite"))
        .orderBy(desc(tournaments.createdAt));
    } else {
      results = await db
        .select()
        .from(tournaments)
        .orderBy(desc(tournaments.createdAt));
    }

    // Add registration count to each tournament
    const withCounts = await Promise.all(
      results.map(async (t) => {
        const [regCount] = await db
          .select({ value: count() })
          .from(registrations)
          .where(eq(registrations.tournamentId, t.id));
        return { ...t, registeredCount: regCount.value };
      })
    );

    return NextResponse.json(withCounts);
  } catch {
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
