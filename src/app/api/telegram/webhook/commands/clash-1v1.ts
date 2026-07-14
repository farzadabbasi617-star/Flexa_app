import QRCode from "qrcode";
import { and, count, desc, eq, gte, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clash1v1Entries,
  matches,
  players,
  telegramSentNotifications,
  transactions,
  tournaments,
  users,
  wallets,
} from "@/db/schema";
import { CLASH_1V1_CONFIG, ensureClash1v1Schema } from "@/lib/clash-1v1";
import { bigIntFromText, formatTomanFromRial } from "@/lib/money";
import logger from "@/lib/logger";
import { APP_URL, CANCEL_TEXT } from "../config";
import { decodeQrInviteFromTelegramPhoto } from "../files";
import { mainMenuKeyboard, removeKeyboard, replyKeyboard } from "../keyboards";
import { clearSession, setSession } from "../sessions";
import { sendMessage, sendPhoto, sendPhotoBuffer } from "../transport";
import { getLinkedUserByTelegram } from "../user-service";
import { extractInviteReference, html, isHttpUrl } from "../utils";
import { isSupportedClashInvite } from "./clash-1v1-policy";

const QUEUE_LOCK_ID = 7_100_171;
const RECENT_QR_REUSE_MS = 24 * 60 * 60 * 1000;

interface QueueParticipant {
  entryId: string;
  playerId: string;
  userId: string;
  telegramId: string;
  inviteLink: string | null;
  qrFileId: string | null;
  displayName: string;
  username: string | null;
  gameId: string | null;
  clashRoyaleId: string | null;
  clashRoyaleUsername: string | null;
}

interface QueuePair {
  matchId: string;
  matchNumber: number;
  tournamentId: string;
  tournamentName: string;
  player1: QueueParticipant;
  player2: QueueParticipant;
}

function participantName(player: QueueParticipant) {
  return player.displayName || player.username || player.clashRoyaleUsername || "Gament Player";
}

function participantTag(player: QueueParticipant) {
  return player.clashRoyaleId || player.gameId || player.clashRoyaleUsername || "ثبت نشده";
}

export async function ensureClash1v1QueueTournament() {
  await ensureClash1v1Schema();
  return db.transaction(async (tx) => {
    // There must be exactly one active system queue even when two Render
    // instances cold-start at the same time.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${QUEUE_LOCK_ID})`);
    const [existing] = await tx
      .select()
      .from(tournaments)
      .where(and(
        eq(tournaments.game, CLASH_1V1_CONFIG.game),
        eq(tournaments.status, "registration"),
        or(
          eq(tournaments.categoryLabel, CLASH_1V1_CONFIG.categoryLabel),
          eq(tournaments.name, CLASH_1V1_CONFIG.name)
        )
      ))
      .orderBy(desc(tournaments.createdAt))
      .limit(1);
    if (existing) return existing;

    const [created] = await tx
      .insert(tournaments)
      .values({
        name: CLASH_1V1_CONFIG.name,
        game: CLASH_1V1_CONFIG.game,
        format: CLASH_1V1_CONFIG.format,
        status: CLASH_1V1_CONFIG.status,
        description: CLASH_1V1_CONFIG.description,
        maxPlayers: CLASH_1V1_CONFIG.maxPlayers,
        prizePool: CLASH_1V1_CONFIG.prizePool,
        winnersCount: 1,
        categoryLabel: CLASH_1V1_CONFIG.categoryLabel,
        entryFee: CLASH_1V1_CONFIG.entryFee,
        gameMode: CLASH_1V1_CONFIG.gameMode,
        mapName: CLASH_1V1_CONFIG.mapName,
        serverSlots: 2,
        prize1st: CLASH_1V1_CONFIG.prize1st,
        rules: CLASH_1V1_CONFIG.rules,
        lobbyNotes: CLASH_1V1_CONFIG.lobbyNotes,
      })
      .returning();
    return created;
  });
}

