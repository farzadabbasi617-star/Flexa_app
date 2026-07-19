import { NextRequest, NextResponse } from "next/server";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { clash1v1Entries, matchResultClaims, matches, players, registrations, telegramAccounts, telegramPreRegistrations, telegramSentNotifications, tickets, tournaments, transactions, users, honors, honorLikes, honorViews } from "@/db/schema";
import { getTelegramChannelChatId } from "@/lib/telegram";
import {
  cleanupTelegramReliability,
  enqueueTelegramMessage as sendTelegramMessage,
  processTelegramOutbox,
} from "@/lib/telegram-reliability";
import { generateDailyGamingNews } from "@/lib/gaming-news-generator";
import logger from "@/lib/logger";
import { processClash1v1ReadyTimeouts, runClash1v1MatchmakingAndNotify } from "../webhook/commands/clash-1v1";
import { CLASH_PRIVATE_DRAFT_CATEGORY } from "@/lib/clash-private-tournament";
import { ensurePrivateTournamentAttendanceSchema, privateCheckInWindow } from "@/lib/private-tournament-attendance";
import { CLASH_1V1_CONFIG, expireClash1v1Challenges, finalizeMatchResult } from "@/lib/clash-1v1";
import { resolveMatchResultClaims, type MatchResultClaimValue } from "@/lib/match-result-policy";
import { clashBattleMatchesExpectedMode, isClashDuelGameMode } from "@/lib/clash-duel-policy";
import { getClashRoyaleApiConfiguration, normalizeClashRoyaleTag, verifyClashRoyaleHeadToHead } from "@/lib/clash-royale-api";
import { processStoreOrderDeadlines } from "@/lib/store-service";

export const dynamic = "force-dynamic";

