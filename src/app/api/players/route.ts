import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { players } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    const allPlayers = await db
      .select()
      .from(players)
      .orderBy(desc(players.rating));
    return NextResponse.json(allPlayers);
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