async function getOrCreatePlayer(userId: string, displayName: string, username?: string | null, client: any = db) {
  const [existing] = await client.select().from(players).where(eq(players.visibleUserId, userId)).limit(1);
  if (existing) return existing;
  const [created] = await client
    .insert(players)
    .values({
      visibleUserId: userId,
      username: username || `player_${userId.slice(0, 8)}`,
      displayName: displayName || username || "Gament Player",
    })
    .returning();
  return created;
}

async function getActiveEntry(userId: string) {
  await ensureClash1v1Schema();
  const [entry] = await db
    .select()
    .from(clash1v1Entries)
    .where(and(
      eq(clash1v1Entries.userId, userId),
      inArray(clash1v1Entries.status, ["waiting_qr", "queued", "matched"])
    ))
    .orderBy(desc(clash1v1Entries.createdAt))
    .limit(1);
  return entry || null;
}

async function queuePosition(entry: { id: string; submittedAt: Date | null }) {
  if (!entry.submittedAt) return null;
  const [{ value }] = await db
    .select({ value: count() })
    .from(clash1v1Entries)
    .where(and(
      eq(clash1v1Entries.status, "queued"),
      lte(clash1v1Entries.submittedAt, entry.submittedAt)
    ));
  return Math.max(1, Number(value || 1));
}

function qrPrompt(entryId: string) {
  return [
    "📲 <b>QR کلش رویال را ارسال کن</b>",
    "",
    "ورودی با موفقیت رزرو شد. برای ورود نهایی به صف:",
    "<code>Clash Royale → Social → Add Friends → QR / Share Link</code>",
    "",
    "یکی از این‌ها را بفرست:",
    "• عکس QR Code",
    "• Share Link رسمی کلش رویال",
    "",
    `شناسه صف: <code>${html(entryId.slice(0, 8))}</code>`,
  ].join("\n");
}

export async function promptClash1v1Qr(chatId: number, telegramId: string, entryId: string) {
  await setSession(telegramId, "clash_1v1_qr_submission", { clash1v1EntryId: entryId });
  await sendMessage(chatId, qrPrompt(entryId), replyKeyboard([[CANCEL_TEXT]]));
}

async function loadPair(matchId: string): Promise<QueuePair | null> {
  const [match] = await db
    .select({
      id: matches.id,
      matchNumber: matches.matchNumber,
      tournamentId: matches.tournamentId,
      tournamentName: tournaments.name,
      player1Id: matches.player1Id,
      player2Id: matches.player2Id,
    })
    .from(matches)
    .innerJoin(tournaments, eq(matches.tournamentId, tournaments.id))
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!match?.player1Id || !match.player2Id) return null;

  const rows = await db
    .select({
      entryId: clash1v1Entries.id,
      playerId: clash1v1Entries.playerId,
      userId: clash1v1Entries.userId,
      telegramId: clash1v1Entries.telegramId,
      inviteLink: clash1v1Entries.inviteLink,
      qrFileId: clash1v1Entries.qrFileId,
      displayName: players.displayName,
      username: players.username,
      gameId: players.gameId,
      clashRoyaleId: users.clashRoyaleId,
      clashRoyaleUsername: users.clashRoyaleUsername,
    })
    .from(clash1v1Entries)
    .innerJoin(players, eq(clash1v1Entries.playerId, players.id))
    .leftJoin(users, eq(clash1v1Entries.userId, users.id))
    .where(eq(clash1v1Entries.matchedMatchId, matchId));

  const byPlayer = new Map(rows.map((row) => [row.playerId, row as QueueParticipant]));
  const player1 = byPlayer.get(match.player1Id);
  const player2 = byPlayer.get(match.player2Id);
  if (!player1 || !player2) return null;
  return {
    matchId: match.id,
    matchNumber: match.matchNumber,
    tournamentId: match.tournamentId,
    tournamentName: match.tournamentName,
    player1,
    player2,
  };
}

