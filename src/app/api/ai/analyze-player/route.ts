import { NextRequest, NextResponse } from "next/server";
import { analyzePlayer } from "@/lib/ai-engine";
import { db } from "@/db";
import { players, matches } from "@/db/schema";
import { eq, or, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const playerId = request.nextUrl.searchParams.get("playerId");

    if (!playerId) {
      return NextResponse.json({ error: "Player ID required" }, { status: 400 });
    }

    // Get player
    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.id, playerId));

    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // Get recent matches
    const recentMatches = await db
      .select()
      .from(matches)
      .where(
        or(
          eq(matches.player1Id, playerId),
          eq(matches.player2Id, playerId)
        )
      )
      .orderBy(desc(matches.createdAt))
      .limit(10);

    // Format recent matches for analysis
    const formattedMatches = recentMatches
      .filter(m => m.winnerId)
      .map(m => ({
        won: m.winnerId === playerId,
        scoreDiff: m.player1Id === playerId
          ? (m.player1Score || 0) - (m.player2Score || 0)
          : (m.player2Score || 0) - (m.player1Score || 0),
      }));

    const analysis = analyzePlayer(
      player.rating,
      player.wins,
      player.losses,
      formattedMatches
    );

    return NextResponse.json({
      player: {
        id: player.id,
        displayName: player.displayName,
        rating: player.rating,
        wins: player.wins,
        losses: player.losses,
      },
      analysis,
    });
  } catch {
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
