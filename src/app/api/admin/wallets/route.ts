import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, users, wallets } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import { createWalletReference } from "@/lib/wallet-security";

export const dynamic = "force-dynamic";

function toBigIntSafe(value: string | null | undefined) {
  try {
    return BigInt(value || "0");
  } catch {
    return BigInt(0);
  }
}

function tomanToRial(value: unknown) {
  const normalized = String(value ?? "0").replace(/[،,\s]/g, "");
  const toman = Number(normalized);
  if (!Number.isFinite(toman) || toman <= 0) throw new Error("مبلغ معتبر نیست");
  return BigInt(Math.round(toman)) * BigInt(10);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "wallets");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const rows = await db
      .select({
        walletId: wallets.id,
        userId: users.id,
        displayName: users.displayName,
        username: users.username,
        phoneNumber: users.phoneNumber,
        role: users.role,
        balance: wallets.balance,
        currency: wallets.currency,
        updatedAt: wallets.updatedAt,
      })
      .from(users)
      .leftJoin(wallets, eq(wallets.userId, users.id))
      .orderBy(desc(users.createdAt));

    return NextResponse.json(
      rows.map((row) => {
        const rial = toBigIntSafe(row.balance);
        return {
          ...row,
          balanceRial: rial.toString(),
          balanceToman: Number(rial / BigInt(10)),
        };
      })
    );
  } catch {
    return NextResponse.json({ error: "Failed to load wallets" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "wallets");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const userId = String(body.userId || "");
    const direction = body.direction === "decrease" ? "decrease" : "increase";
    const reason = String(body.reason || "اصلاح دستی توسط مدیریت").slice(0, 300);
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const amountRial = tomanToRial(body.amountToman);

    const result = await db.transaction(async (tx) => {
      await tx
        .insert(wallets)
        .values({ userId, balance: "0", currency: "RIAL" })
        .onConflictDoNothing({ target: wallets.userId });

      const [before] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
      if (!before) throw new Error("کیف پول پیدا نشد");
      const current = toBigIntSafe(before.balance);

      const [updated] = await tx
        .update(wallets)
        .set({
          balance: direction === "increase"
            ? sql`${wallets.balance} + ${amountRial.toString()}::numeric`
            : sql`${wallets.balance} - ${amountRial.toString()}::numeric`,
          updatedAt: new Date(),
        })
        .where(
          direction === "increase"
            ? eq(wallets.id, before.id)
            : and(eq(wallets.id, before.id), sql`${wallets.balance} >= ${amountRial.toString()}::numeric`)
        )
        .returning();

      if (!updated) throw new Error("موجودی کافی نیست");

      await tx.insert(transactions).values({
        walletId: updated.id,
        amount: amountRial.toString(),
        type: direction === "increase" ? "deposit" : "withdrawal",
        status: "completed",
        referenceId: createWalletReference("admin"),
        metadata: {
          kind: "admin_adjustment",
          direction,
          reason,
          adminId: auth.user!.id,
          previousBalance: current.toString(),
          nextBalance: updated.balance,
        },
      });

      return updated;
    });

    await logAdminAction({
      adminId: auth.user.id,
      action: direction === "increase" ? "wallet_increase" : "wallet_decrease",
      entityType: "wallet",
      entityId: result.id,
      metadata: { userId, amountRial: amountRial.toString(), reason },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ success: true, wallet: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Wallet update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
