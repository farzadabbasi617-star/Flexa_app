import { NextRequest, NextResponse } from "next/server";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, players, registrations, telegramAccounts, telegramPreRegistrations, telegramSentNotifications, tickets, tournaments, transactions } from "@/db/schema";
import { getTelegramChannelChatId, sendTelegramMessage } from "@/lib/telegram";
import logger from "@/lib/logger";

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
  if (!secret) return true;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || request.nextUrl.searchParams.get("secret") || "";
  return provided === secret;
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
    .select({ telegramId: telegramAccounts.telegramId })
    .from(registrations)
    .innerJoin(telegramAccounts, eq(registrations.visibleUserId, telegramAccounts.userId))
    .where(eq(registrations.tournamentId, tournamentId));
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
    const bucket = minutes <= 16 ? 15 : minutes <= 65 ? 60 : minutes <= 24 * 60 + 5 ? 1440 : 0;
    if (!bucket) continue;

    const recipients = await tournamentRecipients(tournament.id);
    for (const recipient of recipients) {
      const key = `reminder:${bucket}:${tournament.id}:${recipient.telegramId}`;
      if (await hasSent(key)) continue;
      await sendTelegramMessage(
        recipient.telegramId,
        `⏰ <b>یادآوری تورنومنت</b>\n\n🏆 ${html(tournament.name)}\n🎮 ${html(gameLabel(tournament.game))}\n\nشروع تا حدود <b>${bucket === 1440 ? "۲۴ ساعت" : `${bucket} دقیقه`}</b> دیگر.\n\nبرای جزئیات و قوانین وارد Flexa شو.`,
        { inline_keyboard: [[{ text: "مشاهده تورنومنت", url: `${process.env.APP_URL || "https://flexa-app-1.onrender.com"}/tournaments/${tournament.id}` }]] }
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
      { inline_keyboard: [[{ text: "ثبت‌نام", url: `${process.env.APP_URL || "https://flexa-app-1.onrender.com"}/tournaments/${tournament.id}` }]] }
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
    if (!tournament.roomId || !tournament.roomVisibleAt || new Date(tournament.roomVisibleAt) > now) continue;
    const recipients = await tournamentRecipients(tournament.id);
    for (const recipient of recipients) {
      const key = `lobby:${tournament.id}:${recipient.telegramId}`;
      if (await hasSent(key)) continue;
      await sendTelegramMessage(
        recipient.telegramId,
        `🏟 <b>اطلاعات لابی آماده شد</b>\n\n🏆 ${html(tournament.name)}\nRoom ID: <code>${html(tournament.roomId)}</code>\nPassword: <code>${html(tournament.roomPassword || "بدون رمز")}</code>\n\n${html(tournament.lobbyNotes || "لطفاً به‌موقع وارد لابی شوید.")}`,
        { inline_keyboard: [[{ text: "مشاهده لابی", url: `${process.env.APP_URL || "https://flexa-app-1.onrender.com"}/tournaments/${tournament.id}/lobby` }]] }
      );
      await markSent(key, "lobby", tournament.id, recipient.telegramId);
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

  const text = `📊 <b>گزارش روزانه Flexa</b>\n\nپیش‌ثبت‌نام‌های تلگرام: <b>${preRegs.value}</b>\nتورنومنت‌های فعال: <b>${activeTournaments.value}</b>\nمسابقات تکمیل‌شده: <b>${completedMatches.value}</b>\nتیکت‌های باز: <b>${openTickets.value}</b>\nدرآمد ورودی‌ها: <b>${revenueToman.toLocaleString("fa-IR")} تومان</b>`;
  let sent = 0;
  for (const id of adminIds) {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) continue;
    await sendTelegramMessage(numericId, text, { inline_keyboard: [[{ text: "پنل ادمین", url: `${process.env.APP_URL || "https://flexa-app-1.onrender.com"}/admin` }]] });
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
        { inline_keyboard: [[{ text: "مشاهده مسابقه", url: `${process.env.APP_URL || "https://flexa-app-1.onrender.com"}/tournaments/${match.tournamentId}` }]] }
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
        { inline_keyboard: [[{ text: "مشاهده مسابقه", url: `${process.env.APP_URL || "https://flexa-app-1.onrender.com"}/tournaments/${match.tournamentId}` }]] }
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
        inline_keyboard: [[{ text: "مشاهده مسابقه", url: `${process.env.APP_URL || "https://flexa-app-1.onrender.com"}/tournaments/${match.tournamentId}` }]],
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
      { inline_keyboard: [[{ text: "مشاهده در Flexa", url: `${process.env.APP_URL || "https://flexa-app-1.onrender.com"}/tournaments/${tournament.id}` }]] }
    );
    await markSent(key, "result", tournament.id);
    published += 1;
  }
  return published;
}

export async function GET(request: NextRequest) {
  if (!validateCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const reminders = await sendReminders();
    const capacity = await sendCapacityAlerts();
    const lobby = await sendLobbyNotices();
    const matchAssigned = await sendMatchAssignmentNotifications();
    const matchScheduled = await sendMatchScheduleNotifications();
    const matchResults = await sendMatchResultNotifications();
    const results = await publishCompletedResults();
    const dailyReports = await sendDailyAdminReport();
    return NextResponse.json({
      ok: true,
      reminders,
      capacity,
      lobby,
      matchAssigned,
      matchScheduled,
      matchResults,
      results,
      dailyReports,
    });
  } catch (err) {
    logger.error({ err }, "Telegram cron failed");
    return NextResponse.json({ error: "Telegram cron failed" }, { status: 500 });
  }
}
