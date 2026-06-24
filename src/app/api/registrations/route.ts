import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { registrations, players, tournaments, transactions, wallets } from "@/db/schema";
import { and, eq, count, sql } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import { getEntryFeeRial } from "@/lib/tournament-finance";
import { evaluateUserAchievements } from "@/lib/achievement-service";
import logger from "@/lib/logger";
import { z } from "zod";

export const dynamic = "force-dynamic";

const registrationSchema = z.object({
  tournamentId: z.string().uuid(),
  playerId: z.string().uuid(),
});

function isPgUniqueViolation(error: unknown) {
  const maybe = error as { code?: string; cause?: { code?: string } };
  return maybe?.code === "23505" || maybe?.cause?.code === "23505";
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const ua = request.headers.get("user-agent") || "unknown";

    if (!token) return NextResponse.json({ error: "برای ثبت‌نام باید وارد حساب شوی." }, { status: 401 });

    const user = await validateSession(token, ip, ua, request);
    if (!user) return NextResponse.json({ error: "نشست کاربری معتبر نیست. دوباره وارد شو." }, { status: 401 });

    const body = await request.json();
    const validation = registrationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: "ورودی‌های ارسالی نامعتبر هستند.", details: validation.error.format() }, { status: 400 });
    }
    const { tournamentId, playerId } = validation.data;

    const isAdmin = user.role === "admin" || user.role === "super_admin";

    const result = await db.transaction(async (tx) => {
      const [player] = await tx
        .select({ id: players.id, ownerId: players.visibleUserId, displayName: players.displayName })
        .from(players)
        .where(eq(players.id, playerId));

      if (!player) throw new Error("PLAYER_NOT_FOUND");
      if (!isAdmin && player.ownerId !== user.id) throw new Error("PLAYER_FORBIDDEN");

      // Lock the tournament row for the rest of this transaction. This makes
      // capacity checks and paid registrations serial for the same tournament
      // and prevents overbooking under concurrent requests.
      await tx.execute(sql`SELECT id FROM tournaments WHERE id = ${tournamentId} FOR UPDATE`);

      const [tournament] = await tx
        .select({
          id: tournaments.id,
          name: tournaments.name,
          status: tournaments.status,
          maxPlayers: tournaments.maxPlayers,
          entryFee: tournaments.entryFee,
        })
        .from(tournaments)
        .where(eq(tournaments.id, tournamentId));

      if (!tournament) throw new Error("TOURNAMENT_NOT_FOUND");
      if (tournament.status !== "registration") throw new Error("REGISTRATION_CLOSED");

      const ownerId = player.ownerId ?? user.id;

      const [existing] = await tx
        .select({ id: registrations.id })
        .from(registrations)
        .where(and(eq(registrations.tournamentId, tournamentId), eq(registrations.playerId, playerId)));
      if (existing) throw new Error("DUPLICATE_REGISTRATION");

      const [existingUserRegistration] = await tx
        .select({ id: registrations.id })
        .from(registrations)
        .where(and(eq(registrations.tournamentId, tournamentId), eq(registrations.visibleUserId, ownerId)));
      if (existingUserRegistration) throw new Error("DUPLICATE_REGISTRATION");

      const [{ value: registeredCount }] = await tx
        .select({ value: count() })
        .from(registrations)
        .where(eq(registrations.tournamentId, tournamentId));

      if (registeredCount >= tournament.maxPlayers) throw new Error("TOURNAMENT_FULL");
      const entryFeeRial = getEntryFeeRial(tournament.entryFee);
      let paymentTransactionId: string | null = null;

      if (!isAdmin && entryFeeRial > BigInt(0)) {
        let [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, ownerId)).limit(1);
        if (!wallet) {
          [wallet] = await tx.insert(wallets).values({ userId: ownerId, balance: "0", currency: "RIAL" }).returning();
        }

        const updateResult = await tx.update(wallets)
          .set({ 
            balance: sql`${wallets.balance} - ${entryFeeRial.toString()}`, 
            updatedAt: new Date() 
          })
          .where(and(
            eq(wallets.id, wallet.id),
            sql`${wallets.balance} >= ${entryFeeRial.toString()}`
          ));

        if (updateResult.rowCount === 0) {
          const err = new Error("INSUFFICIENT_BALANCE");
          (err as Error & { details?: unknown }).details = {
            requiredToman: Number(entryFeeRial / BigInt(10)),
          };
          throw err;
        }

        const [paymentTx] = await tx
          .insert(transactions)
          .values({
            walletId: wallet.id,
            amount: entryFeeRial.toString(),
            type: "entry_fee",
            status: "completed",
            referenceId: `entry-${tournamentId}-${playerId}-${Date.now()}`,
            metadata: {
              tournamentId,
              tournamentName: tournament.name,
              playerId,
              playerName: player.displayName,
              userId: ownerId,
            },
          })
          .returning();

        paymentTransactionId = paymentTx.id;
      }

      const [reg] = await tx
        .insert(registrations)
        .values({ tournamentId, playerId, visibleUserId: ownerId })
        .returning();

      return { registration: reg, entryFeeRial: entryFeeRial.toString(), paymentTransactionId };
    });

    await evaluateUserAchievements(result.registration.visibleUserId).catch(() => undefined);

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = isPgUniqueViolation(err) ? "DUPLICATE_REGISTRATION" : err instanceof Error ? err.message : "UNKNOWN";

    const errors: Record<string, { text: string; status: number }> = {
      PLAYER_NOT_FOUND: { text: "پروفایل بازیکن پیدا نشد.", status: 404 },
      PLAYER_FORBIDDEN: { text: "فقط می‌توانی پروفایل بازیکن خودت را ثبت‌نام کنی.", status: 403 },
      TOURNAMENT_NOT_FOUND: { text: "تورنومنت پیدا نشد.", status: 404 },
      REGISTRATION_CLOSED: { text: "ثبت‌نام این تورنومنت بسته شده است.", status: 409 },
      DUPLICATE_REGISTRATION: { text: "این بازیکن قبلاً در تورنومنت ثبت‌نام شده است.", status: 409 },
      TOURNAMENT_FULL: { text: "ظرفیت تورنومنت تکمیل شده است.", status: 409 },
    };

    if (message === "INSUFFICIENT_BALANCE") {
      const details = (err as Error & { details?: { requiredToman?: number; balanceToman?: number } }).details;
      const required = details?.requiredToman?.toLocaleString("fa-IR") || "نامشخص";
      return NextResponse.json(
        {
          error: `موجودی کیف پول کافی نیست. مبلغ لازم: ${required} تومان.`,
          code: "INSUFFICIENT_BALANCE",
          details,
        },
        { status: 402 }
      );
    }

    if (errors[message]) {
      return NextResponse.json({ error: errors[message].text, code: message }, { status: errors[message].status });
    }

    logger.error({ err }, "Registration (tournament) error");
    return NextResponse.json({ error: "ثبت‌نام در تورنومنت با خطا مواجه شد." }, { status: 500 });
  }
}