function matchNotificationKey(matchId: string, telegramId: string) {
  return `clash1v1:matched:${matchId}:${telegramId}`;
}

async function hasDeliveredMatchNotification(matchId: string, telegramId: string) {
  const [row] = await db
    .select({ id: telegramSentNotifications.id })
    .from(telegramSentNotifications)
    .where(eq(telegramSentNotifications.dedupeKey, matchNotificationKey(matchId, telegramId)))
    .limit(1);
  return Boolean(row);
}

async function sendOpponentQr(chatId: number, opponent: QueueParticipant) {
  const caption = `📲 QR حریف: <b>${html(participantName(opponent))}</b>`;
  if (opponent.qrFileId) {
    const result = await sendPhoto(chatId, opponent.qrFileId, caption);
    if (!result?.ok) throw new Error("CLASH_QUEUE_QR_PHOTO_SEND_FAILED");
    return;
  }
  if (opponent.inviteLink) {
    const png = await QRCode.toBuffer(opponent.inviteLink, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
    });
    const result = await sendPhotoBuffer(chatId, png, `clash-opponent-${opponent.entryId.slice(0, 8)}.png`, caption);
    if (!result?.ok) throw new Error("CLASH_QUEUE_GENERATED_QR_SEND_FAILED");
    return;
  }
  throw new Error("CLASH_QUEUE_OPPONENT_QR_MISSING");
}

async function notifyPairSide(pair: QueuePair, me: QueueParticipant, opponent: QueueParticipant) {
  const chatId = Number(me.telegramId);
  if (!Number.isFinite(chatId)) return;
  if (await hasDeliveredMatchNotification(pair.matchId, me.telegramId)) return;

  // Send the scannable asset first, then the instructions and action buttons.
  await sendOpponentQr(chatId, opponent);
  const keyboard: Array<Array<Record<string, string>>> = [];
  if (isHttpUrl(opponent.inviteLink)) {
    keyboard.push([{ text: "🔗 باز کردن لینک دعوت حریف", url: opponent.inviteLink! }]);
  }
  keyboard.push([
    { text: "⚔️ ثبت نتیجه", callback_data: `match:${pair.matchId}` },
    { text: "🚨 مشکل با حریف", callback_data: `dispute:${pair.matchId}` },
  ]);

  const messageResult = await sendMessage(chatId, [
    "✅ <b>حریف پیدا شد؛ بازی را شروع کنید</b>",
    "",
    `👤 حریف: <b>${html(participantName(opponent))}</b>`,
    `🏷 Player Tag: <code>${html(participantTag(opponent))}</code>`,
    opponent.inviteLink ? `🔗 Share Link: <code>${html(opponent.inviteLink)}</code>` : "",
    "",
    "1) QR بالا را اسکن یا لینک را باز کن.",
    "2) حریف را Add Friend کن.",
    "3) Friendly Battle را شروع کنید.",
    "4) بعد از بازی، نتیجه و اسکرین‌شات را ثبت کن.",
    "",
    `Match ID: <code>${html(pair.matchId.slice(0, 8))}</code>`,
  ].filter(Boolean).join("\n"), { inline_keyboard: keyboard });
  if (!messageResult?.ok) throw new Error("CLASH_QUEUE_DETAILS_SEND_FAILED");

  await db
    .insert(telegramSentNotifications)
    .values({
      dedupeKey: matchNotificationKey(pair.matchId, me.telegramId),
      telegramId: me.telegramId,
      tournamentId: pair.tournamentId,
      type: "clash_1v1_matched",
    })
    .onConflictDoNothing({ target: telegramSentNotifications.dedupeKey });
}

async function notifyPairs(pairs: QueuePair[]) {
  for (const pair of pairs) {
    const results = await Promise.allSettled([
      notifyPairSide(pair, pair.player1, pair.player2),
      notifyPairSide(pair, pair.player2, pair.player1),
    ]);
    results.forEach((result, side) => {
      if (result.status === "rejected") {
        logger.warn({ err: result.reason, matchId: pair.matchId, side }, "Clash 1V1 match notification will be retried");
      }
    });
  }
}

