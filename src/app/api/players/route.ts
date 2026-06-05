import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { players } from "@/db/schema";
import { desc, count } from "drizzle-orm";


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
      .select()
      .from(players)
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
