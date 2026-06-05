import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teams, teamMembers, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { validateSession } from "@/lib/auth";


export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const allTeams = await db
      .select()
      .from(teams)
      .orderBy(desc(teams.createdAt));

    return NextResponse.json(allTeams);
  } catch {
    return NextResponse.json({ error: "Failed to fetch teams" }, { status: 500 });
  }
}

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
    const { name, tag, description } = body;

    if (!name || !tag) {
      return NextResponse.json({ error: "Name and tag are required" }, { status: 400 });
    }

    // Create team
    const [team] = await db
      .insert(teams)
      .values({
        name,
        tag: tag.toUpperCase(),
        description: description || null,
        ownerId: user.id,
      })
      .returning();

    // Add owner as member
    await db.insert(teamMembers).values({
      teamId: team.id,
      userId: user.id,
      role: "owner",
    });

    return NextResponse.json(team, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
  }
}
