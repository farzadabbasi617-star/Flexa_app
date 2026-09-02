import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { registrations, tournamentTickets, tournaments, users } from "@/db/schema";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function generateTicketCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = require("crypto").randomBytes(8);
  for (let i = 0; i < 8; i++) code += alphabet[bytes[i] % alphabet.length];
  return `GT-${code}`;
}

/** GET /api/admin/tickets — list issued tickets (latest first). */
export async function GET(request: NextRequest) {
  const auth = await requireAdminPermission(request, "tournaments");
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const rows = await db
    .select({
      id: tournamentTickets.id,
      code: tournamentTickets.code,
      userId: tournamentTickets.userId,
      username: users.username,
      displayName: users.displayName,
      tournamentId: tournamentTickets.tournamentId,
      tournamentName: tournaments.name,
      maxUses: tournamentTickets.maxUses,
      usedCount: tournamentTickets.usedCount,
      status: tournamentTickets.status,
      note: tournamentTickets.note,
      expiresAt: tournamentTickets.expiresAt,
      usedAt: tournamentTickets.usedAt,
      usedTournamentId: tournamentTickets.usedTournamentId,
      createdAt: tournamentTickets.createdAt,
    })
    .from(tournamentTickets)
    .leftJoin(users, eq(tournamentTickets.userId, users.id))
    .leftJoin(tournaments, eq(tournamentTickets.tournamentId, tournaments.id))
    .orderBy(desc(tournamentTickets.createdAt))
    .limit(200);

  const tournamentOptions = await db
    .select({ id: tournaments.id, name: tournaments.name, status: tournaments.status })
    .from(tournaments)
    .orderBy(desc(tournaments.createdAt))
    .limit(50);

  return NextResponse.json({ tickets: rows, tournaments: tournamentOptions }, { headers: { "Cache-Control": "no-store" } });
}

/** POST /api/admin/tickets — issue free-entry ticket(s) to a user. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "tournaments");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limited = await rateLimit(`tickets:issue:${auth.user.id}:${ip}`, 30, 60 * 60 * 1000);
    if (!limited.success) return NextResponse.json({ error: "تعداد درخواست‌ها زیاد است" }, { status: 429 });

    const body = await request.json().catch(() => ({}));
    const username = String(body.username || "").trim();
    const tournamentId = body.tournamentId ? String(body.tournamentId) : null;
    const quantity = Math.min(Math.max(Number(body.quantity) || 1, 1), 20);
    const expiresInDays = body.expiresInDays === null || body.expiresInDays === undefined || body.expiresInDays === ""
      ? null
      : Math.max(Number(body.expiresInDays) || 0, 0);
    const note = body.note ? String(body.note).slice(0, 300) : null;

    if (!username) return NextResponse.json({ error: "نام کاربری یا شناسه گیمنت کاربر را وارد کنید" }, { status: 400 });

    const [target] = await db
      .select({ id: users.id, username: users.username, displayName: users.displayName })
      .from(users)
      .where(sql`lower(${users.username}) = ${username.toLowerCase()} OR ${users.gamentId} = ${username}`)
      .limit(1);
    if (!target) return NextResponse.json({ error: "کاربر پیدا نشد" }, { status: 404 });

    if (tournamentId) {
      const [t] = await db.select({ id: tournaments.id }).from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
      if (!t) return NextResponse.json({ error: "تورنومنت انتخاب‌شده پیدا نشد" }, { status: 404 });
    }

    const expiresAt = expiresInDays && expiresInDays > 0 ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null;

    const created = await db.transaction(async (tx) => {
      const rows = [];
      for (let i = 0; i < quantity; i++) {
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            const [row] = await tx
              .insert(tournamentTickets)
              .values({
                code: generateTicketCode(),
                userId: target.id,
                tournamentId,
                maxUses: 1,
                status: "active",
                note,
                issuedById: auth.user!.id,
                expiresAt,
              })
              .returning();
            rows.push(row);
            lastError = null;
            break;
          } catch (err) {
            lastError = err;
          }
        }
        if (lastError) throw lastError;
      }
      return rows;
    });

    return NextResponse.json({
      ok: true,
      issued: created.length,
      tickets: created.map((t) => ({ id: t.id, code: t.code, expiresAt: t.expiresAt })),
      user: { username: target.username, displayName: target.displayName },
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";
    if (message.includes("tournaments_tournament_id_fkey") || message.includes("foreign key")) {
      return NextResponse.json({ error: "تورنومنت یا کاربر نامعتبر است" }, { status: 400 });
    }
    return NextResponse.json({ error: "صدور بلیت انجام نشد" }, { status: 500 });
  }
}

/** PATCH /api/admin/tickets — revoke an unused ticket. */
export async function PATCH(request: NextRequest) {
  const auth = await requireAdminPermission(request, "tournaments");
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const ticketId = String(body.ticketId || "");
  if (!ticketId) return NextResponse.json({ error: "ticketId الزامی است" }, { status: 400 });

  const [updated] = await db
    .update(tournamentTickets)
    .set({ status: "revoked" })
    .where(and(
      eq(tournamentTickets.id, ticketId),
      eq(tournamentTickets.status, "active"),
      sql`${tournamentTickets.usedCount} < ${tournamentTickets.maxUses}`
    ))
    .returning({ id: tournamentTickets.id, code: tournamentTickets.code });

  if (!updated) return NextResponse.json({ error: "بلیت پیدا نشد یا قابل لغو نیست (مصرف‌شده است)" }, { status: 404 });
  return NextResponse.json({ ok: true, revoked: updated.code });
}
