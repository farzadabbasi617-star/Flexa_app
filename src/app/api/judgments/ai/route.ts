import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { judgments, matches, players, matchEvidence } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { analyzeMatch } from "@/lib/ai-engine";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { matchId } = body;

    if (!matchId) {
      return NextResponse.json({ error: "Match ID is required" }, { status: 400 });
    }

    // Get match data
    const [match] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId));

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // Get player data
    let p1Rating = 1000, p1Wins = 0, p1Losses = 0;
    let p2Rating = 1000, p2Wins = 0, p2Losses = 0;

    if (match.player1Id) {
      const [p1] = await db.select().from(players).where(eq(players.id, match.player1Id));
      if (p1) {
        p1Rating = p1.rating;
        p1Wins = p1.wins;
        p1Losses = p1.losses;
      }
    }

    if (match.player2Id) {
      const [p2] = await db.select().from(players).where(eq(players.id, match.player2Id));
      if (p2) {
        p2Rating = p2.rating;
        p2Wins = p2.wins;
        p2Losses = p2.losses;
      }
    }

    // Check for evidence
    const [evidenceCount] = await db
      .select({ count: count() })
      .from(matchEvidence)
      .where(eq(matchEvidence.matchId, matchId));
    
    const hasEvidence = evidenceCount.count > 0;

    // Run AI analysis
    const aiResult = analyzeMatch(
      match.player1Score || 0,
      match.player2Score || 0,
      p1Rating,
      p2Rating,
      { wins: p1Wins, losses: p1Losses },
      { wins: p2Wins, losses: p2Losses },
      hasEvidence
    );

    // Store judgment
    const [judgment] = await db
      .insert(judgments)
      .values({
        matchId,
        isAiJudgment: true,
        verdict: aiResult.verdict,
        reasoning: aiResult.reasoning,
        confidence: aiResult.confidence,
        scoreBreakdown: {
          factors: aiResult.factors,
          suspicionLevel: aiResult.suspicionLevel,
          recommendations: aiResult.recommendations,
        },
      })
      .returning();

    // If AI is confident and no suspicion, auto-apply verdict
    if (
      aiResult.confidence >= 70 &&
      aiResult.suspicionLevel < 30 &&
      aiResult.verdict !== "needs_review" &&
      aiResult.verdict !== "rematch"
    ) {
      const winnerId =
        aiResult.verdict === "player1_wins"
          ? match.player1Id
          : aiResult.verdict === "player2_wins"
          ? match.player2Id
          : null;

      if (winnerId) {
        await db
          .update(matches)
          .set({ winnerId, status: "completed", completedAt: new Date() })
          .where(eq(matches.id, matchId));

        // Update player stats
        if (match.player1Id && match.player2Id) {
          const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;
          
          // Update winner
          const [winner] = await db.select().from(players).where(eq(players.id, winnerId));
          if (winner) {
            await db.update(players).set({
              wins: winner.wins + 1,
              rating: winner.rating + 25,
            }).where(eq(players.id, winnerId));
          }

          // Update loser
          const [loser] = await db.select().from(players).where(eq(players.id, loserId));
          if (loser) {
            await db.update(players).set({
              losses: loser.losses + 1,
              rating: Math.max(0, loser.rating - 15),
            }).where(eq(players.id, loserId));
          }
        }
      }
    }

    return NextResponse.json({
      judgment,
      aiAnalysis: aiResult,
      autoApplied: aiResult.confidence >= 70 && aiResult.suspicionLevel < 30,
    }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "AI judgment failed" }, { status: 500 });
  }
}
