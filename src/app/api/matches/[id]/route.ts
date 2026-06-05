export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { matches, players } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { player1Score, player2Score, winnerId, status } = body;

    const updateData: Record<string, unknown> = {};
    if (player1Score !== undefined) updateData.player1Score = player1Score;
    if (player2Score !== undefined) updateData.player2Score = player2Score;
    if (winnerId !== undefined) updateData.winnerId = winnerId;
    if (status !== undefined) updateData.status = status;
    if (status === "completed") updateData.completedAt = new Date();

    const [updated] = await db
      .update(matches)
      .set(updateData)
      .where(eq(matches.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // If match completed, advance winner to next round
    if (status === "completed" && winnerId) {
      const match = updated;
      const nextRound = match.round + 1;
      const nextMatchNumber = Math.ceil(match.matchNumber / 2);

      // Find next round match
      const [nextMatch] = await db
        .select()
        .from(matches)
        .where(
          and(
            eq(matches.tournamentId, match.tournamentId),
            eq(matches.round, nextRound),
            eq(matches.matchNumber, nextMatchNumber)
          )
        );

      if (nextMatch) {
        // Determine slot: odd match numbers go to player1, even to player2
        const isPlayer1Slot = match.matchNumber % 2 === 1;
        const slotUpdate = isPlayer1Slot
          ? { player1Id: winnerId }
          : { player2Id: winnerId };

        await db
          .update(matches)
          .set(slotUpdate)
          .where(eq(matches.id, nextMatch.id));
      }

      // Update player stats
      if (match.player1Id && match.player2Id) {
        const loserId =
          winnerId === match.player1Id ? match.player2Id : match.player1Id;

        // Winner stats
        const [winner] = await db
          .select()
          .from(players)
          .where(eq(players.id, winnerId));
        if (winner) {
          await db
            .update(players)
            .set({
              wins: winner.wins + 1,
              rating: winner.rating + 25,
            })
            .where(eq(players.id, winnerId));
        }

        // Loser stats
        const [loser] = await db
          .select()
          .from(players)
          .where(eq(players.id, loserId));
        if (loser) {
          await db
            .update(players)
            .set({
              losses: loser.losses + 1,
              rating: Math.max(0, loser.rating - 15),
            })
            .where(eq(players.id, loserId));
        }
      }
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update match" }, { status: 500 });
  }
}