async function retryPendingMatchNotifications(limit = 50) {
  const rows = await db
    .select({ matchId: clash1v1Entries.matchedMatchId })
    .from(clash1v1Entries)
    .where(and(
      eq(clash1v1Entries.status, "matched"),
      isNotNull(clash1v1Entries.matchedMatchId)
    ))
    .orderBy(desc(clash1v1Entries.matchedAt))
    .limit(limit * 2);
  const matchIds = [...new Set(rows.map((row) => row.matchId).filter(Boolean) as string[])].slice(0, limit);
  for (const matchId of matchIds) {
    const pair = await loadPair(matchId);
    if (pair) await notifyPairs([pair]);
  }
  return { checkedMatches: matchIds.length };
}

async function showActiveEntry(chatId: number, telegramId: string, entry: Awaited<ReturnType<typeof getActiveEntry>>): Promise<void> {
  if (!entry) return openClash1v1Queue(chatId, telegramId);

  if (entry.status === "waiting_qr") {
    await sendMessage(chatId, "✅ ورودی پرداخت شده، اما برای ورود به صف باید QR یا Share Link را بفرستی.", {
      inline_keyboard: [
        [{ text: "📲 ارسال QR / Link", callback_data: `clash1v1:qr:${entry.id}` }],
        [{ text: "❌ لغو و بازگشت وجه", callback_data: `clash1v1:cancel:${entry.id}` }],
      ],
    });
    return promptClash1v1Qr(chatId, telegramId, entry.id);
  }

  if (entry.status === "queued") {
    const position = await queuePosition(entry);
    await sendMessage(chatId, [
      "🔎 <b>در حال جست‌وجوی حریف...</b>",
      "",
      position ? `جایگاه تقریبی در صف: <b>${position.toLocaleString("fa-IR")}</b>` : "",
      "به محض ورود بازیکن آماده بعدی، QR شما به هم ارسال می‌شود.",
    ].filter(Boolean).join("\n"), {
      inline_keyboard: [
        [{ text: "🔄 بررسی وضعیت", callback_data: "clash1v1:status" }],
        [{ text: "🔁 تغییر QR", callback_data: `clash1v1:qr:${entry.id}` }],
        [{ text: "❌ خروج از صف و بازگشت وجه", callback_data: `clash1v1:cancel:${entry.id}` }],
      ],
    });
    return;
  }

  if (entry.status === "matched" && entry.matchedMatchId) {
    const pair = await loadPair(entry.matchedMatchId);
    if (pair) {
      const me = pair.player1.userId === entry.userId ? pair.player1 : pair.player2;
      const opponent = me === pair.player1 ? pair.player2 : pair.player1;
      await notifyPairSide(pair, me, opponent);
      return;
    }
  }

  await sendMessage(chatId, "وضعیت صف قابل بازیابی نبود. دوباره /qr را بزن.", mainMenuKeyboard());
}

