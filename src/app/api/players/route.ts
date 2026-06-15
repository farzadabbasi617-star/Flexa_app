import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { players, users } from "@/db/schema";
import { desc, count, eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";


export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const offset = (page - 1) * limit;

  try {
    const [totalResult] = await db
      .select({ value: count() })
      .from(players);

    const paginatedPlayers = await db
      .select({
        id: players.id,
        visibleUserId: players.visibleUserId,
        username: players.username,
        displayName: players.displayName,
        email: players.email,
        avatarUrl: players.avatarUrl,
        gameId: players.gameId,
        rating: players.rating,
        wins: players.wins,
        losses: players.losses,
        createdAt: players.createdAt,
        flexaId: users.flexaId,
        xp: users.xp,
        level: users.level,
        rankPoints: users.rankPoints,
        role: users.role,
        isVerified: users.isVerified,
      })
      .from(players)
      .leftJoin(users, eq(players.visibleUserId, users.id))
      .orderBy(desc(players.rating))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      data: paginatedPlayers,
      pagination: {
        total: totalResult.value,
        page,
        limit,
        totalPages: Math.ceil(totalResult.value / limit),
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch players" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Creating player profiles directly is an admin action (normal players get
  // a profile automatically at registration).
  const auth = await requireRole(request, ["admin", "super_admin"]);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const body = await request.json();
    const { username, displayName, email, gameId } = body;

    if (!username || !displayName) {
      return NextResponse.json(
        { error: "Username and display name are required" },
        { status: 400 }
      );
    }

    const [player] = await db
      .insert(players)
      .values({
        username,
        displayName,
        email: email || null,
        gameId: gameId || null,
      })
      .returning();

    return NextResponse.json(player, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create player" }, { status: 500 });
  }
}
