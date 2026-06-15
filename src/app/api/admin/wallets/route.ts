import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, users, wallets } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";

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
      let [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, userId));
      if (!wallet) {
        [wallet] = await tx.insert(wallets).values({ userId, balance: "0", currency: "RIAL" }).returning();
      }

      const current = toBigIntSafe(wallet.balance);
      const next = direction === "increase" ? current + amountRial : current - amountRial;
      if (next < BigInt(0)) throw new Error("موجودی کافی نیست");

      const [updated] = await tx
        .update(wallets)
        .set({ balance: next.toString(), updatedAt: new Date() })
        .where(eq(wallets.id, wallet.id))
        .returning();

      await tx.insert(transactions).values({
        walletId: wallet.id,
        amount: amountRial.toString(),
        type: direction === "increase" ? "deposit" : "withdrawal",
        status: "completed",
        referenceId: `admin-${Date.now()}`,
        metadata: {
          kind: "admin_adjustment",
          direction,
          reason,
          adminId: auth.user!.id,
          previousBalance: current.toString(),
          nextBalance: next.toString(),
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
