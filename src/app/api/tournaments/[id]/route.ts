import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tournaments, registrations, matches, players } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { refundTournamentEntryFees } from "@/lib/tournament-finance";

export const dynamic = "force-dynamic";


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
  // Only admins may change a tournament's status.
  const auth = await requireRole(request, ["admin", "super_admin"]);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await params;
  try {
    const body = await request.json();
    const { status } = body;

    const [before] = await db.select({ status: tournaments.status }).from(tournaments).where(eq(tournaments.id, id)).limit(1);

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(tournaments)
        .set({ status, updatedAt: new Date() })
        .where(eq(tournaments.id, id))
        .returning();

      if (before?.status !== "cancelled" && status === "cancelled") {
        await refundTournamentEntryFees(tx, id, auth.user.id);
      }

      return row;
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed to update tournament" }, { status: 500 });
  }
}
