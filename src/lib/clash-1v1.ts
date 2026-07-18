import { db } from "@/db";
import { clash1v1Entries, matches, players, tournaments, transactions, wallets } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { ensureWalletMoneySchema, updateWalletBalanceSafely } from "@/lib/wallet-balance-service";


let clash1v1SchemaReady: Promise<void> | null = null;

async function createClash1v1Schema(client: any) {
  await ensureWalletMoneySchema(client);
  await client.execute(sql.raw(`DO $$ BEGIN
    CREATE TYPE clash_1v1_entry_status AS ENUM ('waiting_qr', 'queued', 'matched', 'completed', 'cancelled');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`));

  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS clash_1v1_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id uuid NOT NULL REFERENCES tournaments(id),
    user_id uuid NOT NULL REFERENCES users(id),
    player_id uuid NOT NULL REFERENCES players(id),
    telegram_id varchar(32) NOT NULL,
    status clash_1v1_entry_status NOT NULL DEFAULT 'waiting_qr',
    entry_fee_rial numeric(20,0) NOT NULL DEFAULT 500000,
    prize_rial numeric(20,0) NOT NULL DEFAULT 800000,
    invite_link text,
    qr_file_id varchar(255),
    submitted_at timestamp,
    matched_match_id uuid REFERENCES matches(id),
    matched_at timestamp,
    ready_at timestamp,
    completed_at timestamp,
    cancelled_at timestamp,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    metadata jsonb
  );`));

  await client.execute(sql.raw(`ALTER TABLE clash_1v1_entries ADD COLUMN IF NOT EXISTS ready_at timestamp;`));
  await client.execute(sql.raw(`ALTER TABLE clash_1v1_entries ADD COLUMN IF NOT EXISTS qr_file_id varchar(255);`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS clash_1v1_entries_user_status_idx ON clash_1v1_entries(user_id, status);`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS clash_1v1_entries_status_submitted_idx ON clash_1v1_entries(status, submitted_at);`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS clash_1v1_entries_match_idx ON clash_1v1_entries(matched_match_id);`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS clash_1v1_entries_telegram_idx ON clash_1v1_entries(telegram_id);`));

  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS match_result_claims (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id uuid NOT NULL REFERENCES matches(id),
    player_id uuid NOT NULL REFERENCES players(id),
    user_id uuid NOT NULL REFERENCES users(id),
    telegram_id varchar(32),
    claim varchar(10) NOT NULL CHECK (claim IN ('win', 'lose')),
    submitted_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    CONSTRAINT match_result_claims_match_player_unique UNIQUE (match_id, player_id)
  );`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS match_result_claims_match_idx ON match_result_claims(match_id);`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS match_result_claims_user_idx ON match_result_claims(user_id);`));
}

/**
 * Production safety net: Render/Neon deployments may miss manual migrations.
 * The 1V1 bot calls this before touching the queue table, so a missing
 * `clash_1v1_entries` table does not break Telegram callbacks.
 */
export async function ensureClash1v1Schema(client: any = db) {
  if (client === db) {
    if (!clash1v1SchemaReady) {
      clash1v1SchemaReady = createClash1v1Schema(client).catch((err) => {
        clash1v1SchemaReady = null;
        throw err;
      });
    }
    return clash1v1SchemaReady;
  }
  return createClash1v1Schema(client);
}

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
    "صف خودکار 1V1 کلش رویال: هر بازیکن ۵۰ هزار تومان ورودی می‌دهد، QR یا پیوند دوستی رسمی کلش رویال را برای بات می‌فرستد، دو نفر به هم وصل می‌شوند و برنده ۸۰ هزار تومان جایزه می‌گیرد.",
  rules:
    "• فقط آیدی/اکانت کلش رویال خودتان مجاز است.\n• بعد از پرداخت، از بخش افزودن دوست QR یا «اشتراک‌گذاری پیوند» را برای بات بفرستید.\n• دو بازیکن به‌صورت خودکار به هم معرفی می‌شوند.\n• هر دو بازیکن نتیجه را مستقل ثبت می‌کنند؛ نتایج موافق خودکار نهایی و اختلاف‌ها توسط داور بررسی می‌شوند.\n• ارسال اسکرین‌شات نتیجه برای بررسی اختلاف توصیه می‌شود.\n• جایزه نفر اول هر 1V1: ۸۰,۰۰۰ تومان.",
  lobbyNotes:
    "این حالت نیاز به Room ID یا Password ندارد. بات QR یا پیوند دوستی دو حریف را برای یکدیگر ارسال می‌کند.",
 } as const;

