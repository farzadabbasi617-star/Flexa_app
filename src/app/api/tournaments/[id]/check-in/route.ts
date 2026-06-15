import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notifications, registrations, tournaments, users } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

async function notifyAdmins(tournamentId: string, tournamentName: string, playerName: string) {
  const admins = await db.select({ id: users.id }).from(users).where(inArray(users.role, ["admin", "super_admin"]));
  if (!admins.length) return;
  await db.insert(notifications).values(
    admins.map((admin) => ({
      userId: admin.id,
      type: "tournament_checkin",
      title: "تأیید حضور بازیکن",
      message: `${playerName} حضور خود را در ${tournamentName} تأیید کرد.`,
      link: `/tournaments/${tournamentId}/lobby`,
    }))
  );
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const ua = request.headers.get("user-agent") || "unknown";
    const user = await validateSession(token || "", ip, ua, request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [tournament] = await db.select({ id: tournaments.id, name: tournaments.name, status: tournaments.status }).from(tournaments).where(eq(tournaments.id, id)).limit(1);
    if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

    const [registration] = await db
      .select()
      .from(registrations)
      .where(and(eq(registrations.tournamentId, id), eq(registrations.visibleUserId, user.id)))
      .limit(1);

    const isAdmin = user.role === "admin" || user.role === "super_admin";
    if (!registration && !isAdmin) return NextResponse.json({ error: "فقط شرکت‌کنندگان تورنومنت می‌توانند حضور را تأیید کنند." }, { status: 403 });

    if (!registration && isAdmin) return NextResponse.json({ success: true, admin: true });

    const [updated] = await db
      .update(registrations)
      .set({ checkedInAt: new Date() })
      .where(eq(registrations.id, registration.id))
      .returning();

    await notifyAdmins(id, tournament.name, user.displayName).catch(() => undefined);
    return NextResponse.json({ success: true, registration: updated });
  } catch (err) {
    logger.error({ err }, "Tournament check-in failed");
    return NextResponse.json({ error: "تأیید حضور انجام نشد" }, { status: 500 });
  }
}