export async function openClash1v1Queue(chatId: number, telegramId: string): Promise<void> {
  try {
    await ensureClash1v1QueueTournament();
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId) {
      await sendMessage(chatId, "برای ورود به صف 1V1 ابتدا حساب تلگرام را به Gament وصل کن.", {
        inline_keyboard: [
          [{ text: "🔗 اتصال حساب", callback_data: "menu:link" }],
          [{ text: "🆕 ساخت حساب", url: `${APP_URL}/register` }],
        ],
      });
      return;
    }

    const active = await getActiveEntry(linked.userId);
    if (active) {
      if (active.status === "queued") await runClash1v1MatchmakingAndNotify();
      const refreshed = await getActiveEntry(linked.userId);
      return showActiveEntry(chatId, telegramId, refreshed || active);
    }

    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, linked.userId)).limit(1);
    const balance = bigIntFromText(wallet?.balance || "0");
    const feeRial = BigInt(CLASH_1V1_CONFIG.entryFeeToman) * BigInt(10);
    await sendMessage(chatId, [
      "⚔️ <b>مچ‌میکینگ 1V1 کلش رویال</b>",
      "",
      `💳 ورودی: <b>${html(CLASH_1V1_CONFIG.entryFee)}</b>`,
      `🏆 جایزه برنده: <b>${html(CLASH_1V1_CONFIG.prize1st)}</b>`,
      `💰 موجودی شما: <b>${html(formatTomanFromRial(balance))}</b>`,
      "",
      "بعد از ثبت‌نام، QR/Share Link را می‌فرستی و وارد صف می‌شوی. وقتی حریف پیدا شد، بات QR شما را به یکدیگر می‌فرستد.",
    ].join("\n"), {
      inline_keyboard: [
        [{ text: "🎮 ثبت‌نام و ورود به صف", callback_data: "clash1v1:register" }],
        ...(balance < feeRial ? [[{ text: "💳 شارژ کیف پول", callback_data: "wallet:deposit" }]] : []),
      ],
    });
  } catch (err) {
    logger.error({ err, telegramId }, "Failed to open Clash 1V1 queue");
    await sendMessage(chatId, "⚠️ صف 1V1 موقتاً در دسترس نیست. چند لحظه دیگر دوباره تلاش کن.");
  }
}

