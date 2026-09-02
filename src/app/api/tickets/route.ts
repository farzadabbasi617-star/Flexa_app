import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { tournamentTickets, tournaments } from "@/db/schema";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/tickets — the signed-in user's own tickets (for the registration UI). */
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const rows = await db
    .select({
      id: tournamentTickets.id,
      code: tournamentTickets.code,
      tournamentId: tournamentTickets.tournamentId,
      tournamentName: tournaments.name,
      maxUses: tournamentTickets.maxUses,
      usedCount: tournamentTickets.usedCount,
      status: tournamentTickets.status,
      expiresAt: tournamentTickets.expiresAt,
      usedAt: tournamentTickets.usedAt,
      createdAt: tournamentTickets.createdAt,
    })
    .from(tournamentTickets)
    .leftJoin(tournaments, eq(tournamentTickets.tournamentId, tournaments.id))
    .where(eq(tournamentTickets.userId, auth.user.id))
    .orderBy(desc(tournamentTickets.createdAt))
    .limit(50);

  const active = rows.filter((t) => t.status === "active" && t.usedCount < t.maxUses && (!t.expiresAt || t.expiresAt > new Date()));
  return NextResponse.json({ tickets: rows, active }, { headers: { "Cache-Control": "no-store" } });
}