/** The 1V1 category is matchmaking-only, never a manually hosted room. */
export function normalizeClash1v1QueueSettings<T extends Record<string, unknown>>(input: T): T & Record<string, unknown> {
  if (String(input.categoryLabel || "") !== CLASH_1V1_CONFIG.categoryLabel) return input;
  return {
    ...input,
    name: CLASH_1V1_CONFIG.name, game: CLASH_1V1_CONFIG.game, format: CLASH_1V1_CONFIG.format, status: "registration",
    maxPlayers: CLASH_1V1_CONFIG.maxPlayers, serverSlots: 2, winnersCount: 1,
    entryFee: CLASH_1V1_CONFIG.entryFee, prizePool: CLASH_1V1_CONFIG.prizePool, prize1st: CLASH_1V1_CONFIG.prize1st,
    prize2nd: null, prize3rd: null, prize4to10: null, gameMode: CLASH_1V1_CONFIG.gameMode, mapName: CLASH_1V1_CONFIG.mapName,
    description: CLASH_1V1_CONFIG.description, rules: CLASH_1V1_CONFIG.rules, lobbyNotes: CLASH_1V1_CONFIG.lobbyNotes,
    roomId: null, roomPassword: null, roomVisibleAt: null,
  } as T & Record<string, unknown>;
}

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
  await ensureClash1v1Schema(tx);
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
  const credited = await updateWalletBalanceSafely(tx, wallet.id, amountRial, "increase");
  if (!credited) throw new Error("CLASH_1V1_PRIZE_WALLET_UPDATE_FAILED");

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

/** Complete a match exactly once, apply stats, and settle the 1V1 prize. */
export async function finalizeMatchResult(tx: any, matchId: string, winnerId: string) {
  await ensureClash1v1Schema(tx);
  const [before] = await tx.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!before) return { completed: false as const, reason: "match_not_found" as const };
  if (!before.player1Id || !before.player2Id) return { completed: false as const, reason: "match_not_ready" as const };
  if (winnerId !== before.player1Id && winnerId !== before.player2Id) {
    return { completed: false as const, reason: "invalid_winner" as const };
  }

  const loserId = winnerId === before.player1Id ? before.player2Id : before.player1Id;
  const [completed] = await tx
    .update(matches)
    .set({ status: "completed", winnerId, completedAt: before.completedAt || new Date() })
    .where(and(eq(matches.id, matchId), sql`${matches.status} <> 'completed'`))
    .returning();

  if (!completed) {
    return {
      completed: true as const,
      transitioned: false as const,
      winnerId: before.winnerId || winnerId,
      loserId,
      tournamentId: before.tournamentId,
      prize: { paid: false as const, reason: "already_completed" as const },
    };
  }

  await tx
    .update(players)
    .set({ wins: sql`${players.wins} + 1`, rating: sql`${players.rating} + 25` })
    .where(eq(players.id, winnerId));
  await tx
    .update(players)
    .set({ losses: sql`${players.losses} + 1`, rating: sql`GREATEST(0, ${players.rating} - 15)` })
    .where(eq(players.id, loserId));

  const prize = await payoutClash1v1Prize(tx, matchId, winnerId);
  return {
    completed: true as const,
    transitioned: true as const,
    winnerId,
    loserId,
    tournamentId: before.tournamentId,
    prize,
  };
}
