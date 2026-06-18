import { transactions, wallets } from "@/db/schema";
import { bigIntFromText, parseTomanToRial } from "@/lib/money";
import { eq, sql } from "drizzle-orm";

export async function refundTournamentEntryFees(tx: any, tournamentId: string, adminId?: string) {
  const paidEntries = await tx
    .select({
      id: transactions.id,
      walletId: transactions.walletId,
      amount: transactions.amount,
      metadata: transactions.metadata,
    })
    .from(transactions)
    .where(
      sql`${transactions.type} = 'entry_fee' AND ${transactions.status} = 'completed' AND ${transactions.metadata}->>'tournamentId' = ${tournamentId}`
    );

  let refundedCount = 0;
  let refundedRial = BigInt(0);

  for (const entry of paidEntries) {
    const [existingRefund] = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.referenceId, `refund-${entry.id}`))
      .limit(1);

    if (existingRefund) continue;

    const amountStr = entry.amount;
    if (!amountStr) continue;
    const amount = bigIntFromText(amountStr);
    if (amount <= BigInt(0)) continue;

    // ATOMIC UPDATE: Prevent race conditions by doing the addition in the DB
    await tx.update(wallets)
      .set({ 
        balance: sql`${wallets.balance} + ${amountStr}`, 
        updatedAt: new Date() 
      })
      .where(eq(wallets.id, entry.walletId));

    await tx.insert(transactions).values({
      walletId: entry.walletId,
      amount: amountStr,
      type: "refund",
      status: "completed",
      referenceId: `refund-${entry.id}`,
      metadata: {
        kind: "tournament_entry_refund",
        tournamentId,
        originalTransactionId: entry.id,
        adminId: adminId || null,
      },
    });

    await tx
      .update(transactions)
      .set({
        metadata: sql`coalesce(${transactions.metadata}, '{}'::jsonb) || ${JSON.stringify({ refundedAt: new Date().toISOString() })}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, entry.id));

    refundedCount += 1;
    refundedRial += amount;
  }

  return { refundedCount, refundedRial: refundedRial.toString() };
}

export function getEntryFeeRial(entryFee: string | null | undefined) {
  return parseTomanToRial(entryFee);
}