function html(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function gameLabel(game?: string | null) {
  const map: Record<string, string> = {
    cod_mobile: "🎯 کالاف موبایل",
    fortnite: "🏗️ فورتنایت",
    clash_royale: "👑 کلش رویال",
  };
  return map[String(game || "")] || game || "گیمینگ";
}

function validateCron(request: NextRequest) {
  const secret = process.env.TELEGRAM_CRON_SECRET || process.env.CRON_SECRET || "";
  if (!secret) return { ok: false as const, status: 503, error: "TELEGRAM_CRON_SECRET is not configured" };
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || request.nextUrl.searchParams.get("secret") || "";
  if (provided !== secret) return { ok: false as const, status: 401, error: "Unauthorized" };
  return { ok: true as const, status: 200, error: null };
}

async function hasSent(dedupeKey: string) {
  const [row] = await db.select({ id: telegramSentNotifications.id }).from(telegramSentNotifications).where(eq(telegramSentNotifications.dedupeKey, dedupeKey)).limit(1);
  return Boolean(row);
}

async function markSent(dedupeKey: string, type: string, tournamentId?: string, telegramId?: string) {
  await db.insert(telegramSentNotifications).values({ dedupeKey, type, tournamentId, telegramId }).onConflictDoNothing({ target: telegramSentNotifications.dedupeKey });
}

async function tournamentRecipients(tournamentId: string) {
  return db
    .select({
      telegramId: telegramAccounts.telegramId,
      registrationId: registrations.id,
      checkedInAt: registrations.checkedInAt,
    })
    .from(registrations)
    .innerJoin(telegramAccounts, eq(registrations.visibleUserId, telegramAccounts.userId))
    .where(eq(registrations.tournamentId, tournamentId));
}

async function cleanupClassifiedAds() {
  const maxAgeDays = Number(process.env.CLASSIFIED_ADS_MAX_AGE_DAYS || "7");
  if (maxAgeDays <= 0) return { deleted: 0, reason: "disabled" };
  const { cleanupOldClassifiedAds } = await import("@/lib/classified-scraper");
  return cleanupOldClassifiedAds();
}

async function sendReminders() {
  const now = Date.now();
  const futureLimit = new Date(now + 24 * 60 * 60 * 1000 + 5 * 60 * 1000);
  const rows = await db.select().from(tournaments).where(inArray(tournaments.status, ["registration", "in_progress"]));
  let sent = 0;

  for (const tournament of rows) {
    if (!tournament.startDate) continue;
    const startTime = new Date(tournament.startDate).getTime();
    if (!Number.isFinite(startTime) || startTime < now || startTime > futureLimit.getTime()) continue;
    const minutes = Math.round((startTime - now) / 60000);
    const bucket = minutes <= 16 ? 15 : minutes <= 35 ? 30 : minutes <= 65 ? 60 : minutes <= 24 * 60 + 5 ? 1440 : 0;
    if (!bucket) continue;

    const recipients = await tournamentRecipients(tournament.id);
    for (const recipient of recipients) {
      const key = `reminder:${bucket}:${tournament.id}:${recipient.telegramId}`;
      if (await hasSent(key)) continue;
      const isPrivateClash = tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY;
      const checkInOpen = isPrivateClash && bucket <= 30 && !recipient.checkedInAt;
      const keyboard: Array<Array<Record<string, string>>> = [];
      if (checkInOpen) keyboard.push([{ text: "✅ چک‌این مسابقه", callback_data: `checkin:${recipient.registrationId}` }]);
      keyboard.push([{ text: "مشاهده تورنومنت", url: `${process.env.APP_URL || "https://www.gament1.ir"}/tournaments/${tournament.id}` }]);
      await sendTelegramMessage(
        recipient.telegramId,
        `⏰ <b>یادآوری تورنومنت</b>\n\n🏆 ${html(tournament.name)}\n🎮 ${html(gameLabel(tournament.game))}\n\nشروع تا حدود <b>${bucket === 1440 ? "۲۴ ساعت" : `${bucket} دقیقه`}</b> دیگر.${checkInOpen ? "\n\n✅ چک‌این باز شده؛ همین الان حضور خودت را ثبت کن." : ""}\n\nبرای جزئیات و قوانین وارد Gament شو.`,
        { inline_keyboard: keyboard }
      );
      await markSent(key, "reminder", tournament.id, recipient.telegramId);
      sent += 1;
    }
  }
  return sent;
}

async function sendCapacityAlerts() {
  const rows = await db.select().from(tournaments).where(eq(tournaments.status, "registration"));
  let sent = 0;
  for (const tournament of rows) {
    const [{ value }] = await db.select({ value: count() }).from(registrations).where(eq(registrations.tournamentId, tournament.id));
    if (tournament.maxPlayers <= 0 || value / tournament.maxPlayers < 0.8) continue;
    const key = `capacity:${tournament.id}:80`;
    if (await hasSent(key)) continue;
    const left = Math.max(0, tournament.maxPlayers - value);
    await sendTelegramMessage(
      getTelegramChannelChatId(),
      `⚠️ <b>ظرفیت رو به اتمام!</b>\n\n🏆 ${html(tournament.name)}\n🎮 ${html(gameLabel(tournament.game))}\n👥 ثبت‌نام: <b>${value}/${tournament.maxPlayers}</b>\nفقط <b>${left}</b> جای خالی باقی مانده.`,
      { inline_keyboard: [[{ text: "ثبت‌نام", url: `${process.env.APP_URL || "https://www.gament1.ir"}/tournaments/${tournament.id}` }]] }
    );
    await markSent(key, "capacity", tournament.id);
    sent += 1;
  }
  return sent;
}

async function sendLobbyNotices() {
  const now = new Date();
  const rows = await db.select().from(tournaments).where(inArray(tournaments.status, ["registration", "in_progress"]));
  let sent = 0;

  for (const tournament of rows) {
    const revealAt = tournament.roomVisibleAt
      ? new Date(tournament.roomVisibleAt).getTime()
      : tournament.startDate ? new Date(tournament.startDate).getTime() - 30 * 60 * 1000 : Number.POSITIVE_INFINITY;
    if (!tournament.roomId || !Number.isFinite(revealAt) || revealAt > now.getTime()) continue;
    const recipients = await tournamentRecipients(tournament.id);
    for (const recipient of recipients) {
      if (tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY && !recipient.checkedInAt) continue;
      const key = `lobby:${tournament.id}:${recipient.telegramId}`;
      if (await hasSent(key)) continue;
      await sendTelegramMessage(
        recipient.telegramId,
        `🏟 <b>اطلاعات ورود آماده شد</b>\n\n🏆 ${html(tournament.name)}\n${tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY ? "نام/برچسب مسابقه" : "Room ID"}: <code>${html(tournament.roomId)}</code>\nPassword: <code>${html(tournament.roomPassword || "بدون رمز")}</code>\n\n${html(tournament.lobbyNotes || "لطفاً به‌موقع وارد شوید.")}`,
        { inline_keyboard: [[{ text: "مشاهده لابی", url: `${process.env.APP_URL || "https://www.gament1.ir"}/tournaments/${tournament.id}/lobby` }]] }
      );
      await markSent(key, "lobby", tournament.id, recipient.telegramId);
      sent += 1;
    }
  }
  return sent;
}

async function markPrivateTournamentNoShows() {
  await ensurePrivateTournamentAttendanceSchema();
  const now = new Date();
  const rows = await db.select().from(tournaments).where(and(
    eq(tournaments.categoryLabel, CLASH_PRIVATE_DRAFT_CATEGORY),
    inArray(tournaments.status, ["registration", "in_progress"]),
    sql`${tournaments.startDate} IS NOT NULL`,
  ));
  let marked = 0;

  for (const tournament of rows) {
    if (!tournament.startDate || now < privateCheckInWindow(tournament.startDate).closesAt) continue;
    const absent = await db
      .select({
        registrationId: registrations.id,
        telegramId: telegramAccounts.telegramId,
      })
      .from(registrations)
      .leftJoin(telegramAccounts, eq(registrations.visibleUserId, telegramAccounts.userId))
      .where(and(
        eq(registrations.tournamentId, tournament.id),
        eq(registrations.attendanceStatus, "registered"),
        sql`${registrations.checkedInAt} IS NULL`,
      ));
    if (!absent.length) continue;

    await db.update(registrations).set({ attendanceStatus: "no_show", noShowAt: now })
      .where(and(
        eq(registrations.tournamentId, tournament.id),
        eq(registrations.attendanceStatus, "registered"),
        sql`${registrations.checkedInAt} IS NULL`,
      ));

    for (const player of absent) {
      if (!player.telegramId) continue;
      const key = `private-noshow:${tournament.id}:${player.registrationId}`;
      if (await hasSent(key)) continue;
      await sendTelegramMessage(
        player.telegramId,
        `⚠️ <b>No-show ثبت شد</b>\n\n🏆 ${html(tournament.name)}\n\nمهلت چک‌این تمام شد. طبق قانون پذیرفته‌شده هنگام ثبت‌نام، ورودی بازگردانده نمی‌شود و داخل استخر جایزه برندگان باقی می‌ماند.`
      );
      await markSent(key, "private_tournament_no_show", tournament.id, player.telegramId);
    }
    await sendToAdmins(
      `⚠️ <b>گزارش No-show مسابقه چندنفره</b>\n\n🏆 ${html(tournament.name)}\nغایبان جدید: <b>${absent.length.toLocaleString("fa-IR")}</b>\nورودی این افراد در استخر جایزه باقی ماند.`,
      { inline_keyboard: [[{ text: "مدیریت تورنومنت", url: `${process.env.APP_URL || "https://www.gament1.ir"}/admin/tournaments` }]] },
    );
    marked += absent.length;
  }
  return marked;
}

async function promptPrivateTournamentLeaderboardUploads() {
  const now = new Date();
  const rows = await db.select().from(tournaments).where(and(
    eq(tournaments.categoryLabel, CLASH_PRIVATE_DRAFT_CATEGORY),
    eq(tournaments.status, "in_progress"),
    sql`${tournaments.endDate} IS NOT NULL`,
    sql`${tournaments.endDate} <= ${now}`,
  ));
  let prompted = 0;
  for (const tournament of rows) {
    const key = `private-leaderboard-prompt:${tournament.id}`;
    if (await hasSent(key)) continue;
    await sendToAdmins(
      `🏁 <b>زمان مسابقه به پایان رسید</b>\n\n🏆 ${html(tournament.name)}\n\nتصاویر Leaderboard را در پنل آپلود، OCR را بازبینی و سپس جوایز را نهایی کن.`,
      { inline_keyboard: [[{ text: "🏅 ثبت Leaderboard", url: `${process.env.APP_URL || "https://www.gament1.ir"}/admin/tournaments/${tournament.id}/leaderboard` }]] },
    );
    const recipients = await tournamentRecipients(tournament.id);
    for (const recipient of recipients) {
      if (!recipient.checkedInAt) continue;
      await sendTelegramMessage(recipient.telegramId, `🏁 مسابقه <b>${html(tournament.name)}</b> به پایان رسید. نتایج پس از بررسی Leaderboard اعلام می‌شوند.`);
    }
    await markSent(key, "private_leaderboard_prompt", tournament.id);
    prompted += 1;
  }
  return prompted;
}

async function verifyPendingClash1v1Results() {
  if (!getClashRoyaleApiConfiguration().configured) return { checked: 0, settled: 0, disputed: 0, reason: "api_not_configured" };
  const pending = await db
    .select({
      id: matches.id,
      player1Id: matches.player1Id,
      player2Id: matches.player2Id,
      scheduledAt: matches.scheduledAt,
      tournamentId: matches.tournamentId,
    })
    .from(matches)
    .innerJoin(tournaments, eq(matches.tournamentId, tournaments.id))
    .where(and(
      eq(matches.status, "in_progress"),
      eq(tournaments.categoryLabel, CLASH_1V1_CONFIG.categoryLabel),
      sql`${matches.scheduledAt} IS NOT NULL`,
    ))
    .orderBy(desc(matches.createdAt))
    .limit(20);
  let settled = 0;
  let disputed = 0;

  for (const match of pending) {
    if (!match.player1Id || !match.player2Id || !match.scheduledAt) continue;
    const claims = await db.select({ playerId: matchResultClaims.playerId, claim: matchResultClaims.claim })
      .from(matchResultClaims).where(eq(matchResultClaims.matchId, match.id));
    const validClaims = claims.filter((claim) => claim.claim === "win" || claim.claim === "lose")
      .map((claim) => ({ playerId: claim.playerId, claim: claim.claim as MatchResultClaimValue }));
    const resolution = resolveMatchResultClaims(match.player1Id, match.player2Id, validClaims);
    if (resolution.state !== "agreed") continue;

    const participantRows = await db.select({
      playerId: players.id,
      userId: players.visibleUserId,
      name: players.displayName,
      tag: users.clashRoyaleId,
    }).from(players).leftJoin(users, eq(players.visibleUserId, users.id))
      .where(inArray(players.id, [match.player1Id, match.player2Id]));
    const byId = new Map(participantRows.map((player) => [player.playerId, player]));
    const player1 = byId.get(match.player1Id);
    const player2 = byId.get(match.player2Id);
    const player1Tag = normalizeClashRoyaleTag(player1?.tag);
    const player2Tag = normalizeClashRoyaleTag(player2?.tag);
    if (!player1Tag || !player2Tag) continue;

    try {
      const battle = await verifyClashRoyaleHeadToHead({
        player1Tag,
        player2Tag,
        notBefore: new Date(new Date(match.scheduledAt).getTime() - 30_000),
      });
      if (!battle) continue;
      const [duelEntry] = await db.select({ gameMode: clash1v1Entries.gameMode, stakeMode: clash1v1Entries.stakeMode })
        .from(clash1v1Entries).where(eq(clash1v1Entries.matchedMatchId, match.id)).limit(1);
      const expectedMode = duelEntry?.gameMode || "normal";
      if (isClashDuelGameMode(expectedMode) && !clashBattleMatchesExpectedMode(expectedMode, battle)) {
        const evidence = {
          source: "clash_api_cron_mode_mismatch",
          expectedGameMode: expectedMode,
          actualGameMode: battle.gameMode,
          actualBattleType: battle.battleType,
          actualDeckSelection: battle.raw.deckSelection || null,
          battleTime: battle.battleTime.toISOString(),
          responsiblePlayerId: match.player1Id,
          responsibleRole: "host",
          stakeMode: duelEntry?.stakeMode || "paid",
          action: "admin_penalty_required",
        };
        await db.update(matches).set({ status: "disputed", evidence }).where(eq(matches.id, match.id));
        for (const player of [player1, player2]) {
          if (!player?.userId) continue;
          const [account] = await db.select({ telegramId: telegramAccounts.telegramId }).from(telegramAccounts)
            .where(eq(telegramAccounts.userId, player.userId)).limit(1);
          if (account?.telegramId) await sendTelegramMessage(account.telegramId, "🚨 مود بازی با مود توافق‌شده یکسان نبود. پرونده برای تعیین جریمه میزبان و تصمیم مالی به ادمین ارسال شد.");
        }
        await sendToAdmins(`🚨 <b>اختلاف مود با Clash API</b>\nMatch: <code>${html(match.id.slice(0, 8))}</code>\nExpected: <code>${html(expectedMode)}</code>\nمیزبان مسئول: <b>${html(player1?.name || "بازیکن ۱")}</b>`, {
          inline_keyboard: [
            [{ text: "⚠️ باخت فنی میزبان", callback_data: `judge:mode_forfeit:${match.id}` }],
            [{ text: "🔁 تکرار", callback_data: `judge:mode_replay:${match.id}` }, { text: "💳 بازپرداخت", callback_data: `judge:mode_refund:${match.id}` }],
            [{ text: "⛔ تعلیق ۲۴ ساعته", callback_data: `judge:mode_suspend:${match.id}` }],
          ],
        });
        disputed += 1;
        continue;
      }
      const claimedWinnerTag = resolution.winnerId === match.player1Id ? player1Tag : player2Tag;
      if (!battle.winnerTag || battle.winnerTag !== claimedWinnerTag) {
        await db.update(matches).set({ status: "disputed", evidence: {
          source: "clash_api_cron_mismatch",
          claimedWinnerId: resolution.winnerId,
          apiWinnerTag: battle.winnerTag,
          battleTime: battle.battleTime.toISOString(),
          player1Crowns: battle.player1Crowns,
          player2Crowns: battle.player2Crowns,
        }}).where(eq(matches.id, match.id));
        for (const player of [player1, player2]) {
          if (!player?.userId) continue;
          const [account] = await db.select({ telegramId: telegramAccounts.telegramId }).from(telegramAccounts)
            .where(eq(telegramAccounts.userId, player.userId)).limit(1);
          if (account?.telegramId) await sendTelegramMessage(account.telegramId, "🚨 نتیجه ثبت‌شده با Battle Log مطابقت ندارد و برای داوری ارسال شد.");
        }
        await sendToAdmins(`🚨 <b>اختلاف نتیجه با Clash API</b>\nMatch: <code>${html(match.id.slice(0, 8))}</code>`);
        disputed += 1;
        continue;
      }

      const finalized = await db.transaction((tx) => finalizeMatchResult(tx, match.id, resolution.winnerId));
      if (!finalized.completed) continue;
      const winner = byId.get(finalized.winnerId);
      const loser = byId.get(finalized.loserId);
      for (const [player, won] of [[winner, true], [loser, false]] as const) {
        if (!player?.userId) continue;
        const [account] = await db.select({ telegramId: telegramAccounts.telegramId }).from(telegramAccounts)
          .where(eq(telegramAccounts.userId, player.userId)).limit(1);
        if (!account?.telegramId) continue;
        await sendTelegramMessage(account.telegramId, won
          ? `🏆 <b>نتیجه با Clash API تأیید شد</b>\n\nشما برنده شدید و جایزه <b>${html(CLASH_1V1_CONFIG.prize1st)}</b> به کیف پول واریز شد.`
          : `🏁 <b>نتیجه نهایی 1V1</b>\n\nبرنده مسابقه: <b>${html(winner?.name || "حریف")}</b>`);
      }
      settled += 1;
    } catch (error) {
      logger.warn({ error, matchId: match.id }, "Cron Clash Battle Log verification failed");
    }
  }
  return { checked: pending.length, settled, disputed };
}

async function runHourlyClassifiedScrape() {
  const enabled = process.env.CLASSIFIED_AUTO_SCAN_ENABLED === "true";
  if (!enabled) return { ran: false as const, reason: "disabled" };

  const intervalHours = Math.max(1, Math.min(Number(process.env.CLASSIFIED_SCAN_INTERVAL_HOURS || "1"), 24));
  const now = new Date();
  const hourKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}`;
  const key = `classified-scrape:${hourKey}`;
  if (await hasSent(key)) return { ran: false as const, reason: "already_this_hour" };

  const { runClassifiedScrape } = await import("@/lib/classified-scraper");
  const allCities = process.env.CLASSIFIED_SCAN_ALL_CITIES === "true";
  const limitPerCity = Math.max(1, Math.min(Number(process.env.CLASSIFIED_LIMIT_PER_CITY || "5"), 10));
  const results = await runClassifiedScrape({ allCities, limitPerCity });
  const totalNew = results.reduce((sum, r) => sum + r.new, 0);
  await markSent(key, "classified_scrape");
  return { ran: true as const, results, totalNew, intervalHours };
}


function telegramAdminIds() {
  return (process.env.TELEGRAM_ADMIN_IDS || process.env.ADMIN_IDS || "")
    .split(",")
    .map((x) => x.trim())
    .filter((id) => Number.isFinite(Number(id)));
}

async function sendToAdmins(text: string, replyMarkup?: Record<string, unknown>) {
  let sent = 0;
  for (const id of telegramAdminIds()) {
    await sendTelegramMessage(Number(id), text, replyMarkup);
    sent += 1;
  }
  return sent;
}

async function honorEngagementRows(kind: "views" | "likes", limit = 5) {
  const table = kind === "views" ? honorViews : honorLikes;
  return db
    .select({
      honorId: honors.id,
      title: honors.title,
      type: honors.type,
      game: honors.game,
      count: sql<number>`count(${table.id})::int`,
    })
    .from(table)
    .innerJoin(honors, eq(table.honorId, honors.id))
    .where(eq(honors.status, "approved"))
    .groupBy(honors.id, honors.title, honors.type, honors.game)
    .orderBy(desc(sql`count(${table.id})`))
    .limit(limit);
}

async function sendHonorEngagementReport() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
  const key = `honor-engagement-report:${today}`;
  if (await hasSent(key)) return 0;
  if (!telegramAdminIds().length) return 0;

  const [topViews, topLikes, approvedNews] = await Promise.all([
    honorEngagementRows("views", 5),
    honorEngagementRows("likes", 5),
    db.select({ value: count() }).from(honors).where(and(eq(honors.status, "approved"), eq(honors.type, "news"))),
  ]);

  const viewLines = topViews.length
    ? topViews.map((row, index) => `${index + 1}) <b>${html(row.title)}</b> — ${Number(row.count || 0).toLocaleString("fa-IR")} سین`).join("\n")
    : "هنوز بازدیدی ثبت نشده.";
  const likeLines = topLikes.length
    ? topLikes.map((row, index) => `${index + 1}) <b>${html(row.title)}</b> — ${Number(row.count || 0).toLocaleString("fa-IR")} لایک`).join("\n")
    : "هنوز لایکی ثبت نشده.";

  const text = [
    "🏛 <b>گزارش روزانه تالار افتخارات</b>",
    "",
    `خبرهای منتشرشده: <b>${(approvedNews[0]?.value || 0).toLocaleString("fa-IR")}</b>`,
    "",
    "👁 <b>پربازدیدترین‌ها</b>",
    viewLines,
    "",
    "♥️ <b>محبوب‌ترین‌ها</b>",
    likeLines,
  ].join("\n");

  const sent = await sendToAdmins(text, { inline_keyboard: [[{ text: "پنل تالار افتخارات", url: `${process.env.APP_URL || "https://www.gament1.ir"}/admin/honors` }]] });
  await markSent(key, "honor_engagement_report");
  return sent;
}

async function sendHonorMilestoneAlerts() {
  if (!telegramAdminIds().length) return 0;
  const rows = await db.select({ id: honors.id, title: honors.title, type: honors.type }).from(honors).where(eq(honors.status, "approved")).limit(200);
  let sent = 0;
  const viewThresholds = [10, 50, 100, 250, 500, 1000];
  const likeThresholds = [5, 10, 25, 50, 100, 250];

  for (const honor of rows) {
    const [viewRow] = await db.select({ value: sql<number>`count(*)::int` }).from(honorViews).where(eq(honorViews.honorId, honor.id));
    const [likeRow] = await db.select({ value: sql<number>`count(*)::int` }).from(honorLikes).where(eq(honorLikes.honorId, honor.id));
    const views = Number(viewRow?.value || 0);
    const likes = Number(likeRow?.value || 0);

    for (const threshold of viewThresholds) {
      if (views < threshold) continue;
      const key = `honor:milestone:view:${honor.id}:${threshold}`;
      if (await hasSent(key)) continue;
      await sendToAdmins(`👁 <b>رکورد بازدید خبر</b>\n\n<b>${html(honor.title)}</b> به <b>${threshold.toLocaleString("fa-IR")}</b> سین رسید.`, {
        inline_keyboard: [[{ text: "مشاهده خبر", url: `${process.env.APP_URL || "https://www.gament1.ir"}/honors/${honor.id}` }]],
      });
      await markSent(key, "honor_view_milestone");
      sent += 1;
    }

    for (const threshold of likeThresholds) {
      if (likes < threshold) continue;
      const key = `honor:milestone:like:${honor.id}:${threshold}`;
      if (await hasSent(key)) continue;
      await sendToAdmins(`♥️ <b>رکورد لایک خبر</b>\n\n<b>${html(honor.title)}</b> به <b>${threshold.toLocaleString("fa-IR")}</b> لایک رسید.`, {
        inline_keyboard: [[{ text: "مشاهده خبر", url: `${process.env.APP_URL || "https://www.gament1.ir"}/honors/${honor.id}` }]],
      });
      await markSent(key, "honor_like_milestone");
      sent += 1;
    }
  }
  return sent;
}

async function sendDailyAdminReport() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
  const key = `daily-report:${today}`;
  if (await hasSent(key)) return 0;

  const adminIds = (process.env.TELEGRAM_ADMIN_IDS || process.env.ADMIN_IDS || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!adminIds.length) return 0;

  const [preRegs] = await db.select({ value: count() }).from(telegramPreRegistrations);
  const [activeTournaments] = await db.select({ value: count() }).from(tournaments).where(inArray(tournaments.status, ["registration", "in_progress"]));
  const [openTickets] = await db.select({ value: count() }).from(tickets).where(eq(tickets.status, "open"));
  const [completedMatches] = await db.select({ value: count() }).from(matches).where(eq(matches.status, "completed"));
  const txRows = await db.select({ amount: transactions.amount }).from(transactions).where(eq(transactions.type, "entry_fee"));
  const revenueToman = txRows.reduce((sum, row) => sum + Number((BigInt(row.amount || "0") / BigInt(10)).toString()), 0);

  const text = `📊 <b>گزارش روزانه Gament</b>\n\nپیش‌ثبت‌نام‌های تلگرام: <b>${preRegs.value}</b>\nتورنومنت‌های فعال: <b>${activeTournaments.value}</b>\nمسابقات تکمیل‌شده: <b>${completedMatches.value}</b>\nتیکت‌های باز: <b>${openTickets.value}</b>\nدرآمد ورودی‌ها: <b>${revenueToman.toLocaleString("fa-IR")} تومان</b>`;
  let sent = 0;
  for (const id of adminIds) {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) continue;
    await sendTelegramMessage(numericId, text, { inline_keyboard: [[{ text: "پنل ادمین", url: `${process.env.APP_URL || "https://www.gament1.ir"}/admin` }]] });
    sent += 1;
  }
  await markSent(key, "daily_report");
  return sent;
}

async function getTelegramIdForPlayer(playerId?: string | null) {
  if (!playerId) return null;
  const [player] = await db.select({ visibleUserId: players.visibleUserId }).from(players).where(eq(players.id, playerId)).limit(1);
  if (!player?.visibleUserId) return null;
  const [account] = await db.select({ telegramId: telegramAccounts.telegramId }).from(telegramAccounts).where(eq(telegramAccounts.userId, player.visibleUserId)).limit(1);
  return account?.telegramId || null;
}

async function getPlayerName(playerId?: string | null) {
  if (!playerId) return "بازیکن";
  const [player] = await db.select({ displayName: players.displayName, username: players.username }).from(players).where(eq(players.id, playerId)).limit(1);
  return player?.displayName || player?.username || "بازیکن";
}

async function sendMatchAssignmentNotifications() {
  const pendingMatches = await db
    .select({
      id: matches.id,
      tournamentId: matches.tournamentId,
      player1Id: matches.player1Id,
      player2Id: matches.player2Id,
      round: matches.round,
      matchNumber: matches.matchNumber,
      tournamentName: tournaments.name,
      tournamentGame: tournaments.game,
      startDate: tournaments.startDate,
    })
    .from(matches)
    .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
    .where(and(eq(matches.status, "pending"), sql`${matches.player1Id} IS NOT NULL AND ${matches.player2Id} IS NOT NULL`));

  let sent = 0;
  for (const match of pendingMatches) {
    if (!match.player1Id || !match.player2Id) continue;

    const playerIds = [match.player1Id, match.player2Id];
    const names: Record<string, string> = {};
    for (const pid of playerIds) names[pid] = await getPlayerName(pid);

    const startText = match.startDate
      ? `\n⏰ شروع تقریبی: <b>${new Date(match.startDate).toLocaleString("fa-IR")}</b>`
      : "";

    for (const pid of playerIds) {
      const telegramId = await getTelegramIdForPlayer(pid);
      if (!telegramId) continue;
      const opponentId = pid === match.player1Id ? match.player2Id : match.player1Id;
      const key = `match:assigned:${match.id}:${telegramId}`;
      if (await hasSent(key)) continue;
      await sendTelegramMessage(
        telegramId,
        `⚔️ <b>حریف تو مشخص شد!</b>\n\n🏆 ${html(match.tournamentName)}\n🎮 ${html(gameLabel(match.tournamentGame))}\n🆚 حریف: <b>${html(names[opponentId])}</b>\n🔁 دور ${match.round} — مسابقه ${match.matchNumber}${startText}\n\nآماده باش و به‌موقع وارد لابی شو.`,
        { inline_keyboard: [[{ text: "مشاهده مسابقه", url: `${process.env.APP_URL || "https://www.gament1.ir"}/tournaments/${match.tournamentId}` }]] }
      );
      await markSent(key, "match_assigned", match.tournamentId, telegramId);
      sent += 1;
    }
  }
  return sent;
}

async function sendMatchScheduleNotifications() {
  const now = new Date();
  const scheduledMatches = await db
    .select({
      id: matches.id,
      tournamentId: matches.tournamentId,
      player1Id: matches.player1Id,
      player2Id: matches.player2Id,
      scheduledAt: matches.scheduledAt,
      tournamentName: tournaments.name,
      tournamentGame: tournaments.game,
    })
    .from(matches)
    .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
    .where(and(sql`${matches.scheduledAt} IS NOT NULL`, inArray(matches.status, ["pending", "in_progress"])));

  let sent = 0;
  for (const match of scheduledMatches) {
    if (!match.player1Id || !match.player2Id || !match.scheduledAt) continue;
    const scheduledTime = new Date(match.scheduledAt).getTime();
    if (scheduledTime < now.getTime() || scheduledTime > now.getTime() + 24 * 60 * 60 * 1000) continue;
    const minutesLeft = Math.round((scheduledTime - now.getTime()) / 60000);

    const playerIds = [match.player1Id, match.player2Id];
    for (const pid of playerIds) {
      const telegramId = await getTelegramIdForPlayer(pid);
      if (!telegramId) continue;
      const key = `match:scheduled:${match.id}:${telegramId}`;
      if (await hasSent(key)) continue;
      await sendTelegramMessage(
        telegramId,
        `⏰ <b>مسابقه شروع می‌شود!</b>\n\n🏆 ${html(match.tournamentName)}\n🎮 ${html(gameLabel(match.tournamentGame))}\n\nمسابقه حدود <b>${minutesLeft} دقیقه</b> دیگر شروع می‌شود.`,
        { inline_keyboard: [[{ text: "مشاهده مسابقه", url: `${process.env.APP_URL || "https://www.gament1.ir"}/tournaments/${match.tournamentId}` }]] }
      );
      await markSent(key, "match_scheduled", match.tournamentId, telegramId);
      sent += 1;
    }
  }
  return sent;
}

async function sendMatchResultNotifications() {
  const resultMatches = await db
    .select({
      id: matches.id,
      tournamentId: matches.tournamentId,
      player1Id: matches.player1Id,
      player2Id: matches.player2Id,
      winnerId: matches.winnerId,
      status: matches.status,
      tournamentName: tournaments.name,
      tournamentGame: tournaments.game,
    })
    .from(matches)
    .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
    .where(inArray(matches.status, ["completed", "disputed"]));

  let sent = 0;
  for (const match of resultMatches) {
    if (!match.player1Id || !match.player2Id) continue;
    const playerIds = [match.player1Id, match.player2Id];
    const names: Record<string, string> = {};
    for (const pid of playerIds) names[pid] = await getPlayerName(pid);

    for (const pid of playerIds) {
      const telegramId = await getTelegramIdForPlayer(pid);
      if (!telegramId) continue;
      const key = `match:result:${match.status}:${match.id}:${telegramId}`;
      if (await hasSent(key)) continue;

      let message = "";
      if (match.status === "completed") {
        const isWinner = match.winnerId === pid;
        const winnerName = match.winnerId ? names[match.winnerId] || "بازیکن" : "—";
        message = isWinner
          ? `🎉 <b>تبریک! شما برنده شدید</b>\n\n🏆 ${html(match.tournamentName)}\n🎮 ${html(gameLabel(match.tournamentGame))}\n🆚 حریف: ${html(names[pid === match.player1Id ? match.player2Id : match.player1Id])}\n\nجایزه به زودی واریز می‌شود.`
          : `🏁 <b>مسابقه به پایان رسید</b>\n\n🏆 ${html(match.tournamentName)}\n🎮 ${html(gameLabel(match.tournamentGame))}\n🥇 برنده: <b>${html(winnerName)}</b>\n\nبرد و باخت توی مسابقه طبیعیه. موفق باشی در مسابقه بعدی!`;
      } else {
        message = `🚨 <b>مسابقه در حال بررسی/اعتراض</b>\n\n🏆 ${html(match.tournamentName)}\n🎮 ${html(gameLabel(match.tournamentGame))}\n\nنتیجه این مسابقه در پنل داوری بررسی می‌شود. به زودی نتیجه نهایی اعلام می‌شود.`;
      }

      await sendTelegramMessage(telegramId, message, {
        inline_keyboard: [[{ text: "مشاهده مسابقه", url: `${process.env.APP_URL || "https://www.gament1.ir"}/tournaments/${match.tournamentId}` }]],
      });
      await markSent(key, `match_${match.status}`, match.tournamentId, telegramId);
      sent += 1;
    }
  }
  return sent;
}

async function publishCompletedResults() {
  const completed = await db.select().from(tournaments).where(eq(tournaments.status, "completed"));
  let published = 0;

  for (const tournament of completed) {
    const key = `result:${tournament.id}:channel`;
    if (await hasSent(key)) continue;
    const tournamentMatches = await db
      .select({ winnerId: matches.winnerId })
      .from(matches)
      .where(and(eq(matches.tournamentId, tournament.id), eq(matches.status, "completed")));
    const winnerCounts = new Map<string, number>();
    for (const match of tournamentMatches) {
      if (match.winnerId) winnerCounts.set(match.winnerId, (winnerCounts.get(match.winnerId) || 0) + 1);
    }
    const topIds = Array.from(winnerCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
    if (!topIds.length) continue;
    const winnerRows = await db.select({ id: players.id, displayName: players.displayName, username: players.username }).from(players).where(inArray(players.id, topIds));
    const byId = new Map(winnerRows.map((row) => [row.id, row]));
    const lines = topIds.map((id, index) => `${["🥇", "🥈", "🥉"][index]} ${html(byId.get(id)?.displayName || byId.get(id)?.username || "بازیکن")}`);
    await sendTelegramMessage(
      getTelegramChannelChatId(),
      `🏆 <b>نتیجه نهایی تورنومنت</b>\n\n🔥 ${html(tournament.name)}\n🎮 ${html(gameLabel(tournament.game))}\n\n${lines.join("\n")}\n\nتبریک به قهرمان‌ها!`,
      { inline_keyboard: [[{ text: "مشاهده در Gament", url: `${process.env.APP_URL || "https://www.gament1.ir"}/tournaments/${tournament.id}` }]] }
    );
    await markSent(key, "result", tournament.id);
    published += 1;
  }
  return published;
}

async function safeCronStep<T>(name: string, fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    logger.error({ err, step: name }, "Telegram cron step failed");
    return { error: name };
  }
}

export async function GET(request: NextRequest) {
  const auth = validateCron(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  await ensurePrivateTournamentAttendanceSchema();

  // Drain old work first, enqueue this cron cycle's notifications, then drain
  // again. If Render stops between these phases, the next invocation resumes
  // pending rows from PostgreSQL without losing messages.
  const outboxBefore = await safeCronStep("outboxBefore", () => processTelegramOutbox(25));
  const reminders = await safeCronStep("reminders", sendReminders);
  const capacity = await safeCronStep("capacity", sendCapacityAlerts);
  const lobby = await safeCronStep("lobby", sendLobbyNotices);
  const privateNoShows = await safeCronStep("privateNoShows", markPrivateTournamentNoShows);
  const privateLeaderboardPrompts = await safeCronStep("privateLeaderboardPrompts", promptPrivateTournamentLeaderboardUploads);
  const clash1v1Matchmaking = await safeCronStep("clash1v1Matchmaking", runClash1v1MatchmakingAndNotify);
  const clash1v1ReadyTimeouts = await safeCronStep("clash1v1ReadyTimeouts", () => processClash1v1ReadyTimeouts(10));
  const clash1v1ExpiredChallenges = await safeCronStep("clash1v1ExpiredChallenges", expireClash1v1Challenges);
  const clash1v1ApiVerification = await safeCronStep("clash1v1ApiVerification", verifyPendingClash1v1Results);
  const matchAssigned = await safeCronStep("matchAssigned", sendMatchAssignmentNotifications);
  const matchScheduled = await safeCronStep("matchScheduled", sendMatchScheduleNotifications);
  const matchResults = await safeCronStep("matchResults", sendMatchResultNotifications);
  const results = await safeCronStep("results", publishCompletedResults);
  const storeOrderDeadlines = await safeCronStep("storeOrderDeadlines", () => processStoreOrderDeadlines(50));
  const classifiedScrape = await safeCronStep("classifiedScrape", runHourlyClassifiedScrape);
  const classifiedCleanup = await safeCronStep("classifiedCleanup", cleanupClassifiedAds);
  const dailyReports = await safeCronStep("dailyReports", sendDailyAdminReport);
  const honorEngagementReport = await safeCronStep("honorEngagementReport", sendHonorEngagementReport);
  const honorMilestones = await safeCronStep("honorMilestones", sendHonorMilestoneAlerts);
  const dailyGamingNews = await safeCronStep("dailyGamingNews", () => generateDailyGamingNews());
  const outboxAfter = await safeCronStep("outboxAfter", () => processTelegramOutbox(50));
  const reliabilityCleanup = await safeCronStep("reliabilityCleanup", cleanupTelegramReliability);

  return NextResponse.json({
    ok: true,
    outboxBefore,
    outboxAfter,
    reliabilityCleanup,
    reminders,
    capacity,
    lobby,
    privateNoShows,
    privateLeaderboardPrompts,
    clash1v1Matchmaking,
    clash1v1ReadyTimeouts,
    clash1v1ExpiredChallenges,
    clash1v1ApiVerification,
    matchAssigned,
    matchScheduled,
    matchResults,
    results,
    storeOrderDeadlines,
    classifiedScrape,
    classifiedCleanup,
    dailyReports,
    honorEngagementReport,
    honorMilestones,
    dailyGamingNews,
  });
}