export async function registerClash1v1Queue(chatId: number, telegramId: string) {
  try {
    await ensureClash1v1QueueTournament();
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId) return openClash1v1Queue(chatId, telegramId);

    const active = await getActiveEntry(linked.userId);
    if (active) return openClash1v1Queue(chatId, telegramId);

    const tournament = await ensureClash1v1QueueTournament();
    const feeRial = BigInt(CLASH_1V1_CONFIG.entryFeeToman) * BigInt(10);
    const prizeRial = BigInt(CLASH_1V1_CONFIG.prizeToman) * BigInt(10);

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${QUEUE_LOCK_ID})`);

      const [stillActive] = await tx
        .select()
        .from(clash1v1Entries)
        .where(and(
          eq(clash1v1Entries.userId, linked.userId),
          inArray(clash1v1Entries.status, ["waiting_qr", "queued", "matched"])
        ))
        .limit(1);
      if (stillActive) return { kind: "active" as const, entry: stillActive };

      const player = await getOrCreatePlayer(
        linked.userId,
        linked.displayName || linked.username || "Gament Player",
        linked.username,
        tx
      );

      let [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, linked.userId)).limit(1);
      if (!wallet) {
        [wallet] = await tx
          .insert(wallets)
          .values({ userId: linked.userId, balance: "0", currency: "RIAL" })
          .returning();
      }

      const [debited] = await tx
        .update(wallets)
        .set({ balance: sql`${wallets.balance} - ${feeRial.toString()}`, updatedAt: new Date() })
        .where(and(eq(wallets.id, wallet.id), sql`${wallets.balance} >= ${feeRial.toString()}`))
        .returning({ id: wallets.id });
      if (!debited) {
        const [current] = await tx.select({ balance: wallets.balance }).from(wallets).where(eq(wallets.id, wallet.id)).limit(1);
        return { kind: "insufficient" as const, balance: bigIntFromText(current?.balance || "0") };
      }

      const cutoff = new Date(Date.now() - RECENT_QR_REUSE_MS);
      const [recentQr] = await tx
        .select({
          inviteLink: clash1v1Entries.inviteLink,
          qrFileId: clash1v1Entries.qrFileId,
          submittedAt: clash1v1Entries.submittedAt,
        })
        .from(clash1v1Entries)
        .where(and(
          eq(clash1v1Entries.userId, linked.userId),
          gte(clash1v1Entries.submittedAt, cutoff),
          or(isNotNull(clash1v1Entries.inviteLink), isNotNull(clash1v1Entries.qrFileId))
        ))
        .orderBy(desc(clash1v1Entries.submittedAt))
        .limit(1);

      const canReuse = Boolean(recentQr && (recentQr.qrFileId || isSupportedClashInvite(recentQr.inviteLink)));
      const now = new Date();
      const [entry] = await tx
        .insert(clash1v1Entries)
        .values({
          tournamentId: tournament.id,
          userId: linked.userId,
          playerId: player.id,
          telegramId,
          status: canReuse ? "queued" : "waiting_qr",
          entryFeeRial: feeRial.toString(),
          prizeRial: prizeRial.toString(),
          inviteLink: canReuse ? recentQr?.inviteLink || null : null,
          qrFileId: canReuse ? recentQr?.qrFileId || null : null,
          submittedAt: canReuse ? now : null,
          metadata: { source: "telegram_queue_v2", reusedQr: canReuse },
        })
        .returning();

      await tx.insert(transactions).values({
        walletId: wallet.id,
        amount: feeRial.toString(),
        type: "entry_fee",
        status: "completed",
        referenceId: `clash-1v1-entry-${entry.id}`,
        metadata: {
          kind: "clash_1v1_entry_fee",
          entryId: entry.id,
          tournamentId: tournament.id,
          playerId: player.id,
          userId: linked.userId,
          telegramId,
        },
      });
      return { kind: "created" as const, entry, reusedQr: canReuse };
    });

    if (result.kind === "active") return openClash1v1Queue(chatId, telegramId);
    if (result.kind === "insufficient") {
      await sendMessage(chatId, [
        "💳 <b>موجودی کافی نیست</b>",
        `مبلغ لازم: <b>${html(formatTomanFromRial(feeRial))}</b>`,
        `موجودی شما: <b>${html(formatTomanFromRial(result.balance))}</b>`,
      ].join("\n"), {
        inline_keyboard: [[{ text: "💳 شارژ کیف پول", callback_data: "wallet:deposit" }]],
      });
      return;
    }

    if (result.reusedQr) {
      await clearSession(telegramId);
      await sendMessage(chatId, "✅ مبلغ کسر شد و با QR معتبر قبلی مستقیماً وارد صف شدی. در حال جست‌وجوی حریف...", removeKeyboard());
      const matchmaking = await runClash1v1MatchmakingAndNotify();
      if (!matchmaking.matchedPairs) await showActiveEntry(chatId, telegramId, result.entry);
      return;
    }

    await sendMessage(chatId, `✅ مبلغ <b>${html(CLASH_1V1_CONFIG.entryFee)}</b> کسر شد. حالا QR یا Share Link را بفرست تا وارد صف شوی.`);
    await promptClash1v1Qr(chatId, telegramId, result.entry.id);
  } catch (err) {
    logger.error({ err, telegramId }, "Clash 1V1 queue registration failed");
    await sendMessage(chatId, [
      "⚠️ <b>ثبت‌نام انجام نشد</b>",
      "تراکنش Rollback شد و در این تلاش وجهی کسر نشده است.",
      "چند لحظه دیگر دوباره امتحان کن یا با پشتیبانی تماس بگیر.",
    ].join("\n"), {
      inline_keyboard: [[{ text: "🔁 تلاش دوباره", callback_data: "clash1v1:register" }]],
    });
  }
}

export async function submitClash1v1Qr(input: {
  chatId: number;
  telegramId: string;
  entryId: string;
  photoFileId?: string;
  text?: string;
}) {
  const { chatId, telegramId, entryId, photoFileId } = input;
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) throw new Error("CLASH_QUEUE_ACCOUNT_NOT_LINKED");

  const typed = extractInviteReference(input.text || "");
  const typedInvite = isSupportedClashInvite(typed) ? typed : null;
  const decoded = photoFileId ? await decodeQrInviteFromTelegramPhoto(photoFileId) : null;
  const decodedInvite = isSupportedClashInvite(decoded) ? decoded : null;
  const inviteLink = typedInvite || decodedInvite;

  if (!photoFileId && !inviteLink) {
    await sendMessage(chatId, "QR یا Share Link معتبر کلش رویال پیدا نشد. لطفاً عکس QR یا لینک رسمی link.clashroyale.com را بفرست.");
    return;
  }

  const [updated] = await db
    .update(clash1v1Entries)
    .set({
      status: "queued",
      inviteLink,
      qrFileId: photoFileId || null,
      submittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(clash1v1Entries.id, entryId),
      eq(clash1v1Entries.userId, linked.userId),
      inArray(clash1v1Entries.status, ["waiting_qr", "queued"])
    ))
    .returning();

  if (!updated) {
    await clearSession(telegramId);
    await sendMessage(chatId, "این ورودی دیگر فعال نیست. برای مشاهده وضعیت /qr را بزن.", removeKeyboard());
    return;
  }

  await clearSession(telegramId);
  await sendMessage(chatId, "✅ QR ثبت شد و وارد صف شدی. در حال جست‌وجوی یک حریف آماده...", removeKeyboard());
  const matchmaking = await runClash1v1MatchmakingAndNotify();
  if (!matchmaking.matchedPairs) await showActiveEntry(chatId, telegramId, updated);
}

export async function cancelClash1v1Queue(chatId: number, telegramId: string, entryId: string) {
  try {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId) return openClash1v1Queue(chatId, telegramId);

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${QUEUE_LOCK_ID})`);
      const [entry] = await tx
        .select()
        .from(clash1v1Entries)
        .where(and(eq(clash1v1Entries.id, entryId), eq(clash1v1Entries.userId, linked.userId)))
        .limit(1);
      if (!entry) return { kind: "missing" as const };
      if (entry.status === "matched") return { kind: "matched" as const };
      if (entry.status === "cancelled") return { kind: "cancelled" as const };
      if (!["waiting_qr", "queued"].includes(entry.status)) return { kind: "closed" as const };

      const referenceId = `clash-1v1-cancel-refund-${entry.id}`;
      const [existingRefund] = await tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.referenceId, referenceId))
        .limit(1);
      if (!existingRefund) {
        let [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, linked.userId)).limit(1);
        if (!wallet) {
          [wallet] = await tx.insert(wallets).values({ userId: linked.userId, balance: "0", currency: "RIAL" }).returning();
        }
        await tx
          .update(wallets)
          .set({ balance: sql`${wallets.balance} + ${entry.entryFeeRial}`, updatedAt: new Date() })
          .where(eq(wallets.id, wallet.id));
        await tx.insert(transactions).values({
          walletId: wallet.id,
          amount: entry.entryFeeRial,
          type: "refund",
          status: "completed",
          referenceId,
          metadata: { kind: "clash_1v1_queue_cancel_refund", entryId: entry.id, userId: linked.userId },
        });
      }
      await tx
        .update(clash1v1Entries)
        .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(clash1v1Entries.id, entry.id));
      return { kind: "refunded" as const, amount: entry.entryFeeRial };
    });

    await clearSession(telegramId);
    if (result.kind === "matched") {
      await sendMessage(chatId, "حریف پیدا شده و دیگر امکان خروج از صف و بازگشت وجه وجود ندارد. نتیجه را از بخش مسابقات ثبت کن.");
    } else if (result.kind === "refunded") {
      await sendMessage(chatId, `✅ از صف خارج شدی و <b>${html(formatTomanFromRial(bigIntFromText(result.amount)))}</b> به کیف پول برگشت.`, mainMenuKeyboard());
    } else {
      await sendMessage(chatId, "این ورودی قبلاً بسته یا لغو شده است.", mainMenuKeyboard());
    }
  } catch (err) {
    logger.error({ err, telegramId, entryId }, "Failed to cancel Clash 1V1 queue entry");
    await sendMessage(chatId, "لغو صف انجام نشد. دوباره وضعیت را بررسی کن.");
  }
}

