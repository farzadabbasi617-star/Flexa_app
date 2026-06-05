import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tournaments, registrations, matches, players } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";


export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    // Get tournament
    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, id));

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // Get registered players
    const regs = await db
      .select({ playerId: registrations.playerId })
      .from(registrations)
      .where(eq(registrations.tournamentId, id));

    if (regs.length < 2) {
      return NextResponse.json({ error: "Need at least 2 players" }, { status: 400 });
    }

    // Shuffle players
    const playerIds = regs.map((r) => r.playerId);
    for (let i = playerIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playerIds[i], playerIds[j]] = [playerIds[j], playerIds[i]];
    }

    // Calculate rounds needed
    const numPlayers = playerIds.length;
    const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(numPlayers)));
    const totalRounds = Math.ceil(Math.log2(nextPowerOf2));

    // Generate first round matches
    const firstRoundMatches = Math.ceil(numPlayers / 2);
    const newMatches = [];

    for (let i = 0; i < firstRoundMatches; i++) {
      const p1 = playerIds[i * 2] || null;
      const p2 = playerIds[i * 2 + 1] || null;

      newMatches.push({
        tournamentId: id,
        round: 1,
        matchNumber: i + 1,
        player1Id: p1,
        player2Id: p2,
        status: p2 ? ("pending" as const) : ("completed" as const),
        winnerId: !p2 ? p1 : null, // Bye
      });
    }

    // Generate empty matches for subsequent rounds
    for (let round = 2; round <= totalRounds; round++) {
      const matchesInRound = Math.ceil(firstRoundMatches / Math.pow(2, round - 1));
      for (let i = 0; i < matchesInRound; i++) {
        newMatches.push({
          tournamentId: id,
          round,
          matchNumber: i + 1,
          player1Id: null,
          player2Id: null,
          status: "pending" as const,
        });
      }
    }

    // Delete existing matches and insert new ones
    await db.delete(matches).where(eq(matches.tournamentId, id));
    const inserted = await db.insert(matches).values(newMatches).returning();

    // Update tournament status
    await db
      .update(tournaments)
      .set({ status: "in_progress", updatedAt: new Date() })
      .where(eq(tournaments.id, id));

    return NextResponse.json(inserted, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to generate brackets" }, { status: 500 });
  }
}
