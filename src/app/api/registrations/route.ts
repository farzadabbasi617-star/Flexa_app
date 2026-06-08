import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { registrations, players, tournaments } from "@/db/schema";
import { and, eq, count } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";


export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const ua = request.headers.get("user-agent") || "unknown";

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

    const isAdmin = user.role === "admin" || user.role === "super_admin";

    // The player profile must exist and (unless admin) belong to this user.
    // NOTE: playerId is players.id; ownership is players.visibleUserId === user.id.
    const [player] = await db
      .select({ id: players.id, ownerId: players.visibleUserId })
      .from(players)
      .where(eq(players.id, playerId));

    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }
    if (!isAdmin && player.ownerId !== user.id) {
      return NextResponse.json(
        { error: "You can only register your own player profile" },
        { status: 403 }
      );
    }

    // Tournament must exist and still be open for registration.
    const [tournament] = await db
      .select({
        id: tournaments.id,
        status: tournaments.status,
        maxPlayers: tournaments.maxPlayers,
      })
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }
    if (tournament.status !== "registration") {
      return NextResponse.json(
        { error: "Registration for this tournament is closed" },
        { status: 409 }
      );
    }

    // Prevent duplicate registration of the same player in the same tournament.
    const [existing] = await db
      .select({ id: registrations.id })
      .from(registrations)
      .where(
        and(
          eq(registrations.tournamentId, tournamentId),
          eq(registrations.playerId, playerId)
        )
      );
    if (existing) {
      return NextResponse.json(
        { error: "This player is already registered for the tournament" },
        { status: 409 }
      );
    }

    // Enforce capacity.
    const [{ value: registeredCount }] = await db
      .select({ value: count() })
      .from(registrations)
      .where(eq(registrations.tournamentId, tournamentId));

    if (registeredCount >= tournament.maxPlayers) {
      return NextResponse.json({ error: "Tournament is full" }, { status: 409 });
    }

    const [reg] = await db
      .insert(registrations)
      .values({
        tournamentId,
        playerId,
        visibleUserId: player.ownerId ?? user.id,
      })
      .returning();

    return NextResponse.json(reg, { status: 201 });
  } catch (err) {
    logger.error({ err }, "Registration (tournament) error");
    return NextResponse.json({ error: "Failed to register player" }, { status: 500 });
  }
}
