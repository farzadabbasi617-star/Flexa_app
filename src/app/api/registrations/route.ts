import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { registrations } from "@/db/schema";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tournamentId, playerId } = body;

    if (!tournamentId || !playerId) {
      return NextResponse.json(
        { error: "Tournament ID and player ID are required" },
        { status: 400 }
      );
    }

    const [reg] = await db
      .insert(registrations)
      .values({ tournamentId, playerId })
      .returning();

    return NextResponse.json(reg, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to register player" }, { status: 500 });
  }
}
