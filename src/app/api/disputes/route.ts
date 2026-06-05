import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { disputes, matches } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateSession } from "@/lib/auth";

export const dynamic = "force-dynamic";


export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const ua = request.headers.get('user-agent') || 'unknown';

    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = await validateSession(token, ip, ua, request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const allDisputes = await db.select().from(disputes);
    return NextResponse.json(allDisputes);
  } catch {
    return NextResponse.json({ error: "Failed to fetch disputes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const ua = request.headers.get('user-agent') || 'unknown';

    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = await validateSession(token, ip, ua, request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { matchId, raisedById, reason, evidenceUrls } = body;

    if (!matchId || !raisedById || !reason) {
      return NextResponse.json(
        { error: "Match ID, player ID, and reason are required" },
        { status: 400 }
      );
    }

    // Ensure user is raising dispute for themselves
    if (raisedById !== user.id && user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
