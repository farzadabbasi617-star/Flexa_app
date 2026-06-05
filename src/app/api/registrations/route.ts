import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { registrations } from "@/db/schema";
import { validateSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const ua = request.headers.get('user-agent') || 'unknown';

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await validateSession(token, ip, ua, request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { tournamentId, playerId } = body;

    if (!tournamentId || !playerId) {
      return NextResponse.json(
        { error: "Tournament ID and player ID are required" },
        { status: 400 }
      );
    }

    // Ensure user is registering themselves or is an admin
    if (playerId !== user.id && user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [reg] = await db
      .insert(registrations)
      .values({ 
        tournamentId, 
        playerId, 
        visibleUserId: user.id 
      })
      .returning();

    return NextResponse.json(reg, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to register player" }, { status: 500 });
  }
}
