export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tournaments, registrations, matches, players } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, id));

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // Get registered players
    const regs = await db
      .select({
        registration: registrations,
        player: players,
      })
      .from(registrations)
      .leftJoin(players, eq(registrations.playerId, players.id))
      .where(eq(registrations.tournamentId, id));

    // Get matches
    const tournamentMatches = await db
      .select()
      .from(matches)
      .where(eq(matches.tournamentId, id))
      .orderBy(matches.round, matches.matchNumber);

    return NextResponse.json({
      ...tournament,
      registrations: regs,
      matches: tournamentMatches,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch tournament" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { status } = body;

    const [updated] = await db
      .update(tournaments)
      .set({ status, updatedAt: new Date() })
      .where(eq(tournaments.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed to update tournament" }, { status: 500 });
  }
}
