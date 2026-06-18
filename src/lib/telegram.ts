import logger from "@/lib/logger";

export interface TelegramTournamentPost {
  id: string;
  name: string;
  game: string;
  gameMode?: string | null;
  maxPlayers?: number | null;
  prizePool?: string | null;
  entryFee?: string | null;
  startDate?: Date | string | null;
  bannerUrl?: string | null;
  description?: string | null;
  prize1st?: string | null;
  prize2nd?: string | null;
  prize3rd?: string | null;
}

const DEFAULT_APP_URL = "https://flexa-app-1.onrender.com";

function appUrl() {
  return (process.env.APP_URL || DEFAULT_APP_URL).replace(/\/$/, "");
}

export function getTelegramChannelUrl() {
  return (process.env.TELEGRAM_CHANNEL_URL || process.env.CHANNEL_URL || "https://t.me/Flexa_games").trim();
}

export function getTelegramChannelChatId() {
  const explicit = (process.env.TELEGRAM_CHANNEL_ID || "").trim();
  if (explicit) return explicit;

  const channelUrl = getTelegramChannelUrl();
  const match = channelUrl.match(/t\.me\/([A-Za-z0-9_]+)/i);
  if (match?.[1]) return `@${match[1]}`;
  return "@Flexa_games";
}

function html(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function gameLabel(game?: string | null) {
  const map: Record<string, string> = {
    cod_mobile: "🎯 کالاف موبایل | COD Mobile",
    fortnite: "🏗️ فورتنایت | Fortnite",
    clash_royale: "👑 کلش رویال | Clash Royale",
  };
  return map[String(game || "")] || game || "گیمینگ";
}

function formatDate(value?: Date | string | null) {
  if (!value) return "اعلام می‌شود";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "اعلام می‌شود";
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tehran",
  }).format(date);
}

export function formatTournamentChannelPost(tournament: TelegramTournamentPost) {
  const prize = tournament.prizePool || tournament.prize1st || "اعلام نشده";
  const description = tournament.description?.trim();

  return [
    "🏆 <b>تورنومنت جدید Flexa</b>",
    "",
    `🔥 <b>${html(tournament.name)}</b>`,
    `🎮 بازی: <b>${html(gameLabel(tournament.game))}</b>`,
    tournament.gameMode ? `🕹 مود: <b>${html(tournament.gameMode)}</b>` : "",
    `👥 ظرفیت: <b>${Number(tournament.maxPlayers || 16).toLocaleString("fa-IR")} نفر</b>`,
    `💳 ورودی: <b>${html(tournament.entryFee || "رایگان")}</b>`,
    `🎁 جایزه: <b>${html(prize)}</b>`,
    `⏰ شروع: <b>${html(formatDate(tournament.startDate))}</b>`,
    description ? "" : "",
    description ? html(description.slice(0, 500)) : "",
    "",
    "برای ثبت‌نام و مشاهده قوانین وارد Flexa شو 👇",
  ].filter(Boolean).join("\n");
}

export async function telegramApi(method: string, payload: Record<string, unknown>) {
  const token = process.env.BOT_TOKEN?.trim();
  if (!token) {
    logger.warn("BOT_TOKEN is missing; cannot call Telegram API");
    return { ok: false, description: "BOT_TOKEN is missing" };
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const result = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
  if (!response.ok || !result?.ok) {
    logger.warn({ method, status: response.status, result }, "Telegram API call failed");
  }
  return result || { ok: false, description: "Invalid Telegram response" };
}

export async function sendTelegramMessage(chatId: string | number, text: string, replyMarkup?: Record<string, unknown>) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
}

export async function publishTournamentToTelegramChannel(tournament: TelegramTournamentPost) {
  const channelId = getTelegramChannelChatId();
  const url = `${appUrl()}/tournaments/${tournament.id}`;
  const caption = formatTournamentChannelPost(tournament);
  const replyMarkup = {
    inline_keyboard: [
      [{ text: "🎮 ثبت‌نام در تورنومنت", url }],
      [{ text: "⚡ ورود به Flexa", url: appUrl() }],
    ],
  };

  if (tournament.bannerUrl) {
    const photoResult = await telegramApi("sendPhoto", {
      chat_id: channelId,
      photo: tournament.bannerUrl,
      caption,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
    if (photoResult.ok) return photoResult;
  }

  return telegramApi("sendMessage", {
    chat_id: channelId,
    text: caption,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
}
