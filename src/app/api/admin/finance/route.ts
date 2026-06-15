import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, users, wallets } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";

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
