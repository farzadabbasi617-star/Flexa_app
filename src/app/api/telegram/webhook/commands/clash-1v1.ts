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
import { updateWalletBalanceSafely } from "@/lib/wallet-balance-service";
import { APP_URL, CANCEL_TEXT } from "../config";
import { mainMenuKeyboard, removeKeyboard, replyKeyboard } from "../keyboards";
import { clearSession, setSession } from "../sessions";
import { sendMessage, sendPhoto } from "../transport";
import { getLinkedUserByTelegram } from "../user-service";
import { extractInviteReference, html } from "../utils";
import { isSupportedClashInvite } from "./clash-1v1-policy";
import { getAdminIds } from "../admin-access";

const QUEUE_LOCK_ID = 7_100_171;
const RECENT_INVITE_REUSE_MS = 24 * 60 * 60 * 1000;

interface QueueParticipant {
  entryId: string;
  playerId: string;
  userId: string;
  telegramId: string;
  inviteLink: string | null;
  matchedAt: Date | null;
  readyAt: Date | null;
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
    if (existing) {
      if (
        existing.description === CLASH_1V1_CONFIG.description &&
        existing.rules === CLASH_1V1_CONFIG.rules &&
        existing.lobbyNotes === CLASH_1V1_CONFIG.lobbyNotes
      ) return existing;

      // Keep the public system-tournament copy aligned with the current bot
      // flow. This also upgrades existing rows from the old QR wording without
      // requiring a destructive migration.
      const [updated] = await tx
        .update(tournaments)
        .set({
          description: CLASH_1V1_CONFIG.description,
          rules: CLASH_1V1_CONFIG.rules,
          lobbyNotes: CLASH_1V1_CONFIG.lobbyNotes,
          updatedAt: new Date(),
        })
        .where(eq(tournaments.id, existing.id))
        .returning();
      return updated || existing;
    }

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

function inviteLinkPrompt(entryId: string) {
  return [
    "🔗 <b>پیوند دوستی کلش رویال را بفرست</b>",
    "",
    "ورودی با موفقیت رزرو شد. برای ورود نهایی به صف:",
    "1) در Clash Royale وارد بخش <b>اجتماعی (Social)</b> شو.",
    "2) روی <b>افزودن دوست (+)</b> بزن.",
    "3) زیر QR روی <b>اشتراک‌گذاری پیوند</b> بزن.",
    "4) پیوند را برای همین بات Share کن یا اینجا Paste کن.",
    "",
    "⚠️ عکس QR نفرست؛ بات فقط پیوند رسمی زیر را می‌پذیرد:",
    "<code>https://link.clashroyale.com/invite/friend/...</code>",
    "",
    `شناسه صف: <code>${html(entryId.slice(0, 8))}</code>`,
  ].join("\n");
}

export async function sendClashFriendLinkGuide(chatId: number) {
  const steps = [
    {
      photo: `${APP_URL}/guides/clash-friend-link-step-1.jpg`,
      caption: "🖼 <b>مرحله ۱:</b> در بخش «اجتماعی» روی دکمه سبز «افزودن دوست» بزن.",
    },
    {
      photo: `${APP_URL}/guides/clash-friend-link-step-2.jpg`,
      caption: "🖼 <b>مرحله ۲:</b> روی «اشتراک‌گذاری پیوند» بزن و پیوند را برای همین بات بفرست. QR داخل تصویر آموزشی برای حفظ حریم خصوصی پوشانده شده است.",
    },
  ];

  for (const step of steps) {
    try {
      const result = await sendPhoto(chatId, step.photo, step.caption);
      if (!result?.ok) logger.warn({ chatId, photo: step.photo }, "Clash friend-link guide photo was not delivered");
    } catch (err) {
      // The text instructions are sufficient fallback; a transient image/CDN
      // error must never break or roll back the paid queue conversation.
      logger.warn({ err, chatId, photo: step.photo }, "Clash friend-link guide photo send failed");
    }
  }
}

export async function promptClash1v1Qr(chatId: number, telegramId: string, entryId: string) {
  // Keep the legacy function/state name so users already in this conversation
  // survive a rolling deploy; the accepted input is now an invite link only.
  await setSession(telegramId, "clash_1v1_qr_submission", { clash1v1EntryId: entryId });
  await sendMessage(chatId, inviteLinkPrompt(entryId), replyKeyboard([[CANCEL_TEXT]]));
  await sendClashFriendLinkGuide(chatId);
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
      matchedAt: clash1v1Entries.matchedAt,
      readyAt: clash1v1Entries.readyAt,
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

async function notifyPairSide(pair: QueuePair, me: QueueParticipant, opponent: QueueParticipant) {
  const chatId = Number(me.telegramId);
  if (!Number.isFinite(chatId)) return false;
  try {
    if (await hasDeliveredMatchNotification(pair.matchId, me.telegramId)) return true;
  } catch (err) {
    // Notification dedupe is a reliability optimization, not a prerequisite
    // for delivering a paid match. Fail open and continue sending the link.
    logger.warn({ err, matchId: pair.matchId, telegramId: me.telegramId }, "Clash notification dedupe lookup failed");
  }

  if (!isSupportedClashInvite(opponent.inviteLink)) {
    logger.warn({ matchId: pair.matchId, opponentEntryId: opponent.entryId }, "Clash opponent invite link is missing");
    await sendMessage(chatId, "⏳ حریف هنوز پیوند دوستی معتبرش را ثبت نکرده است. کمی بعد دوباره وضعیت 1V1 را بررسی کن.");
    return false;
  }
  const keyboard: Array<Array<Record<string, string>>> = [
    [{ text: "🔗 باز کردن پیوند دوستی حریف", url: opponent.inviteLink! }],
  ];
  keyboard.push([
    { text: me.readyAt ? "✅ آماده‌ام" : "🎮 آماده‌ام", callback_data: `clash1v1:ready:${me.entryId}` },
    { text: "🚨 مشکل با حریف", callback_data: `dispute:${pair.matchId}` },
  ]);

  const details = [
    "✅ <b>حریف پیدا شد؛ آماده شوید</b>",
    "",
    `👤 حریف: <b>${html(participantName(opponent))}</b>`,
    `🏷 Player Tag: <code>${html(participantTag(opponent))}</code>`,
    `🔗 پیوند دوستی: ${html(opponent.inviteLink!)}`,
    "",
    "1) دکمه «باز کردن پیوند دوستی حریف» را بزن.",
    "2) در Clash Royale حریف را Add Friend کن.",
    "3) وقتی آماده شدی دکمه «آماده‌ام» را بزن.",
    "4) بازی را فقط بعد از پیام رسمی شروع Match آغاز کنید.",
    "5) بعد از بازی، نتیجه را ثبت کن؛ Battle Log خودکار بررسی می‌شود.",
    "",
    `Match ID: <code>${html(pair.matchId.slice(0, 8))}</code>`,
  ].join("\n");

  let messageResult = await sendMessage(chatId, details, { inline_keyboard: keyboard });
  if (!messageResult?.ok) {
    logger.warn({
      chatId,
      matchId: pair.matchId,
      errorCode: messageResult?.error_code,
      description: messageResult?.description,
    }, "Clash opponent notification with URL button failed; retrying without URL button");

    // Some Telegram clients/API revisions reject specific external URLs in an
    // inline button. Retry with a copyable plain-text link so matching never
    // gets stuck after both players have already paid and submitted links.
    messageResult = await sendMessage(chatId, details, {
      inline_keyboard: [[
        { text: "🎮 آماده‌ام", callback_data: `clash1v1:ready:${me.entryId}` },
        { text: "🚨 مشکل با حریف", callback_data: `dispute:${pair.matchId}` },
      ]],
    });
  }
  if (!messageResult?.ok) {
    logger.warn({
      chatId,
      matchId: pair.matchId,
      errorCode: messageResult?.error_code,
      description: messageResult?.description,
    }, "Clash opponent notification fallback with action buttons failed; retrying as text only");
    messageResult = await sendMessage(chatId, details);
  }
  if (!messageResult?.ok) {
    logger.warn({
      chatId,
      matchId: pair.matchId,
      errorCode: messageResult?.error_code,
      description: messageResult?.description,
    }, "Clash opponent text-only notification failed");
    return false;
  }

  try {
    await db
      .insert(telegramSentNotifications)
      .values({
        dedupeKey: matchNotificationKey(pair.matchId, me.telegramId),
        telegramId: me.telegramId,
        tournamentId: pair.tournamentId,
        type: "clash_1v1_matched",
      })
      .onConflictDoNothing({ target: telegramSentNotifications.dedupeKey });
  } catch (err) {
    // The opponent details were already delivered. A bookkeeping failure must
    // not turn a successful user action into the generic 1V1 error screen.
    logger.warn({ err, matchId: pair.matchId, telegramId: me.telegramId }, "Clash notification dedupe write failed");
  }
  return true;
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

function matchStartedNotificationKey(matchId: string, telegramId: string) {
  return `clash1v1:started:${matchId}:${telegramId}`;
}

async function notifyMatchStartedSide(pair: QueuePair, player: QueueParticipant) {
  const chatId = Number(player.telegramId);
  if (!Number.isFinite(chatId)) return;
  const key = matchStartedNotificationKey(pair.matchId, player.telegramId);
  try {
    const [existing] = await db.select({ id: telegramSentNotifications.id }).from(telegramSentNotifications)
      .where(eq(telegramSentNotifications.dedupeKey, key)).limit(1);
    if (existing) return;
  } catch (err) {
    logger.warn({ err, matchId: pair.matchId }, "1V1 start notification dedupe unavailable");
  }

  const result = await sendMessage(chatId, [
    "🚀 <b>Match شروع شد</b>",
    "",
    "هر دو بازیکن آماده‌اند. همین الان Friendly Battle را آغاز کنید.",
    "پس از پایان، نتیجه را مستقل ثبت کنید؛ سیستم Battle Log کلش رویال را بررسی می‌کند.",
    "",
    `Match ID: <code>${html(pair.matchId.slice(0, 8))}</code>`,
  ].join("\n"), {
    inline_keyboard: [
      [{ text: "✅ بردم", callback_data: `result:win:${pair.matchId}` }, { text: "❌ باختم", callback_data: `result:lose:${pair.matchId}` }],
      [{ text: "📎 ارسال اسکرین‌شات", callback_data: `evidence:${pair.matchId}` }, { text: "🚨 اعتراض", callback_data: `dispute:${pair.matchId}` }],
    ],
  });
  if (!result?.ok) return;
  await db.insert(telegramSentNotifications).values({
    dedupeKey: key,
    telegramId: player.telegramId,
    tournamentId: pair.tournamentId,
    type: "clash_1v1_started",
  }).onConflictDoNothing({ target: telegramSentNotifications.dedupeKey }).catch(() => undefined);
}

async function startReadyPair(pair: QueuePair) {
  await db.update(matches).set({ status: "in_progress", scheduledAt: new Date() })
    .where(and(eq(matches.id, pair.matchId), eq(matches.status, "pending")));
  await Promise.allSettled([
    notifyMatchStartedSide(pair, pair.player1),
    notifyMatchStartedSide(pair, pair.player2),
  ]);
}

export async function markClash1v1Ready(chatId: number, telegramId: string, entryId: string) {
  await ensureClash1v1QueueTournament();
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return openClash1v1Queue(chatId, telegramId);

  const [entry] = await db.update(clash1v1Entries).set({ readyAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(clash1v1Entries.id, entryId),
      eq(clash1v1Entries.userId, linked.userId),
      eq(clash1v1Entries.status, "matched"),
    ))
    .returning({ matchId: clash1v1Entries.matchedMatchId });
  if (!entry?.matchId) {
    await sendMessage(chatId, "این Match برای حساب شما فعال نیست.");
    return;
  }

  const pair = await loadPair(entry.matchId);
  if (!pair) {
    await sendMessage(chatId, "اطلاعات Match کامل نیست؛ وضعیت را دوباره بررسی کن.");
    return;
  }
  if (pair.player1.readyAt && pair.player2.readyAt) {
    await sendMessage(chatId, "✅ آمادگی هر دو بازیکن تأیید شد؛ Match شروع می‌شود.");
    await startReadyPair(pair);
    return;
  }
  await sendMessage(chatId, "✅ آمادگی شما ثبت شد. منتظر آماده‌شدن حریف هستیم.", {
    inline_keyboard: [[{ text: "🔄 بررسی وضعیت", callback_data: "clash1v1:status" }]],
  });
}

export async function processClash1v1ReadyTimeouts(timeoutMinutes = 10) {
  await ensureClash1v1QueueTournament();
  const cutoff = new Date(Date.now() - Math.max(5, timeoutMinutes) * 60 * 1000);
  const rows = await db.select({ matchId: clash1v1Entries.matchedMatchId })
    .from(clash1v1Entries)
    .innerJoin(matches, eq(clash1v1Entries.matchedMatchId, matches.id))
    .where(and(
      eq(clash1v1Entries.status, "matched"),
      eq(matches.status, "pending"),
      lte(clash1v1Entries.matchedAt, cutoff),
      isNotNull(clash1v1Entries.matchedMatchId),
    ));
  const matchIds = [...new Set(rows.map((row) => row.matchId).filter(Boolean) as string[])];
  let timedOut = 0;

  for (const matchId of matchIds) {
    const pair = await loadPair(matchId);
    if (!pair) continue;
    if (pair.player1.readyAt && pair.player2.readyAt) {
      await startReadyPair(pair);
      continue;
    }
    await db.update(matches).set({ status: "disputed" }).where(and(eq(matches.id, matchId), eq(matches.status, "pending")));
    const missing = [pair.player1, pair.player2].filter((player) => !player.readyAt);
    const ready = [pair.player1, pair.player2].filter((player) => player.readyAt);
    await Promise.allSettled([
      ...missing.map((player) => sendMessage(Number(player.telegramId), "⚠️ مهلت اعلام آمادگی تمام شد و عدم حضور شما برای بررسی ثبت شد.")),
      ...ready.map((player) => sendMessage(Number(player.telegramId), "⚠️ حریف در مهلت مقرر آماده نشد؛ پرونده برای تصمیم Refund/Forfeit به ادمین ارسال شد.")),
      ...getAdminIds().map((adminId) => sendMessage(Number(adminId), `🚨 <b>Ready timeout در 1V1</b>\nMatch: <code>${html(matchId.slice(0, 8))}</code>\nغایب: ${missing.map((player) => html(participantName(player))).join("، ") || "—"}`)),
    ]);
    timedOut += 1;
  }
  return { checked: matchIds.length, timedOut };
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
    await sendMessage(chatId, "✅ ورودی پرداخت شده؛ برای ورود به صف، پیوند دوستی کلش رویال را بفرست.", {
      inline_keyboard: [
        [{ text: "🔗 ارسال پیوند دوستی", callback_data: `clash1v1:qr:${entry.id}` }],
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
      "به محض ورود بازیکن آماده بعدی، پیوند دوستی شما برای یکدیگر ارسال می‌شود.",
    ].filter(Boolean).join("\n"), {
      inline_keyboard: [
        [{ text: "🔄 بررسی وضعیت", callback_data: "clash1v1:status" }],
        [{ text: "🔁 تغییر پیوند دوستی", callback_data: `clash1v1:qr:${entry.id}` }],
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

      // Entries matched by the previous QR-based release may not have a text
      // link. Upgrade them in place instead of throwing a generic bot error.
      if (!isSupportedClashInvite(me.inviteLink)) {
        await sendMessage(chatId, "برای ادامه این مسابقه، پیوند دوستی خودت را با روش جدید ثبت کن.");
        await promptClash1v1Qr(chatId, telegramId, me.entryId);
        return;
      }
      if (!isSupportedClashInvite(opponent.inviteLink)) {
        await sendMessage(chatId, [
          "⏳ پیوند دوستی شما ثبت است.",
          "حریف هنوز پیوند دوستی جدیدش را نفرستاده؛ به محض ثبت، بات اطلاعات مسابقه را ارسال می‌کند.",
        ].join("\n"), mainMenuKeyboard());
        return;
      }

      if (me.readyAt && opponent.readyAt) {
        await startReadyPair(pair);
        return;
      }
      if (me.readyAt) {
        await sendMessage(chatId, "✅ شما آماده‌ای؛ منتظر اعلام آمادگی حریف هستیم.", {
          inline_keyboard: [[{ text: "🔄 بررسی وضعیت", callback_data: "clash1v1:status" }]],
        });
        return;
      }
      await notifyPairSide(pair, me, opponent);
      await sendMessage(chatId, "برای شروع Match، بعد از افزودن حریف آمادگی خودت را ثبت کن.", {
        inline_keyboard: [[{ text: "🎮 آماده‌ام", callback_data: `clash1v1:ready:${me.entryId}` }]],
      });
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
      "بعد از ثبت‌نام، «پیوند دوستی» را از Clash Royale برای بات Share می‌کنی و وارد صف می‌شوی. وقتی حریف پیدا شد، بات پیوند شما را برای یکدیگر می‌فرستد.",
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

      const debited = await updateWalletBalanceSafely(tx, wallet.id, feeRial, "decrease");
      if (!debited) {
        const [current] = await tx.select({ balance: wallets.balance }).from(wallets).where(eq(wallets.id, wallet.id)).limit(1);
        return { kind: "insufficient" as const, balance: bigIntFromText(current?.balance || "0") };
      }

      const cutoff = new Date(Date.now() - RECENT_INVITE_REUSE_MS);
      const [recentInvite] = await tx
        .select({
          inviteLink: clash1v1Entries.inviteLink,
          submittedAt: clash1v1Entries.submittedAt,
        })
        .from(clash1v1Entries)
        .where(and(
          eq(clash1v1Entries.userId, linked.userId),
          gte(clash1v1Entries.submittedAt, cutoff),
          isNotNull(clash1v1Entries.inviteLink)
        ))
        .orderBy(desc(clash1v1Entries.submittedAt))
        .limit(1);

      const canReuse = Boolean(recentInvite && isSupportedClashInvite(recentInvite.inviteLink));
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
          inviteLink: canReuse ? recentInvite?.inviteLink || null : null,
          qrFileId: null,
          submittedAt: canReuse ? now : null,
          metadata: { source: "telegram_queue_v3_invite_link", reusedInviteLink: canReuse },
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
      return { kind: "created" as const, entry, reusedInviteLink: canReuse };
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

    if (result.reusedInviteLink) {
      await clearSession(telegramId);
      await sendMessage(chatId, "✅ مبلغ کسر شد و با پیوند دوستی معتبر قبلی مستقیماً وارد صف شدی. در حال جست‌وجوی حریف...", removeKeyboard());
      const matchmaking = await runClash1v1MatchmakingAndNotify();
      if (!matchmaking.matchedPairs) await showActiveEntry(chatId, telegramId, result.entry);
      return;
    }

    await sendMessage(chatId, `✅ مبلغ <b>${html(CLASH_1V1_CONFIG.entryFee)}</b> کسر شد. حالا از Clash Royale روی «اشتراک‌گذاری پیوند» بزن و پیوند دوستی را برای بات بفرست.`);
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
  text?: string;
}) {
  const { chatId, telegramId, entryId } = input;
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) throw new Error("CLASH_QUEUE_ACCOUNT_NOT_LINKED");

  const extracted = extractInviteReference(input.text || "");
  const inviteLink = isSupportedClashInvite(extracted) ? extracted : null;
  if (!inviteLink) {
    await sendMessage(chatId, [
      "❌ پیوند دوستی معتبر پیدا نشد.",
      "",
      "در Clash Royale برو به:",
      "<code>اجتماعی → افزودن دوست (+) → اشتراک‌گذاری پیوند</code>",
      "سپس پیوندی که با آدرس زیر شروع می‌شود را برای بات بفرست:",
      "<code>https://link.clashroyale.com/invite/friend/...</code>",
      "",
      "⚠️ عکس QR پذیرفته نمی‌شود.",
    ].join("\n"));
    return;
  }

  const [updated] = await db
    .update(clash1v1Entries)
    .set({
      status: "queued",
      inviteLink,
      qrFileId: null,
      submittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(clash1v1Entries.id, entryId),
      eq(clash1v1Entries.userId, linked.userId),
      inArray(clash1v1Entries.status, ["waiting_qr", "queued", "matched"])
    ))
    .returning();

  if (!updated) {
    await clearSession(telegramId);
    await sendMessage(chatId, "این ورودی دیگر فعال نیست. برای مشاهده وضعیت /qr را بزن.", removeKeyboard());
    return;
  }

  await clearSession(telegramId);

  if (updated.status === "matched" && updated.matchedMatchId) {
    const pair = await loadPair(updated.matchedMatchId);
    if (pair) {
      const bothReady = isSupportedClashInvite(pair.player1.inviteLink)
        && isSupportedClashInvite(pair.player2.inviteLink);
      if (bothReady) {
        await sendMessage(chatId, "✅ پیوند دوستی به‌روزرسانی شد. اطلاعات حریف در حال ارسال است...", removeKeyboard());
        await notifyPairs([pair]);
      } else {
        await sendMessage(chatId, "✅ پیوند دوستی ثبت شد. منتظر ثبت پیوند حریف هستیم.", mainMenuKeyboard());
      }
      return;
    }
  }

  await sendMessage(chatId, "✅ پیوند دوستی ثبت شد و وارد صف شدی. در حال جست‌وجوی یک حریف آماده...", removeKeyboard());
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
        const refunded = await updateWalletBalanceSafely(
          tx,
          wallet.id,
          bigIntFromText(entry.entryFeeRial),
          "increase"
        );
        if (!refunded) throw new Error("CLASH_QUEUE_REFUND_WALLET_UPDATE_FAILED");
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
        matchedAt: clash1v1Entries.matchedAt,
        readyAt: clash1v1Entries.readyAt,
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
        isNotNull(clash1v1Entries.inviteLink)
      ))
      .orderBy(clash1v1Entries.submittedAt, clash1v1Entries.createdAt)
      .limit(20);

    const candidates = (queued as QueueParticipant[])
      .filter((entry) => isSupportedClashInvite(entry.inviteLink));
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
