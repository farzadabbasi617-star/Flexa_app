import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, users, wallets } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import { bigIntFromText } from "@/lib/money";

export const dynamic = "force-dynamic";

function bi(value: string | null | undefined) {
  try { return BigInt(value || "0"); } catch { return BigInt(0); }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "finance");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const txRows = await db
      .select({
        id: transactions.id,
        walletId: transactions.walletId,
        amount: transactions.amount,
        type: transactions.type,
        status: transactions.status,
        referenceId: transactions.referenceId,
        metadata: transactions.metadata,
        createdAt: transactions.createdAt,
        updatedAt: transactions.updatedAt,
        userId: users.id,
        displayName: users.displayName,
        username: users.username,
        phoneNumber: users.phoneNumber,
      })
      .from(transactions)
      .leftJoin(wallets, eq(transactions.walletId, wallets.id))
      .leftJoin(users, eq(wallets.userId, users.id))
      .orderBy(desc(transactions.createdAt))
      .limit(500);

    const walletRows = await db
      .select({ balance: wallets.balance })
      .from(wallets);

    let totalDeposits = BigInt(0);
    let totalWithdrawals = BigInt(0);
    let totalEntryFees = BigInt(0);
    let totalWins = BigInt(0);
    let completedTransactions = 0;
    let pendingTransactions = 0;

    for (const tx of txRows) {
      const amount = bi(tx.amount);
      if (tx.status === "completed") completedTransactions += 1;
      if (tx.status === "pending") pendingTransactions += 1;
      if (tx.type === "deposit") totalDeposits += amount;
      if (tx.type === "withdrawal") totalWithdrawals += amount;
      if (tx.type === "entry_fee") totalEntryFees += amount;
      if (tx.type === "tournament_win") totalWins += amount;
    }

    const totalWalletBalance = walletRows.reduce((sum, w) => sum + bi(w.balance), BigInt(0));

    return NextResponse.json({
      summary: {
        totalDepositsRial: totalDeposits.toString(),
        totalDepositsToman: Number(totalDeposits / BigInt(10)),
        totalWithdrawalsRial: totalWithdrawals.toString(),
        totalWithdrawalsToman: Number(totalWithdrawals / BigInt(10)),
        totalEntryFeesRial: totalEntryFees.toString(),
        totalEntryFeesToman: Number(totalEntryFees / BigInt(10)),
        totalTournamentWinsRial: totalWins.toString(),
        totalTournamentWinsToman: Number(totalWins / BigInt(10)),
        totalWalletBalanceRial: totalWalletBalance.toString(),
        totalWalletBalanceToman: Number(totalWalletBalance / BigInt(10)),
        completedTransactions,
        pendingTransactions,
        transactionCount: txRows.length,
      },
      transactions: txRows.map((tx) => ({
        ...tx,
        amountRial: bi(tx.amount).toString(),
        amountToman: Number(bi(tx.amount) / BigInt(10)),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load finance report" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "finance");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const transactionId = String(body.transactionId || "");
    const action = String(body.action || "");
    if (!transactionId || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "transactionId/action required" }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {
      const [transaction] = await tx.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1);
      if (!transaction) throw new Error("TRANSACTION_NOT_FOUND");
      if (transaction.status !== "pending") throw new Error("TRANSACTION_NOT_PENDING");

      if (action === "reject") {
        const [updated] = await tx
          .update(transactions)
          .set({ status: "failed", updatedAt: new Date(), metadata: sql`coalesce(${transactions.metadata}, '{}'::jsonb) || ${JSON.stringify({ rejectedBy: auth.user!.id, rejectedAt: new Date().toISOString() })}::jsonb` })
          .where(eq(transactions.id, transactionId))
          .returning();
        return updated;
      }

      if (transaction.type !== "deposit") throw new Error("ONLY_DEPOSIT_APPROVAL_SUPPORTED");

      await tx.execute(sql`select id from wallets where id = ${transaction.walletId} for update`);
      const [wallet] = await tx.select().from(wallets).where(eq(wallets.id, transaction.walletId)).limit(1);
      if (!wallet) throw new Error("WALLET_NOT_FOUND");

      const amount = bigIntFromText(transaction.amount);
      const next = bigIntFromText(wallet.balance) + amount;
      await tx.update(wallets).set({ balance: next.toString(), updatedAt: new Date() }).where(eq(wallets.id, wallet.id));

      const [updated] = await tx
        .update(transactions)
        .set({ status: "completed", updatedAt: new Date(), metadata: sql`coalesce(${transactions.metadata}, '{}'::jsonb) || ${JSON.stringify({ approvedBy: auth.user!.id, approvedAt: new Date().toISOString() })}::jsonb` })
        .where(eq(transactions.id, transactionId))
        .returning();
      return updated;
    });

    await logAdminAction({
      adminId: auth.user.id,
      action: action === "approve" ? "approve_deposit" : "reject_deposit",
      entityType: "transaction",
      entityId: transactionId,
      metadata: { status: result.status, type: result.type, amount: result.amount },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ success: true, transaction: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Finance update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
