import { clash1v1Entries, matches, players, tournaments, transactions, wallets } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export const CLASH_1V1_CONFIG = {
  name: "1V1 کلش رویال",
  categoryLabel: "clash_1v1_queue",
  game: "clash_royale" as const,
  format: "single_elimination" as const,
  status: "registration" as const,
  maxPlayers: 1000,
  entryFee: "50,000 تومان",
  entryFeeToman: 50_000,
  prizePool: "80,000 تومان",
  prize1st: "80,000 تومان",
  prizeToman: 80_000,
  gameMode: "1V1 Friendly Battle",
  mapName: "Arena",
  description:
    "صف خودکار 1V1 کلش رویال: هر بازیکن ۵۰ هزار تومان ورودی می‌دهد، بات تلگرام QR/Share Link را می‌گیرد، دو نفر را به هم وصل می‌کند و برنده ۸۰ هزار تومان جایزه می‌گیرد.",
  rules:
    "• فقط آیدی/اکانت کلش رویال خودتان مجاز است.\n• بعد از پرداخت، QR یا Share Link کلش رویال را به بات بدهید.\n• دو بازیکن به‌صورت خودکار به هم معرفی می‌شوند.\n• نتیجه با اسکرین‌شات/مدرک در بات ثبت و توسط داور تایید می‌شود.\n• جایزه نفر اول هر 1V1: ۸۰,۰۰۰ تومان.",
  lobbyNotes:
    "این حالت نیاز به Room ID یا Password ندارد. حریف از طریق QR/Share Link کلش رویال در بات معرفی می‌شود.",
} as const;

export function isClash1v1TournamentLike(tournament?: {
  game?: string | null;
  name?: string | null;
  categoryLabel?: string | null;
}) {
  if (!tournament) return false;
  return tournament.game === CLASH_1V1_CONFIG.game
    && (tournament.categoryLabel === CLASH_1V1_CONFIG.categoryLabel || tournament.name === CLASH_1V1_CONFIG.name);
}

export function clash1v1PrizeRial() {
  return BigInt(CLASH_1V1_CONFIG.prizeToman) * BigInt(10);
}

export async function payoutClash1v1Prize(tx: any, matchId: string, winnerPlayerId: string) {
  const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) return { paid: false as const, reason: "match_not_found" };

  const [tournament] = await tx
    .select({ id: tournaments.id, name: tournaments.name, game: tournaments.game, categoryLabel: tournaments.categoryLabel })
    .from(tournaments)
    .where(eq(tournaments.id, match.tournamentId))
    .limit(1);

  if (!isClash1v1TournamentLike(tournament)) {
    return { paid: false as const, reason: "not_clash_1v1" };
  }

  const [winner] = await tx
    .select({ userId: players.visibleUserId, displayName: players.displayName })
    .from(players)
    .where(eq(players.id, winnerPlayerId))
    .limit(1);

  if (!winner?.userId) return { paid: false as const, reason: "winner_user_not_found" };

  const referenceId = `clash-1v1-prize-${matchId}`;
  const [existing] = await tx
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.referenceId, referenceId))
    .limit(1);

  if (existing) return { paid: false as const, reason: "already_paid" };

  let [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, winner.userId)).limit(1);
  if (!wallet) {
    [wallet] = await tx.insert(wallets).values({ userId: winner.userId, balance: "0", currency: "RIAL" }).returning();
  }

  const amountRial = clash1v1PrizeRial();
  await tx
    .update(wallets)
    .set({
      balance: sql`${wallets.balance} + ${amountRial.toString()}`,
      updatedAt: new Date(),
    })
    .where(eq(wallets.id, wallet.id));

  const [transaction] = await tx
    .insert(transactions)
    .values({
      walletId: wallet.id,
      amount: amountRial.toString(),
      type: "tournament_win",
      status: "completed",
      referenceId,
      metadata: {
        kind: "clash_1v1_prize",
        matchId,
        tournamentId: match.tournamentId,
        winnerPlayerId,
        winnerUserId: winner.userId,
        prizeToman: CLASH_1V1_CONFIG.prizeToman,
      },
    })
    .returning({ id: transactions.id });

  await tx
    .update(clash1v1Entries)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(clash1v1Entries.matchedMatchId, matchId));

  return {
    paid: true as const,
    transactionId: transaction.id,
    amountRial: amountRial.toString(),
    amountToman: CLASH_1V1_CONFIG.prizeToman,
    winnerUserId: winner.userId,
    winnerName: winner.displayName,
  };
}
