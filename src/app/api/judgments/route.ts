import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { judgments, matches, players } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { matchId, judgeId, isAiJudgment, verdict, reasoning, confidence, scoreBreakdown } = body;

    if (!matchId || !verdict) {
      return NextResponse.json(
        { error: "Match ID and verdict are required" },
        { status: 400 }
      );
    }

    const [judgment] = await db
      .insert(judgments)
      .values({
        matchId,
        judgeId: judgeId || null,
        isAiJudgment: isAiJudgment || false,
        verdict,
        reasoning: reasoning || null,
        confidence: confidence || null,
        scoreBreakdown: scoreBreakdown || null,
      })
      .returning();

    return NextResponse.json(judgment, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create judgment" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const matchId = request.nextUrl.searchParams.get("matchId");

  try {
    if (matchId) {
      const results = await db
        .select()
        .from(judgments)
        .where(eq(judgments.matchId, matchId));
      return NextResponse.json(results);
    }

    const results = await db.select().from(judgments);
    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: "Failed to fetch judgments" }, { status: 500 });
  }
}
