import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { disputes, matches } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const allDisputes = await db.select().from(disputes);
    return NextResponse.json(allDisputes);
  } catch {
    return NextResponse.json({ error: "Failed to fetch disputes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { matchId, raisedById, reason, evidenceUrls } = body;

    if (!matchId || !raisedById || !reason) {
      return NextResponse.json(
        { error: "Match ID, player ID, and reason are required" },
        { status: 400 }
      );
    }

    // Update match status to disputed
    await db
      .update(matches)
      .set({ status: "disputed" })
      .where(eq(matches.id, matchId));

    const [dispute] = await db
      .insert(disputes)
      .values({
        matchId,
        raisedById,
        reason,
        evidenceUrls: evidenceUrls || null,
      })
      .returning();

    return NextResponse.json(dispute, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create dispute" }, { status: 500 });
  }
}
