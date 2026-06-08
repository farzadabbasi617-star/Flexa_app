import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tournaments, registrations, matches } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { generateSingleEliminationMatches, shuffle } from "@/lib/brackets";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Only admins may (re)generate brackets — this deletes existing matches.
  const auth = await requireRole(request, ["admin", "super_admin"]);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
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

    // Shuffle players, then build the bracket with the shared pure helper.
    const playerIds = shuffle(regs.map((r) => r.playerId));
    const newMatches = generateSingleEliminationMatches(playerIds).map((m) => ({
      ...m,
      tournamentId: id,
    }));

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
    logger.error({ err: e }, "Failed to generate brackets");
    return NextResponse.json({ error: "Failed to generate brackets" }, { status: 500 });
  }
}
