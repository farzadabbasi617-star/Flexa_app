import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { matches, players, registrations, telegramAccounts, telegramSentNotifications, tournaments } from "@/db/schema";
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
    const lobby = await sendLobbyNotices();
    const results = await publishCompletedResults();
    return NextResponse.json({ ok: true, reminders, lobby, results });
  } catch (err) {
    logger.error({ err }, "Telegram cron failed");
    return NextResponse.json({ error: "Telegram cron failed" }, { status: 500 });
  }
}