export async function runClash1v1Matchmaking(): Promise<QueuePair[]> {
  await ensureClash1v1QueueTournament();
  const pairs = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${QUEUE_LOCK_ID})`);
    const [tournament] = await tx
      .select()
      .from(tournaments)
      .where(and(
        eq(tournaments.game, CLASH_1V1_CONFIG.game),
        eq(tournaments.status, "registration"),
        or(eq(tournaments.categoryLabel, CLASH_1V1_CONFIG.categoryLabel), eq(tournaments.name, CLASH_1V1_CONFIG.name))
      ))
      .orderBy(desc(tournaments.createdAt))
      .limit(1);
    if (!tournament) return [];

    const queued = await tx
      .select({
        entryId: clash1v1Entries.id,
        playerId: clash1v1Entries.playerId,
        userId: clash1v1Entries.userId,
        telegramId: clash1v1Entries.telegramId,
        inviteLink: clash1v1Entries.inviteLink,
        qrFileId: clash1v1Entries.qrFileId,
        displayName: players.displayName,
        username: players.username,
        gameId: players.gameId,
        clashRoyaleId: users.clashRoyaleId,
        clashRoyaleUsername: users.clashRoyaleUsername,
      })
      .from(clash1v1Entries)
      .innerJoin(players, eq(clash1v1Entries.playerId, players.id))
      .leftJoin(users, eq(clash1v1Entries.userId, users.id))
      .where(and(
        eq(clash1v1Entries.status, "queued"),
        isNotNull(clash1v1Entries.submittedAt),
        or(isNotNull(clash1v1Entries.qrFileId), isNotNull(clash1v1Entries.inviteLink))
      ))
      .orderBy(clash1v1Entries.submittedAt, clash1v1Entries.createdAt)
      .limit(20);

    const candidates = queued as QueueParticipant[];
    const created: QueuePair[] = [];
    while (candidates.length >= 2) {
      const player1 = candidates.shift()!;
      const opponentIndex = candidates.findIndex((item) => item.userId !== player1.userId);
      if (opponentIndex < 0) break;
      const [player2] = candidates.splice(opponentIndex, 1);

      const [{ value }] = await tx.select({ value: count() }).from(matches).where(eq(matches.tournamentId, tournament.id));
      const [match] = await tx
        .insert(matches)
        .values({
          tournamentId: tournament.id,
          round: 1,
          matchNumber: Number(value || 0) + 1,
          player1Id: player1.playerId,
          player2Id: player2.playerId,
          status: "pending",
        })
        .returning({ id: matches.id, matchNumber: matches.matchNumber });

      const matchedAt = new Date();
      const first = await tx
        .update(clash1v1Entries)
        .set({ status: "matched", matchedMatchId: match.id, matchedAt, updatedAt: matchedAt })
        .where(and(eq(clash1v1Entries.id, player1.entryId), eq(clash1v1Entries.status, "queued")))
        .returning({ id: clash1v1Entries.id });
      const second = await tx
        .update(clash1v1Entries)
        .set({ status: "matched", matchedMatchId: match.id, matchedAt, updatedAt: matchedAt })
        .where(and(eq(clash1v1Entries.id, player2.entryId), eq(clash1v1Entries.status, "queued")))
        .returning({ id: clash1v1Entries.id });
      if (!first.length || !second.length) throw new Error("CLASH_QUEUE_CLAIM_RACE");

      created.push({
        matchId: match.id,
        matchNumber: match.matchNumber,
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        player1,
        player2,
      });
    }
    return created;
  });
  return pairs;
}

export async function runClash1v1MatchmakingAndNotify() {
  const pairs = await runClash1v1Matchmaking();
  await notifyPairs(pairs);
  const notifications = await retryPendingMatchNotifications(50);
  return { matchedPairs: pairs.length, ...notifications };
}
