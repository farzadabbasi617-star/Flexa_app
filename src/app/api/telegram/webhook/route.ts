import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import jsQR from "jsqr";
import { Jimp } from "jimp";
import { and, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { classifiedAds, classifiedScrapeLogs, couponRedemptions, coupons, disputes, matchEvidence, matches, players, registrations, telegramAccounts, telegramBotSessions, telegramCampaignEvents, telegramLinkCodes, telegramPreRegistrations, telegramReferrals, telegramSentNotifications, tickets, ticketMessages, tournamentWaitlist, tournaments, transactions, users, wallets, honors, honorLikes, honorViews, siteSettings } from "@/db/schema";
import { normalizeDigits, normalizePhoneNumber } from "@/lib/phone";
import { publishHonorToTelegramChannel, publishTournamentToTelegramChannel } from "@/lib/telegram";
import { generateRealAssistantResponse } from "@/lib/ai-service";
import { getGameIdGuide, gameGuideKeyboard } from "./guide";
import { bigIntFromText, formatTomanFromRial, parseTomanToRial, rialToTomanNumber } from "@/lib/money";
import { getEntryFeeRial } from "@/lib/tournament-finance";
import { createWalletReference, sanitizeWalletNote, validateDepositAmountRial } from "@/lib/wallet-security";
import { evaluateUserAchievements, achievementProgressForUser } from "@/lib/achievement-service";
import { LevelingService } from "@/lib/leveling-service";
import { CLASH_1V1_CONFIG, payoutClash1v1Prize } from "@/lib/clash-1v1";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

type BotState =
  | "idle"
  | "full_name"
  | "gamer_tag"
  | "phone"
  | "gament_id"
  | "city"
  | "team"
  | "confirm"
  | "support_subject"
  | "support_message"
  | "wallet_deposit_amount"
  | "wallet_deposit_tracking"
  | "wallet_deposit_receipt"
  | "clash_qr_submission"
  | "dispute_reason"
  | "evidence_upload";

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type?: string;
}

interface TelegramMessage {
  message_id: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  contact?: {
    phone_number: string;
    user_id?: number;
  };
  photo?: Array<{
    file_id: string;
    file_unique_id: string;
    width: number;
    height: number;
    file_size?: number;
  }>;
  caption?: string;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface SessionData {
  game?: string;
  platform?: string;
  fullName?: string;
  gamerTag?: string;
  phoneNumber?: string;
  gamentId?: string;
  city?: string;
  teamName?: string;
  supportSubject?: string;
  walletDepositAmountToman?: string;
  walletDepositTracking?: string;
  disputeMatchId?: string;
  evidenceMatchId?: string;
  qrTournamentId?: string;
  qrRegistrationId?: string;
  selectedAdIds?: string[];
}

interface BotSession {
  state: BotState;
  data: SessionData;
}

const APP_URL = (process.env.APP_URL || "https://www.gament1.ir").replace(/\/$/, "");
const CHANNEL_URL = (process.env.TELEGRAM_CHANNEL_URL || process.env.CHANNEL_URL || "https://t.me/Gament_games").trim();
const SKIP_TEXT = "رد کردن";
const CANCEL_TEXT = "لغو";
const GAMENT_ID_REQUIRED = process.env.GAMENT_ID_REQUIRED === "true" || process.env.TELEGRAM_GAMENT_ID_REQUIRED === "true";

const GAME_OPTIONS = [
  { id: "cod_mobile", label: "🎯 COD MOBILE", fa: "کالاف موبایل", accountPrompt: "UID یا Username کالاف موبایل را وارد کن." },
  { id: "fortnite", label: "🏗️ FORTNITE", fa: "فورتنایت", accountPrompt: "Epic Games ID یا Username فورتنایت را وارد کن." },
  { id: "clash_royale", label: "👑 CLASH ROYALE", fa: "کلش رویال", accountPrompt: "Player Tag کلش رویال را وارد کن؛ مثل #ABC123." },
];

const PLATFORM_OPTIONS = ["Mobile", "PC", "Console", "PS5", "PS4", "Xbox", "Nintendo Switch", "Other"];

const GAME_ALIASES: Record<string, string> = {
  cod: "cod_mobile",
  "cod mobile": "cod_mobile",
  cod_mobile: "cod_mobile",
  "call of duty": "cod_mobile",
  "call of duty mobile": "cod_mobile",
  کالاف: "cod_mobile",
  "کالاف موبایل": "cod_mobile",
  fortnite: "fortnite",
  فورتنایت: "fortnite",
  clash: "clash_royale",
  "clash royale": "clash_royale",
  clash_royale: "clash_royale",
  کلش: "clash_royale",
  "کلش رویال": "clash_royale",
};

const DEFAULT_RULES = `📜 قوانین خلاصه Gament

1) Gament پلتفرم مدیریت، ثبت‌نام، اطلاع‌رسانی، داوری و پشتیبانی تورنومنت‌های گیمینگ است.
2) مسابقات بر پایه مهارت برگزار می‌شوند؛ شرط‌بندی، تبانی مالی، خرید/فروش نتیجه یا قمار ممنوع است.
3) اطلاعات ثبت‌شده شامل شماره تماس، Gament ID و آیدی بازی باید صحیح و متعلق به خود بازیکن باشد.
4) آیدی بازی در روز مسابقه باید با آیدی ثبت‌شده مطابقت داشته باشد.
5) استفاده از چیت، هک، اسکریپت، سوءاستفاده از باگ، جعل اسکرین‌شات یا هر ابزار غیرمجاز باعث حذف می‌شود.
6) نتیجه مسابقه طبق قوانین همان روم و با مدارک قابل بررسی ثبت می‌شود؛ داوری Gament ملاک تصمیم نهایی است.
7) بی‌احترامی، تهدید، نشر اطلاعات شخصی، اسپم و تبلیغات بدون مجوز ممنوع است.
8) ثبت‌نام قطعی، پرداخت ورودی احتمالی، مشاهده لابی و دریافت جایزه از داخل وب‌اپ Gament انجام می‌شود.`;

function html(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function timingSafeEqualText(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function validateWebhookSecret(request: NextRequest) {
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!configuredSecret) {
    return process.env.NODE_ENV === "production"
      ? { ok: false, status: 503, error: "Telegram webhook secret is not configured" }
      : { ok: true, status: 200, error: null };
  }

  const providedSecret = request.headers.get("x-telegram-bot-api-secret-token")?.trim() || "";
  if (!providedSecret || !timingSafeEqualText(providedSecret, configuredSecret)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true, status: 200, error: null };
}


async function getTelegramSetting(key: string, fallback = "") {
  try {
    const [row] = await db.select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
    return row?.value ?? fallback;
  } catch {
    return fallback;
  }
}

async function telegramFeatureEnabled(key: string, fallback = true) {
  const value = await getTelegramSetting(key, fallback ? "true" : "false");
  if (value === "false") return false;
  if (value === "true") return true;
  return fallback;
}

async function ensureFeatureEnabled(chatId: number, key: string, label: string) {
  if (await telegramFeatureEnabled(key, true)) return true;
  await sendMessage(chatId, `این قابلیت فعلاً از سمت مدیریت غیرفعال است: <b>${html(label)}</b>`);
  return false;
}

function normalizeGame(value?: string | null) {
  if (!value) return "";
  const normalized = normalizeDigits(value).trim().toLowerCase().replace(/-/g, "_");
  return GAME_ALIASES[normalized] || GAME_ALIASES[normalized.replace(/_/g, " ")] || normalized;
}

function gameLabel(gameId?: string) {
  const normalized = normalizeGame(gameId);
  const game = GAME_OPTIONS.find((item) => item.id === normalized);
  return game ? `${game.label} / ${game.fa}` : gameId || "نامشخص";
}

function gamePrompt(gameId?: string) {
  const normalized = normalizeGame(gameId);
  return GAME_OPTIONS.find((item) => item.id === normalized)?.accountPrompt || "آیدی بازی / گیمرتگ / یوزرنیم داخل بازی را وارد کن:";
}

function normalizeGamentId(value: string) {
  return normalizeDigits(value).trim().toUpperCase().replace(/\s+/g, "");
}

function linkCodeHash(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function generateLinkCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

function isValidGamentId(value: string) {
  const normalized = normalizeGamentId(value);
  if (!normalized.startsWith("FLX-")) return false;
  const suffix = normalized.slice(4);
  return suffix.length >= 4 && suffix.length <= 12 && /^[A-Z0-9-]+$/.test(suffix);
}

function replyKeyboard(rows: string[][]) {
  return {
    keyboard: rows,
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

function removeKeyboard() {
  return { remove_keyboard: true };
}

function mainMenuKeyboard() {
  const rows: Array<Array<Record<string, unknown>>> = [
      [
        { text: "⚡ Open Gament Mini App", web_app: { url: APP_URL } },
        { text: "🌐 وب‌اپ", url: APP_URL },
      ],
      ...(CHANNEL_URL ? [[{ text: "📣 کانال Gament Games", url: CHANNEL_URL }]] : []),
      [
        { text: "🏟 روم‌های فعال", callback_data: "menu:rooms" },
        { text: "🎮 پیش‌ثبت‌نام", callback_data: "menu:register" },
      ],
      [
        { text: "💳 کیف پول", callback_data: "menu:wallet" },
        { text: "🏆 تورنومنت‌های من", callback_data: "menu:my_tournaments" },
      ],
      [
        { text: "✅ چک‌این", callback_data: "menu:checkin" },
        { text: "⚔️ مسابقات من", callback_data: "menu:matches" },
      ],
      [
        { text: "⚔️ 1V1 کلش رویال", callback_data: "menu:clash_qr" },
        { text: "🎯 مأموریت‌ها", callback_data: "menu:missions" },
      ],
      [
        { text: "🧠 کوییز روزانه", callback_data: "menu:quiz" },
        { text: "📜 قوانین", callback_data: "menu:rules" },
      ],
      [
        { text: "🎧 پشتیبانی", callback_data: "menu:support" },
        { text: "🔗 اتصال حساب", callback_data: "menu:link" },
      ],
      [
        { text: "👤 پروفایل", callback_data: "menu:profile" },
        { text: "👤 وضعیت من", callback_data: "menu:status" },
      ],
      [
        { text: "🆕 ساخت حساب", url: `${APP_URL}/register` },
        { text: "🌐 پروفایل وب", url: `${APP_URL}/profile` },
      ],
    ];
  return { inline_keyboard: rows };
}

function gameKeyboard() {
  return {
    inline_keyboard: [
      ...GAME_OPTIONS.map((game) => [{ text: game.label, callback_data: `reg:game:${game.id}` }]),
      [{ text: "لغو", callback_data: "reg:abort" }],
    ],
  };
}

function platformKeyboard() {
  const rows = [];
  for (let i = 0; i < PLATFORM_OPTIONS.length; i += 2) {
    rows.push(
      PLATFORM_OPTIONS.slice(i, i + 2).map((platform, offset) => ({
        text: platform,
        callback_data: `reg:platform:${i + offset}`,
      }))
    );
  }
  rows.push([{ text: "لغو", callback_data: "reg:abort" }]);
  return { inline_keyboard: rows };
}

function confirmKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "✅ تأیید و ثبت نهایی", callback_data: "reg:confirm" }],
      [
        { text: "🔁 شروع دوباره", callback_data: "reg:restart" },
        { text: "لغو", callback_data: "reg:abort" },
      ],
    ],
  };
}

function roomsKeyboard(rows: Array<{ id: string; name: string | null; entryFee?: string | null; registeredCount?: number; maxPlayers?: number }>) {
  const keyboard: Array<Array<Record<string, string>>> = [[{ text: "🌐 مشاهده همه روم‌ها در وب‌اپ", url: `${APP_URL}/tournaments` }]];
  for (const row of rows.slice(0, 5)) {
    const title = (row.name || "روم Gament").slice(0, 28);
    const isFull = typeof row.registeredCount === "number" && typeof row.maxPlayers === "number" && row.registeredCount >= row.maxPlayers;
    keyboard.push([
      { text: isFull ? `ظرفیت تکمیل: ${title}` : `✅ ثبت‌نام: ${title}`, callback_data: `join:${row.id}` },
    ]);
    keyboard.push([{ text: `جزئیات: ${title}`, url: `${APP_URL}/tournaments/${row.id}` }]);
  }
  keyboard.push([{ text: "🎮 پیش‌ثبت‌نام", callback_data: "menu:register" }]);
  return { inline_keyboard: keyboard };
}

async function telegramApi(method: string, payload: Record<string, unknown>) {
  const token = process.env.BOT_TOKEN?.trim();
  if (!token) throw new Error("BOT_TOKEN is missing");

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const result = await response.json().catch(() => null) as { ok?: boolean; description?: string; result?: unknown } | null;
  if (!response.ok || !result?.ok) {
    logger.warn({ method, status: response.status, result }, "Telegram API call failed");
  }
  return result;
}

async function sendMessage(chatId: number, text: string, replyMarkup?: Record<string, unknown>) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
}

async function sendPhoto(chatId: number, photo: string, caption?: string, replyMarkup?: Record<string, unknown>) {
  return telegramApi("sendPhoto", {
    chat_id: chatId,
    photo,
    caption,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
}

async function sendDocument(chatId: number, content: string, filename: string, caption?: string) {
  const token = process.env.BOT_TOKEN?.trim();
  if (!token) throw new Error("BOT_TOKEN is missing");
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) form.append("caption", caption);
  form.append("document", new Blob([content], { type: "text/csv;charset=utf-8" }), filename);
  const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: form });
  const result = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
  if (!response.ok || !result?.ok) logger.warn({ status: response.status, result }, "Telegram sendDocument failed");
  return result;
}

async function editMessage(chatId: number, messageId: number, text: string, replyMarkup?: Record<string, unknown>) {
  return telegramApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
}

async function answerCallback(callbackQueryId: string, text?: string) {
  return telegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  });
}

async function isChannelMember(telegramId: string) {
  const setting = await getTelegramSetting("telegram_require_channel_membership", "");
  const requireMembership = setting ? setting === "true" : process.env.TELEGRAM_REQUIRE_CHANNEL_MEMBERSHIP === "true";
  if (!requireMembership) return true;
  const result = await telegramApi("getChatMember", {
    chat_id: process.env.TELEGRAM_CHANNEL_ID || "@Gament_games",
    user_id: Number(telegramId),
  });
  const member = result?.result as { status?: string } | undefined;
  return Boolean(member?.status && !["left", "kicked"].includes(member.status));
}

async function promptChannelMembership(chatId: number) {
  await sendMessage(chatId, "برای ادامه، اول عضو کانال رسمی Gament Games شو و بعد دوباره تلاش کن:", {
    inline_keyboard: [
      [{ text: "📣 عضویت در کانال", url: CHANNEL_URL || "https://t.me/Gament_games" }],
      [{ text: "✅ عضو شدم", callback_data: "menu:register" }],
    ],
  });
}

async function getLinkedUserByTelegram(telegramId: string) {
  const [row] = await db
    .select({
      userId: telegramAccounts.userId,
      gamentId: users.gamentId,
      displayName: users.displayName,
      username: users.username,
      role: users.role,
      level: users.level,
      rankPoints: users.rankPoints,
    })
    .from(telegramAccounts)
    .leftJoin(users, eq(telegramAccounts.userId, users.id))
    .where(eq(telegramAccounts.telegramId, telegramId))
    .limit(1);
  return row || null;
}

function isFreeEntryFee(entryFee?: string | null) {
  const value = normalizeDigits(entryFee || "").trim().toLowerCase();
  if (!value || value === "0") return true;
  return ["رایگان", "free", "مجانی"].some((word) => value.includes(word));
}

async function getOrCreateUserPlayer(userId: string, fallbackName: string, username?: string | null) {
  const [existing] = await db.select().from(players).where(eq(players.visibleUserId, userId)).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(players)
    .values({
      visibleUserId: userId,
      username: username || fallbackName || `player_${userId.slice(0, 6)}`,
      displayName: fallbackName || username || "Gament Player",
    })
    .returning();
  return created;
}

async function getOrCreateWallet(userId: string, tx: any = db) {
  const [existing] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (existing) return existing;
  const [created] = await tx.insert(wallets).values({ userId, balance: "0", currency: "RIAL" }).returning();
  return created;
}


async function downloadTelegramPhotoAsDataUrl(fileId: string) {
  const token = process.env.BOT_TOKEN?.trim();
  if (!token) throw new Error("BOT_TOKEN is missing");
  const fileInfo = await telegramApi("getFile", { file_id: fileId }) as { ok?: boolean; result?: { file_path?: string; file_size?: number } } | null;
  const filePath = fileInfo?.result?.file_path;
  if (!fileInfo?.ok || !filePath) throw new Error("TELEGRAM_FILE_NOT_FOUND");
  const size = Number(fileInfo.result?.file_size || 0);
  if (size > 1.2 * 1024 * 1024) throw new Error("RECEIPT_TOO_LARGE");

  const res = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, { cache: "no-store" });
  if (!res.ok) throw new Error("TELEGRAM_FILE_DOWNLOAD_FAILED");
  const contentType = res.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) throw new Error("INVALID_RECEIPT_TYPE");
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > 1.2 * 1024 * 1024) throw new Error("RECEIPT_TOO_LARGE");
  return {
    dataUrl: `data:${contentType};base64,${buffer.toString("base64")}`,
    contentType,
    size: buffer.byteLength,
    fileName: filePath.split("/").pop() || "telegram-receipt.jpg",
  };
}


async function downloadTelegramPhotoAsBuffer(fileId: string, maxBytes = 2 * 1024 * 1024) {
  const token = process.env.BOT_TOKEN?.trim();
  if (!token) throw new Error("BOT_TOKEN is missing");
  const fileInfo = await telegramApi("getFile", { file_id: fileId }) as { ok?: boolean; result?: { file_path?: string; file_size?: number } } | null;
  const filePath = fileInfo?.result?.file_path;
  if (!fileInfo?.ok || !filePath) throw new Error("TELEGRAM_FILE_NOT_FOUND");
  const size = Number(fileInfo.result?.file_size || 0);
  if (size > maxBytes) throw new Error("QR_TOO_LARGE");

  const res = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, { cache: "no-store" });
  if (!res.ok) throw new Error("TELEGRAM_FILE_DOWNLOAD_FAILED");
  const contentType = res.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) throw new Error("INVALID_QR_TYPE");
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > maxBytes) throw new Error("QR_TOO_LARGE");
  return {
    buffer,
    contentType,
    size: buffer.byteLength,
    fileName: filePath.split("/").pop() || "telegram-qr.jpg",
  };
}

function extractInviteReference(value?: string | null) {
  const input = normalizeDigits(value || "").trim();
  if (!input) return null;
  const match = input.match(/(?:https?:\/\/|clashroyale:\/\/|supercell:\/\/|scid:\/\/)[^\s<>"']+/i);
  const candidate = (match?.[0] || input).trim().replace(/[،,؛;.)\]]+$/g, "");
  if (candidate.length < 4 || candidate.length > 500) return null;
  return candidate;
}

function isHttpUrl(value?: string | null) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

async function decodeQrInviteFromTelegramPhoto(fileId: string) {
  try {
    const file = await downloadTelegramPhotoAsBuffer(fileId);
    const image = await Jimp.read(file.buffer);
    const bitmap = image.bitmap;
    const data = new Uint8ClampedArray(bitmap.data.buffer, bitmap.data.byteOffset, bitmap.data.byteLength);
    const decoded = jsQR(data, bitmap.width, bitmap.height);
    return extractInviteReference(decoded?.data || "");
  } catch (err) {
    logger.warn({ err }, "Failed to decode Clash Royale QR from Telegram photo");
    return null;
  }
}

async function notifyAdminsOnWalletDeposit(user: TelegramUser, userId: string, amountRial: bigint, txId: string) {
  const adminIds = getAdminIds();
  if (!adminIds.length) return;
  const username = user.username ? `@${user.username}` : "—";
  const text = [
    "💳 <b>فیش واریز جدید از ربات</b>",
    "",
    `مبلغ: <b>${html(formatTomanFromRial(amountRial))}</b>`,
    `Telegram: <code>${html(user.id)}</code> | ${html(username)}`,
    `User ID: <code>${html(userId)}</code>`,
    `Transaction: <code>${html(txId)}</code>`,
    "",
    "برای مشاهده فیش و تأیید/رد وارد پنل کیف پول شو.",
  ].join("\n");
  for (const adminId of adminIds) {
    const numericId = Number(adminId);
    if (!Number.isFinite(numericId)) continue;
    await sendMessage(numericId, text, { inline_keyboard: [[{ text: "پنل کیف پول", url: `${APP_URL}/admin/wallets` }]] });
  }
}

async function startWalletDeposit(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای ثبت فیش واریز، اول حساب تلگرامت را با /link به Gament وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
    });
    return;
  }
  await setSession(telegramId, "wallet_deposit_amount", {});
  await sendMessage(chatId, "💳 <b>ثبت فیش واریز کارت‌به‌کارت</b>\n\nمبلغ واریزی را به تومان وارد کن. مثال: <code>500000</code> یا <code>500,000</code>", replyKeyboard([[CANCEL_TEXT]]));
}

async function rewardUserXP(userId: string, amount: number, reason: string) {
  try {
    const result = await db.transaction(async (tx) => LevelingService.addXP(tx, userId, amount));
    return `\n🎁 +${amount} XP (${reason}) — Level ${result.level}`;
  } catch (err) {
    logger.warn({ err, userId, amount, reason }, "Failed to reward XP");
    return "";
  }
}

async function getSession(telegramId: string): Promise<BotSession> {
  const [row] = await db
    .select({ state: telegramBotSessions.state, data: telegramBotSessions.data })
    .from(telegramBotSessions)
    .where(eq(telegramBotSessions.telegramId, telegramId))
    .limit(1);

  if (!row) return { state: "idle", data: {} };
  return {
    state: (row.state || "idle") as BotState,
    data: (row.data || {}) as SessionData,
  };
}

async function setSession(telegramId: string, state: BotState, data: SessionData) {
  await db
    .insert(telegramBotSessions)
    .values({ telegramId, state, data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: telegramBotSessions.telegramId,
      set: { state, data, updatedAt: new Date() },
    });
}

async function clearSession(telegramId: string) {
  await db.delete(telegramBotSessions).where(eq(telegramBotSessions.telegramId, telegramId));
}

function registrationSummary(data: SessionData) {
  return [
    "⚡ <b>خلاصه پیش‌ثبت‌نام Gament</b>",
    "",
    `🎮 بازی: <b>${html(gameLabel(data.game))}</b>`,
    `🕹 پلتفرم: <b>${html(data.platform || "-")}</b>`,
    `👤 نام: <b>${html(data.fullName || "-")}</b>`,
    `🏷 آیدی بازی: <b>${html(data.gamerTag || "-")}</b>`,
    data.gamentId ? `🆔 Gament ID: <code>${html(data.gamentId)}</code>` : "🆔 Gament ID: <b>ثبت نشده</b>",
    `📞 شماره تماس: <b>${html(data.phoneNumber || "-")}</b>`,
    data.city ? `📍 شهر: <b>${html(data.city)}</b>` : "",
    data.teamName ? `👥 تیم/کلن: <b>${html(data.teamName)}</b>` : "",
  ].filter(Boolean).join("\n");
}

async function findLinkedUserId(gamentId: string | undefined, phoneNumber: string) {
  const conditions = [];
  if (gamentId) conditions.push(eq(users.gamentId, gamentId));
  if (/^09\d{9}$/.test(phoneNumber)) conditions.push(eq(users.phoneNumber, phoneNumber));
  if (!conditions.length) return null;

  const [linkedUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(conditions.length === 1 ? conditions[0] : or(...conditions))
    .limit(1);

  return linkedUser?.id || null;
}

async function savePreRegistration(user: TelegramUser, data: SessionData) {
  const phoneNumber = normalizePhoneNumber(data.phoneNumber || "");
  const gamentId = data.gamentId ? normalizeGamentId(data.gamentId) : null;
  const linkedUserId = await findLinkedUserId(gamentId || undefined, phoneNumber);
  const values = {
    telegramId: String(user.id),
    telegramUsername: user.username || null,
    telegramFirstName: user.first_name || null,
    telegramLastName: user.last_name || null,
    linkedUserId,
    gamentId,
    fullName: (data.fullName || "").slice(0, 100),
    phoneNumber,
    game: normalizeGame(data.game),
    platform: data.platform || null,
    gamerTag: (data.gamerTag || "").slice(0, 100),
    city: data.city || null,
    teamName: data.teamName || null,
    status: "new",
    source: "telegram_webhook",
    rawPayload: { source: "telegram_webhook", data, telegramUser: user },
    updatedAt: new Date(),
  };

  await db
    .insert(telegramPreRegistrations)
    .values(values)
    .onConflictDoUpdate({
      target: telegramPreRegistrations.telegramId,
      set: values,
    });

  await notifyAdminsOnPreRegistration(user, data, linkedUserId).catch((err) => {
    logger.warn({ err, telegramId: user.id }, "Failed to notify Telegram admins about pre-registration");
  });
}

async function recordReferralIfNeeded(user: TelegramUser, startPayload?: string) {
  if (!startPayload) return;
  const payload = startPayload.trim().slice(0, 100);
  const referredTelegramId = String(user.id);

  if (payload.startsWith("ref_")) {
    const referrerTelegramId = payload.replace("ref_", "").trim();
    if (/^\d+$/.test(referrerTelegramId) && referrerTelegramId !== referredTelegramId) {
      const [created] = await db
        .insert(telegramReferrals)
        .values({
          referrerTelegramId,
          referredTelegramId,
          referredUsername: user.username || null,
        })
        .onConflictDoNothing({ target: telegramReferrals.referredTelegramId })
        .returning({ id: telegramReferrals.id });
      if (created) {
        const referrer = await getLinkedUserByTelegram(referrerTelegramId);
        if (referrer?.userId) {
          const key = `referral:first:${referrerTelegramId}:${referredTelegramId}`;
          const [existingReward] = await db.select({ id: telegramSentNotifications.id }).from(telegramSentNotifications).where(eq(telegramSentNotifications.dedupeKey, key)).limit(1);
          if (!existingReward) {
            await db.insert(telegramSentNotifications).values({ dedupeKey: key, telegramId: referrerTelegramId, type: "referral_reward" });
            const xpText = await rewardUserXP(referrer.userId, 30, "دعوت کاربر جدید");
            const chatId = Number(referrerTelegramId);
            if (Number.isFinite(chatId)) await sendMessage(chatId, `🎉 یک نفر با لینک دعوت شما وارد ربات شد.${xpText}`);
          }
        }
      }
    }
    return;
  }

  if (payload.startsWith("campaign_") || payload.startsWith("streamer_") || payload.startsWith("utm_")) {
    await db.insert(telegramCampaignEvents).values({
      campaign: payload,
      telegramId: referredTelegramId,
      telegramUsername: user.username || null,
      eventType: "start",
      rawPayload: { firstName: user.first_name || null, lastName: user.last_name || null },
    });
  }
}


function normalizeStartPayload(value?: string) {
  return decodeURIComponent(value || "").trim().slice(0, 120).replace(/\s+/g, "_");
}

function deepLinkKeyboard(url: string, label = "باز کردن در Gament") {
  return {
    inline_keyboard: [
      [{ text: label, web_app: { url } }],
      [{ text: "باز کردن در مرورگر", url }],
      [{ text: "منوی اصلی ربات", callback_data: "menu:home" }],
    ],
  };
}

async function handleStartPayload(chatId: number, telegramId: string, user: TelegramUser, rawPayload?: string) {
  const payload = normalizeStartPayload(rawPayload);
  if (!payload || payload.startsWith("ref_") || payload.startsWith("campaign_") || payload.startsWith("streamer_") || payload.startsWith("utm_")) return false;

  if (["wallet", "wallet_deposit", "deposit", "charge"].includes(payload)) {
    if (payload === "deposit" || payload === "wallet_deposit" || payload === "charge") {
      await startWalletDeposit(chatId, telegramId);
      return true;
    }
    await walletCommand(chatId, telegramId);
    return true;
  }

  if (payload === "profile") {
    await profileCommand(chatId, telegramId);
    return true;
  }
  if (payload === "register") {
    await registerStart(chatId, telegramId);
    return true;
  }
  if (payload === "rooms" || payload === "tournaments") {
    await roomsCommand(chatId);
    return true;
  }
  if (payload === "missions") {
    await missionsCommand(chatId, telegramId);
    return true;
  }
  if (payload === "invite") {
    await inviteCommand(chatId, telegramId);
    return true;
  }

  if (payload === "honors" || payload === "honor_latest") {
    const [latest] = await db.select({ id: honors.id, title: honors.title, type: honors.type }).from(honors).where(eq(honors.status, "approved")).orderBy(desc(honors.publishedAt), desc(honors.createdAt)).limit(1);
    const url = latest ? `${APP_URL}/honors/${latest.id}` : `${APP_URL}/honors`;
    await sendMessage(
      chatId,
      latest ? `🏛 <b>آخرین خبر/افتخار Gament</b>\n\n${html(latest.title)}` : "🏛 تالار افتخارات Gament",
      deepLinkKeyboard(url, latest ? "مشاهده آخرین خبر" : "مشاهده تالار افتخارات")
    );
    return true;
  }

  if (payload === "link") {
    await linkCommand(chatId, user);
    return true;
  }

  const qrTournamentId = payload.match(/^qr_([0-9a-f-]{36})$/i)?.[1];
  if (qrTournamentId) {
    await startClashQrSubmission(chatId, telegramId, qrTournamentId);
    return true;
  }

  const tournamentId = payload.match(/^(?:tournament|t)_([0-9a-f-]{36})$/i)?.[1];
  if (tournamentId) {
    const [tournament] = await db.select({ id: tournaments.id, name: tournaments.name, game: tournaments.game, status: tournaments.status, entryFee: tournaments.entryFee, startDate: tournaments.startDate }).from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
    const url = `${APP_URL}/tournaments/${tournamentId}`;
    await sendMessage(
      chatId,
      tournament
        ? `🏆 <b>${html(tournament.name)}</b>\n\n🎮 ${html(gameLabel(tournament.game))}\nوضعیت: <b>${html(tournament.status)}</b>\nورودی: <b>${html(tournament.entryFee || "رایگان")}</b>${tournament.startDate ? `\nشروع: <b>${new Date(tournament.startDate).toLocaleString("fa-IR")}</b>` : ""}`
        : "🏆 این تورنومنت در Gament باز می‌شود.",
      deepLinkKeyboard(url, tournament?.status === "registration" ? "ثبت‌نام / مشاهده تورنومنت" : "مشاهده تورنومنت")
    );
    return true;
  }

  const honorId = payload.match(/^(?:honor|h)_([a-zA-Z0-9-]{3,80})$/)?.[1];
  if (honorId) {
    const uuidLike = /^[0-9a-f-]{36}$/i.test(honorId);
    const row = uuidLike ? (await db.select({ id: honors.id, title: honors.title, type: honors.type, game: honors.game }).from(honors).where(eq(honors.id, honorId)).limit(1))[0] : null;
    const url = `${APP_URL}/honors/${honorId}`;
    await sendMessage(
      chatId,
      row
        ? `🏛 <b>${html(row.title)}</b>\n\nنوع: <b>${html(row.type)}</b>${row.game ? `\nبازی: <b>${html(row.game)}</b>` : ""}\n\nبرای خواندن کامل، لایک و مشاهده آمار وارد Gament شو.`
        : "🏛 این خبر/افتخار در تالار افتخارات Gament باز می‌شود.",
      deepLinkKeyboard(url, "مشاهده خبر / افتخار")
    );
    return true;
  }

  await sendMessage(chatId, "لینک ورودی را متوجه نشدم؛ منوی اصلی را باز کردم.", mainMenuKeyboard());
  return true;
}

function telegramStartLink(payload: string) {
  const username = process.env.TELEGRAM_BOT_USERNAME || "FlexaTournamentBot";
  return `https://t.me/${username}?start=${encodeURIComponent(payload)}`;
}

async function deepLinksCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const rows = [
    ["کیف پول", telegramStartLink("wallet")],
    ["ثبت فیش", telegramStartLink("deposit")],
    ["تورنومنت‌ها", telegramStartLink("tournaments")],
    ["تالار افتخارات", telegramStartLink("honor_latest")],
    ["مأموریت‌ها", telegramStartLink("missions")],
    ["اتصال حساب", telegramStartLink("link")],
  ];
  await sendMessage(chatId, ["🔗 <b>Deep Linkهای آماده ربات</b>", "", ...rows.map(([label, link]) => `<b>${label}</b>\n<code>${html(link)}</code>`)].join("\n\n"));
}

async function startCommand(chatId: number) {
  await sendMessage(
    chatId,
    `سلام 👋\nبه <b>Gament — پلتفرم تورنومنت گیمینگ</b> خوش آمدی.\n\nاز اینجا می‌تونی روم‌های فعال رو ببینی، پیش‌ثبت‌نام کنی و لینک‌های مهم گیمنت رو دریافت کنی.\n\nثبت‌نام قطعی، پرداخت ورودی احتمالی، مشاهده لابی و داوری نهایی از داخل وب‌اپ انجام می‌شود.`,
    mainMenuKeyboard()
  );
}

async function linksCommand(chatId: number) {
  const rows: Array<Array<Record<string, string>>> = [
    [{ text: "⚡ وب‌اپ Gament", url: APP_URL }],
    [{ text: "🏟 تورنومنت‌ها", url: `${APP_URL}/tournaments` }],
    [{ text: "🆕 ساخت حساب", url: `${APP_URL}/register` }],
    [{ text: "👤 پروفایل", url: `${APP_URL}/profile` }],
  ];
  if (CHANNEL_URL) rows.push([{ text: "📣 کانال Gament Games", url: CHANNEL_URL }]);
  await sendMessage(chatId, "🔗 لینک‌های مهم Gament:", { inline_keyboard: rows });
}

async function channelCommand(chatId: number) {
  if (!CHANNEL_URL) {
    await sendMessage(chatId, "لینک کانال هنوز تنظیم نشده است.", mainMenuKeyboard());
    return;
  }
  await sendMessage(chatId, "📣 کانال رسمی Gament Games:", {
    inline_keyboard: [[{ text: "ورود به کانال", url: CHANNEL_URL }]],
  });
}

async function rulesCommand(chatId: number) {
  await sendMessage(chatId, html(DEFAULT_RULES) + `\n\n🏟 روم‌ها: ${html(`${APP_URL}/tournaments`)}`, mainMenuKeyboard());
}

async function registerStart(chatId: number, telegramId: string) {
  if (!(await isChannelMember(telegramId))) {
    await promptChannelMembership(chatId);
    return;
  }
  await setSession(telegramId, "idle", {});
  await sendMessage(
    chatId,
    "🎮 <b>پیش‌ثبت‌نام تلگرامی Gament</b>\n\nبازی موردنظر را انتخاب کن.\n\nنکته: ثبت‌نام قطعی و پرداخت ورودی احتمالی از داخل وب‌اپ انجام می‌شود.",
    gameKeyboard()
  );
}

async function roomsCommand(chatId: number, gameFilter?: string) {
  const game = normalizeGame(gameFilter);
  const where = game ? and(eq(tournaments.status, "registration"), eq(tournaments.game, game as "cod_mobile" | "fortnite" | "clash_royale")) : eq(tournaments.status, "registration");
  const rows = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      game: tournaments.game,
      gameMode: tournaments.gameMode,
      maxPlayers: tournaments.maxPlayers,
      prizePool: tournaments.prizePool,
      entryFee: tournaments.entryFee,
      status: tournaments.status,
      registeredCount: count(registrations.id),
    })
    .from(tournaments)
    .leftJoin(registrations, eq(registrations.tournamentId, tournaments.id))
    .where(where)
    .groupBy(tournaments.id)
    .orderBy(desc(tournaments.createdAt))
    .limit(10);

  if (!rows.length) {
    await sendMessage(chatId, "فعلاً روم فعالی پیدا نشد. از وب‌اپ هم می‌تونی آخرین وضعیت رو ببینی:", {
      inline_keyboard: [[{ text: "🏟 مشاهده روم‌ها", url: `${APP_URL}/tournaments` }]],
    });
    return;
  }

  const text = [
    "🏟 <b>روم‌های فعال Gament</b>",
    "",
    ...rows.map((row, index) => [
      `<b>${index + 1}. ${html(row.name || "روم Gament")}</b>`,
      `🎮 ${html(gameLabel(row.game))} | ${html(row.gameMode || "مود اعلام نشده")}`,
      `👥 ظرفیت: <b>${row.registeredCount}/${row.maxPlayers}</b>`,
      `💳 ورودی: <b>${html(row.entryFee || "رایگان")}</b>`,
      `🏆 جایزه: <b>${html(row.prizePool || "اعلام نشده")}</b>`,
    ].join("\n")),
    "",
    "برای ثبت‌نام قطعی وارد وب‌اپ شو.",
  ].join("\n\n");

  await sendMessage(chatId, text, roomsKeyboard(rows));
}

async function joinTournamentFromTelegram(chatId: number, telegramId: string, tournamentId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای ثبت‌نام مستقیم، اول حساب تلگرامت را با /link به Gament وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }], [{ text: "ورود به پروفایل", url: `${APP_URL}/profile` }]],
    });
    return;
  }

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
  if (!tournament) {
    await sendMessage(chatId, "تورنومنت پیدا نشد یا حذف شده است.");
    return;
  }
  if (tournament.status !== "registration") {
    await sendMessage(chatId, "ثبت‌نام این تورنومنت در حال حاضر باز نیست.");
    return;
  }

  const entryFeeRial = getEntryFeeRial(tournament.entryFee);
  const isPaid = entryFeeRial > BigInt(0);
  const player = await getOrCreateUserPlayer(linked.userId, linked.displayName || linked.username || "Gament Player", linked.username);

  const result = await db.transaction(async (tx) => {
    const [{ value: registeredCount }] = await tx.select({ value: count() }).from(registrations).where(eq(registrations.tournamentId, tournamentId));
    if (registeredCount >= tournament.maxPlayers) return { ok: false as const, code: "FULL" };

    const [existing] = await tx
      .select({ id: registrations.id })
      .from(registrations)
      .where(and(eq(registrations.tournamentId, tournamentId), eq(registrations.visibleUserId, linked.userId)))
      .limit(1);
    if (existing) return { ok: false as const, code: "DUPLICATE" };

    let paymentText = "";
    let finalEntryFeeRial = entryFeeRial;
    let couponRedemptionId: string | null = null;
    let couponId: string | null = null;
    let discountRial = BigInt(0);

      if (isPaid) {
        const [activeCoupon] = await tx
          .select({
            redemptionId: couponRedemptions.id,
            couponId: coupons.id,
            code: coupons.code,
            discountPercent: coupons.discountPercent,
            expiresAt: coupons.expiresAt,
            game: coupons.game,
            couponTournamentId: coupons.tournamentId,
            maxUses: coupons.maxUses,
            usedCount: coupons.usedCount,
          })
          .from(couponRedemptions)
          .innerJoin(coupons, eq(couponRedemptions.couponId, coupons.id))
          .where(and(eq(couponRedemptions.userId, linked.userId), eq(couponRedemptions.status, "active"), eq(coupons.isActive, true)))
          .orderBy(desc(couponRedemptions.createdAt))
          .limit(1);

        const couponValid = activeCoupon
          && (!activeCoupon.expiresAt || new Date(activeCoupon.expiresAt) > new Date())
          && (!activeCoupon.game || activeCoupon.game === tournament.game)
          && (!activeCoupon.couponTournamentId || activeCoupon.couponTournamentId === tournament.id)
          && (!activeCoupon.maxUses || activeCoupon.usedCount < activeCoupon.maxUses)
          && activeCoupon.discountPercent > 0;

        if (couponValid) {
          couponRedemptionId = activeCoupon.redemptionId;
          couponId = activeCoupon.couponId;
          discountRial = (entryFeeRial * BigInt(activeCoupon.discountPercent)) / BigInt(100);
          finalEntryFeeRial = entryFeeRial - discountRial;
          paymentText += `\n🎟 کوپن <code>${html(activeCoupon.code)}</code>: <b>${activeCoupon.discountPercent}% تخفیف</b>`;
        }

        const wallet = await getOrCreateWallet(linked.userId, tx);
        
        // ATOMIC UPDATE: Use WHERE balance >= finalEntryFeeRial to prevent over-spending
        const updateResult = await tx.update(wallets)
          .set({ 
            balance: sql`${wallets.balance} - ${finalEntryFeeRial.toString()}`, 
            updatedAt: new Date() 
          })
          .where(and(
            eq(wallets.id, wallet.id),
            sql`${wallets.balance} >= ${finalEntryFeeRial.toString()}`
          ));

        if (updateResult.rowCount === 0) {
          // Fetch actual balance only on failure to show the user
          const [currentWallet] = await tx.select().from(wallets).where(eq(wallets.id, wallet.id)).limit(1);
          const actualBalance = currentWallet ? bigIntFromText(currentWallet.balance) : BigInt(0);
          
          return { 
            ok: false as const, 
            code: "INSUFFICIENT", 
            balance: actualBalance, 
            finalEntryFeeRial 
          };
        }

        if (couponRedemptionId && couponId) {
          await tx.update(couponRedemptions).set({ status: "used", tournamentId: tournament.id, discountRial: discountRial.toString(), usedAt: new Date() }).where(eq(couponRedemptions.id, couponRedemptionId));
          await tx.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.id, couponId));
        }
        await tx.insert(transactions).values({
          walletId: wallet.id,
          amount: finalEntryFeeRial.toString(),
          type: "entry_fee",
          status: "completed",
          referenceId: `telegram-entry-${tournamentId}-${linked.userId}-${Date.now()}`,
          metadata: {
            kind: "telegram_entry_fee",
            tournamentId,
            tournamentName: tournament.name,
            playerId: player.id,
            playerName: player.displayName,
            userId: linked.userId,
            telegramId,
            originalEntryFeeRial: entryFeeRial.toString(),
            discountRial: discountRial.toString(),
            couponRedemptionId,
          },
        });
        paymentText += `\n💳 ورودی از کیف پول کسر شد: <b>${html(formatTomanFromRial(finalEntryFeeRial))}</b>`;
      }

    const [registration] = await tx.insert(registrations).values({ tournamentId, playerId: player.id, visibleUserId: linked.userId }).returning();
    return { ok: true as const, paymentText, registrationId: registration.id };
  });

  if (!result.ok) {
    if (result.code === "FULL") return sendMessage(chatId, "ظرفیت این تورنومنت تکمیل شده است. می‌خواهی در لیست انتظار قرار بگیری؟", {
      inline_keyboard: [[{ text: "🕒 ورود به لیست انتظار", callback_data: `waitlist:${tournament.id}` }]],
    });
    if (result.code === "DUPLICATE") {
      if (tournament.game === "clash_royale" && tournament.categoryLabel === CLASH_1V1_CONFIG.categoryLabel) {
        await sendMessage(chatId, "✅ شما قبلاً در 1V1 کلش رویال ثبت‌نام کرده‌اید. حالا QR یا Share Link را می‌گیریم تا حریف پیدا شود.");
        return startClashQrSubmission(chatId, telegramId, tournament.id);
      }
      return sendMessage(chatId, "شما قبلاً در این تورنومنت ثبت‌نام کرده‌اید.", {
        inline_keyboard: [[{ text: "مشاهده تورنومنت", url: `${APP_URL}/tournaments/${tournament.id}` }]],
      });
    }
    if (result.code === "INSUFFICIENT") {
      return sendMessage(chatId, `موجودی کیف پول کافی نیست.\nمبلغ لازم: <b>${html(formatTomanFromRial(result.finalEntryFeeRial || entryFeeRial))}</b>\nموجودی شما: <b>${html(formatTomanFromRial(result.balance || BigInt(0)))}</b>`, {
        inline_keyboard: [
          [{ text: "💳 ثبت فیش شارژ از همین بات", callback_data: "wallet:deposit" }],
          [{ text: "شارژ کیف پول در وب‌اپ", url: `${APP_URL}/wallet` }],
          [{ text: "مشاهده تورنومنت", url: `${APP_URL}/tournaments/${tournament.id}` }],
        ],
      });
    }
    return sendMessage(chatId, "ثبت‌نام انجام نشد.");
  }

  await evaluateUserAchievements(linked.userId).catch(() => undefined);
  const xpText = await rewardUserXP(linked.userId, isPaid ? 25 : 15, isPaid ? "ثبت‌نام پولی" : "ثبت‌نام تورنومنت");

  const needsClashQr = tournament.game === "clash_royale" && isPaid;
  const qrLine = needsClashQr ? "\n\n⚔️ مرحله بعد: QR یا Share Link را برای 1V1 کلش رویال ارسال کن." : "";
  await sendMessage(chatId, `✅ ثبت‌نام شما در تورنومنت انجام شد.

🏆 <b>${html(tournament.name)}</b>
🎮 ${html(gameLabel(tournament.game))}${result.paymentText}${xpText}${qrLine}`, {
    inline_keyboard: [
      ...(needsClashQr ? [[{ text: "⚔️ 1V1 کلش رویال", callback_data: `qr:${tournament.id}` }]] : []),
      [{ text: "مشاهده تورنومنت", url: `${APP_URL}/tournaments/${tournament.id}` }],
    ],
  });

  if (needsClashQr) {
    await startClashQrSubmission(chatId, telegramId, tournament.id, result.registrationId);
  }
}

async function joinWaitlist(chatId: number, telegramId: string, tournamentId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "برای لیست انتظار، اول حساب را با /link وصل کن.");
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
  if (!tournament) return sendMessage(chatId, "تورنومنت پیدا نشد.");
  const [existing] = await db
    .select({ id: tournamentWaitlist.id })
    .from(tournamentWaitlist)
    .where(and(eq(tournamentWaitlist.tournamentId, tournamentId), eq(tournamentWaitlist.userId, linked.userId), eq(tournamentWaitlist.status, "waiting")))
    .limit(1);
  if (!existing) {
    await db.insert(tournamentWaitlist).values({ tournamentId, userId: linked.userId, telegramId, status: "waiting" });
  }
  await sendMessage(chatId, `✅ شما در لیست انتظار <b>${html(tournament.name)}</b> قرار گرفتید. اگر ظرفیت آزاد شود اطلاع می‌دهیم.`);
}

async function notifyWaitlistSpot(tournamentId: string) {
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
  if (!tournament) return;
  const [{ value }] = await db.select({ value: count() }).from(registrations).where(eq(registrations.tournamentId, tournamentId));
  if (value >= tournament.maxPlayers) return;
  const [waiting] = await db
    .select()
    .from(tournamentWaitlist)
    .where(and(eq(tournamentWaitlist.tournamentId, tournamentId), eq(tournamentWaitlist.status, "waiting")))
    .orderBy(tournamentWaitlist.createdAt)
    .limit(1);
  if (!waiting?.telegramId) return;
  await db.update(tournamentWaitlist).set({ status: "notified", notifiedAt: new Date() }).where(eq(tournamentWaitlist.id, waiting.id));
  await sendMessage(Number(waiting.telegramId), `🎟 یک ظرفیت در تورنومنت <b>${html(tournament.name)}</b> آزاد شد.`, {
    inline_keyboard: [[{ text: "ثبت‌نام سریع", callback_data: `join:${tournament.id}` }]],
  });
}

async function statusCommand(chatId: number, telegramId: string) {
  const [row] = await db
    .select()
    .from(telegramPreRegistrations)
    .where(eq(telegramPreRegistrations.telegramId, telegramId))
    .limit(1);

  if (!row) {
    await sendMessage(chatId, "هنوز پیش‌ثبت‌نامی برای شما ثبت نشده است.", mainMenuKeyboard());
    return;
  }

  await sendMessage(
    chatId,
    [
      "👤 <b>وضعیت پیش‌ثبت‌نام شما</b>",
      "",
      `نام: <b>${html(row.fullName)}</b>`,
      `بازی: <b>${html(gameLabel(row.game))}</b>`,
      `آیدی بازی: <b>${html(row.gamerTag)}</b>`,
      row.gamentId ? `Gament ID: <code>${html(row.gamentId)}</code>` : "Gament ID: ثبت نشده",
      `وضعیت پیگیری: <b>${html(row.status)}</b>`,
    ].join("\n"),
    mainMenuKeyboard()
  );
}

async function linkCommand(chatId: number, user: TelegramUser) {
  const telegramId = String(user.id);
  const [existing] = await db
    .select({
      telegramId: telegramAccounts.telegramId,
      telegramUsername: telegramAccounts.telegramUsername,
      linkedAt: telegramAccounts.linkedAt,
      displayName: users.displayName,
      gamentId: users.gamentId,
    })
    .from(telegramAccounts)
    .leftJoin(users, eq(telegramAccounts.userId, users.id))
    .where(eq(telegramAccounts.telegramId, telegramId))
    .limit(1);

  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.insert(telegramLinkCodes).values({
    telegramId,
    codeHash: linkCodeHash(code),
    telegramUsername: user.username || null,
    telegramFirstName: user.first_name || null,
    telegramLastName: user.last_name || null,
    expiresAt,
  });

  const alreadyLinked = existing?.gamentId
    ? `\n\nاکنون به حساب <b>${html(existing.displayName || "Gament")}</b> با Gament ID <code>${html(existing.gamentId)}</code> لینک هستی. اگر کد جدید را در حساب دیگری وارد کنی، اتصال منتقل می‌شود.`
    : "";

  await sendMessage(
    chatId,
    [
      "🔗 <b>اتصال حساب تلگرام به Gament</b>",
      "",
      "کد زیر را داخل سایت Gament، صفحه پروفایل، بخش «اتصال تلگرام» وارد کن:",
      "",
      `<code>${code}</code>`,
      "",
      "⏳ اعتبار کد: ۱۰ دقیقه",
      alreadyLinked,
      "",
      "اگر هنوز حساب Gament نداری، اول ثبت‌نام کن و بعد همین کد را وارد کن.",
    ].join("\n"),
    {
      inline_keyboard: [
        [{ text: "👤 ورود به پروفایل و وارد کردن کد", url: `${APP_URL}/profile` }],
        [{ text: "🆕 ساخت حساب Gament", url: `${APP_URL}/register` }],
      ],
    }
  );
}

async function profileCommand(chatId: number, telegramId: string) {
  const [linked] = await db
    .select({
      telegramUsername: telegramAccounts.telegramUsername,
      linkedAt: telegramAccounts.linkedAt,
      displayName: users.displayName,
      username: users.username,
      userGamentId: users.gamentId,
      level: users.level,
      rankPoints: users.rankPoints,
      clashRoyaleUsername: users.clashRoyaleUsername,
      codMobileUsername: users.codMobileUsername,
      fortniteUsername: users.fortniteUsername,
    })
    .from(telegramAccounts)
    .leftJoin(users, eq(telegramAccounts.userId, users.id))
    .where(eq(telegramAccounts.telegramId, telegramId))
    .limit(1);

  if (linked?.userGamentId) {
    const lines = [
      "👤 <b>پروفایل Gament شما</b>",
      "",
      "✅ حساب تلگرام به حساب وب‌اپ لینک شده است.",
      `نام: <b>${html(linked.displayName || "—")}</b>`,
      `Username: <b>${html(linked.username || "—")}</b>`,
      `Gament ID: <code>${html(linked.userGamentId)}</code>`,
      `Level: <b>${linked.level}</b> | RP: <b>${linked.rankPoints}</b>`,
      linked.codMobileUsername ? `COD: <b>${html(linked.codMobileUsername)}</b>` : "",
      linked.clashRoyaleUsername ? `Clash Royale: <b>${html(linked.clashRoyaleUsername)}</b>` : "",
      linked.fortniteUsername ? `Fortnite: <b>${html(linked.fortniteUsername)}</b>` : "",
      "",
      "برای انتقال اتصال به حساب دیگر، در آن حساب وب‌اپ کد جدید /link را وارد کن.",
    ].filter(Boolean).join("\n");

    await sendMessage(chatId, lines, {
      inline_keyboard: [
        [{ text: "👤 باز کردن پروفایل در وب‌اپ", url: `${APP_URL}/profile` }],
        [{ text: "🏟 روم‌های فعال", url: `${APP_URL}/tournaments` }],
      ],
    });
    return;
  }

  const [row] = await db
    .select({
      preFullName: telegramPreRegistrations.fullName,
      preGame: telegramPreRegistrations.game,
      preGamerTag: telegramPreRegistrations.gamerTag,
      preGamentId: telegramPreRegistrations.gamentId,
      preStatus: telegramPreRegistrations.status,
      linkedUserId: telegramPreRegistrations.linkedUserId,
      displayName: users.displayName,
      username: users.username,
      userGamentId: users.gamentId,
      level: users.level,
      rankPoints: users.rankPoints,
      clashRoyaleUsername: users.clashRoyaleUsername,
      codMobileUsername: users.codMobileUsername,
      fortniteUsername: users.fortniteUsername,
    })
    .from(telegramPreRegistrations)
    .leftJoin(users, eq(telegramPreRegistrations.linkedUserId, users.id))
    .where(eq(telegramPreRegistrations.telegramId, telegramId))
    .limit(1);

  if (!row) {
    await sendMessage(
      chatId,
      "هنوز حساب تلگرام شما در Gament شناسایی نشده است. اول /register را بزن یا در وب‌اپ حساب بساز.",
      mainMenuKeyboard()
    );
    return;
  }

  const lines = [
    "👤 <b>پروفایل Gament شما</b>",
    "",
    row.linkedUserId ? "✅ حساب تلگرام به حساب وب‌اپ لینک شده است." : "⚠️ حساب وب‌اپ هنوز کامل لینک نشده؛ با Gament ID/شماره مشابه در سایت ثبت‌نام کن.",
    `نام: <b>${html(row.displayName || row.preFullName)}</b>`,
    `Username: <b>${html(row.username || "—")}</b>`,
    `Gament ID: <code>${html(row.userGamentId || row.preGamentId || "—")}</code>`,
    row.linkedUserId ? `Level: <b>${row.level}</b> | RP: <b>${row.rankPoints}</b>` : "",
    "",
    `آخرین بازی ثبت‌شده: <b>${html(gameLabel(row.preGame))}</b>`,
    `آیدی بازی: <b>${html(row.preGamerTag)}</b>`,
    `وضعیت پیش‌ثبت‌نام: <b>${html(row.preStatus)}</b>`,
    row.codMobileUsername ? `COD: <b>${html(row.codMobileUsername)}</b>` : "",
    row.clashRoyaleUsername ? `Clash Royale: <b>${html(row.clashRoyaleUsername)}</b>` : "",
    row.fortniteUsername ? `Fortnite: <b>${html(row.fortniteUsername)}</b>` : "",
  ].filter(Boolean).join("\n");

  const keyboardRows: Array<Array<Record<string, string>>> = [
    [{ text: "👤 باز کردن پروفایل در وب‌اپ", url: `${APP_URL}/profile` }],
    [{ text: "🏟 روم‌های فعال", url: `${APP_URL}/tournaments` }],
  ];
  if (CHANNEL_URL) keyboardRows.push([{ text: "📣 کانال Gament Games", url: CHANNEL_URL }]);
  await sendMessage(chatId, lines, { inline_keyboard: keyboardRows });
}

async function unregisterCommand(chatId: number, telegramId: string) {
  await db
    .update(telegramPreRegistrations)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(telegramPreRegistrations.telegramId, telegramId));
  await clearSession(telegramId);
  await sendMessage(chatId, "پیش‌ثبت‌نام تلگرامی شما لغو/آرشیو شد.", mainMenuKeyboard());
}

function getAdminIds() {
  return (process.env.TELEGRAM_ADMIN_IDS || process.env.ADMIN_IDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasAdminAccess(telegramId: string) {
  return getAdminIds().includes(telegramId);
}

async function notifyAdminsOnPreRegistration(user: TelegramUser, data: SessionData, linkedUserId: string | null) {
  const adminIds = getAdminIds();
  if (!adminIds.length) return;

  const username = user.username ? `@${user.username}` : "—";
  const text = [
    "🆕 <b>پیش‌ثبت‌نام جدید Gament</b>",
    "",
    registrationSummary(data),
    "",
    `Telegram: <code>${html(user.id)}</code> | ${html(username)}`,
    linkedUserId ? "✅ حساب وب‌اپ شناسایی/لینک شد" : "⚠️ حساب وب‌اپ هنوز لینک نشده",
  ].join("\n");

  for (const adminId of adminIds) {
    const numericId = Number(adminId);
    if (!Number.isFinite(numericId)) continue;
    await sendMessage(numericId, text, {
      inline_keyboard: [[{ text: "مشاهده پنل ادمین", url: `${APP_URL}/admin` }]],
    });
  }
}


async function notifyAdminsOnSupportTicket(telegramUser: TelegramUser, userId: string, ticketId: string, subject: string, message: string) {
  const adminIds = getAdminIds();
  if (!adminIds.length) return;
  const username = telegramUser.username ? `@${telegramUser.username}` : "—";
  const text = [
    "🎧 <b>تیکت پشتیبانی جدید از تلگرام</b>",
    "",
    `موضوع: <b>${html(subject)}</b>`,
    `Telegram: <code>${html(telegramUser.id)}</code> | ${html(username)}`,
    `User ID: <code>${html(userId)}</code>`,
    "",
    `پیام: ${html(message.slice(0, 700))}`,
  ].join("\n");
  for (const adminId of adminIds) {
    const numericId = Number(adminId);
    if (!Number.isFinite(numericId)) continue;
    await sendMessage(numericId, text, { inline_keyboard: [[{ text: "مشاهده تیکت", url: `${APP_URL}/admin/support?ticketId=${ticketId}` }]] });
  }
}

async function adminCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }
  const [total] = await db.select({ value: count() }).from(telegramPreRegistrations);
  const [newItems] = await db.select({ value: count() }).from(telegramPreRegistrations).where(eq(telegramPreRegistrations.status, "new"));
  const [walletPending] = await db.select({ value: count() }).from(transactions).where(and(inArray(transactions.type, ["deposit", "withdrawal"]), eq(transactions.status, "pending")));
  const [openDisputes] = await db.select({ value: count() }).from(disputes).where(eq(disputes.status, "open"));
  const [pendingHonors] = await db.select({ value: count() }).from(honors).where(eq(honors.status, "pending"));
  const [openSupport] = await db.select({ value: count() }).from(tickets).where(eq(tickets.status, "open"));
  const [activeTournaments] = await db.select({ value: count() }).from(tournaments).where(inArray(tournaments.status, ["registration", "in_progress"]));

  await sendMessage(
    chatId,
    [
      "🛠 <b>داشبورد ادمین Gament</b>",
      "",
      `تورنومنت‌های فعال: <b>${activeTournaments.value}</b>`,
      `کیف پول pending: <b>${walletPending.value}</b>`,
      `اعتراض‌های باز: <b>${openDisputes.value}</b>`,
      `تیکت‌های باز: <b>${openSupport.value}</b>`,
      `افتخارات pending: <b>${pendingHonors.value}</b>`,
      `پیش‌ثبت‌نام تلگرام: <b>${total.value}</b> | جدید: <b>${newItems.value}</b>`,
      "",
      "/players — آخرین پیش‌ثبت‌نام‌ها",
      "/pending_wallets — شارژ/برداشت‌های در انتظار",
      "/pending_disputes — اعتراض‌های باز",
      "/pending_support — تیکت‌های باز پشتیبانی",
      "/pending_honors — محتوای تالار افتخارات در انتظار",
      "/honor_stats — آمار بازدید و لایک خبرها",
      "/manage — مدیریت سریع تورنومنت‌ها",
      "/announce متن — ارسال اطلاعیه به کاربران ربات",
      "/post_latest — انتشار آخرین تورنومنت فعال در کانال",
      "/deep_links — لینک‌های آماده برای کانال/کمپین",
    ].join("\n"),
    {
      inline_keyboard: [
        [{ text: "💳 کیف پول‌ها", callback_data: "admin:wallets" }, { text: "🚨 اعتراض‌ها", callback_data: "admin:disputes" }],
        [{ text: "🎧 پشتیبانی", callback_data: "admin:support" }],
        [{ text: "🏛 افتخارات", callback_data: "admin:honors" }, { text: "📊 آمار خبرها", callback_data: "admin:honor_stats" }],
        [{ text: "🧩 تورنومنت‌ها", callback_data: "admin:tournaments" }],
        [{ text: "ورود به پنل ادمین", url: `${APP_URL}/admin` }],
      ],
    }
  );
}

async function pendingWalletsCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }

  const rows = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      status: transactions.status,
      createdAt: transactions.createdAt,
      displayName: users.displayName,
      username: users.username,
      phoneNumber: users.phoneNumber,
    })
    .from(transactions)
    .innerJoin(wallets, eq(transactions.walletId, wallets.id))
    .leftJoin(users, eq(wallets.userId, users.id))
    .where(and(inArray(transactions.type, ["deposit", "withdrawal"]), eq(transactions.status, "pending")))
    .orderBy(desc(transactions.createdAt))
    .limit(10);

  if (!rows.length) {
    await sendMessage(chatId, "✅ درخواست pending کیف پول وجود ندارد.", { inline_keyboard: [[{ text: "پنل کیف پول", url: `${APP_URL}/admin/wallets` }]] });
    return;
  }

  const text = [
    "💳 <b>درخواست‌های pending کیف پول</b>",
    "",
    ...rows.map((row, index) => {
      const type = row.type === "deposit" ? "شارژ" : "برداشت";
      return `${index + 1}) <b>${type}</b> — <b>${html(formatTomanFromRial(bigIntFromText(row.amount)))}</b>\n👤 ${html(row.displayName || "—")} ${row.username ? `(@${html(row.username)})` : ""}\n📞 ${html(row.phoneNumber || "—")} | ${new Date(row.createdAt).toLocaleString("fa-IR")}`;
    }),
  ].join("\n\n");

  await sendMessage(chatId, text, { inline_keyboard: [[{ text: "بررسی در پنل کیف پول", url: `${APP_URL}/admin/wallets` }]] });
}



async function pendingSupportCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const rows = await db
    .select({ id: tickets.id, subject: tickets.subject, status: tickets.status, createdAt: tickets.createdAt, displayName: users.displayName, username: users.username, phoneNumber: users.phoneNumber })
    .from(tickets)
    .leftJoin(users, eq(tickets.userId, users.id))
    .where(eq(tickets.status, "open"))
    .orderBy(desc(tickets.createdAt))
    .limit(10);

  if (!rows.length) return sendMessage(chatId, "✅ تیکت باز وجود ندارد.", { inline_keyboard: [[{ text: "پنل پشتیبانی", url: `${APP_URL}/admin/support` }]] });
  const text = [
    "🎧 <b>تیکت‌های باز پشتیبانی</b>",
    "",
    ...rows.map((row, i) => `${i + 1}) <b>${html(row.subject)}</b>\n👤 ${html(row.displayName || row.username || "—")} | 📞 ${html(row.phoneNumber || "—")}\n⏱ ${new Date(row.createdAt).toLocaleString("fa-IR")}`),
  ].join("\n\n");
  await sendMessage(chatId, text, {
    inline_keyboard: [
      ...rows.slice(0, 5).map((row, i) => [{ text: `مشاهده تیکت ${i + 1}`, url: `${APP_URL}/admin/support?ticketId=${row.id}` }]),
      [{ text: "پنل پشتیبانی", url: `${APP_URL}/admin/support` }],
    ],
  });
}

async function myTicketsCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "برای مشاهده تیکت‌ها، اول حساب را با /link وصل کن.", { inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]] });
  const rows = await db.select().from(tickets).where(eq(tickets.userId, linked.userId)).orderBy(desc(tickets.createdAt)).limit(8);
  if (!rows.length) return sendMessage(chatId, "هنوز تیکتی ثبت نکرده‌ای. برای ساخت تیکت /support را بزن.");
  await sendMessage(chatId, [
    "🎧 <b>تیکت‌های من</b>",
    "",
    ...rows.map((row, i) => `${i + 1}) <b>${html(row.subject)}</b> — ${html(row.status || "open")}\n${new Date(row.createdAt).toLocaleString("fa-IR")}`),
  ].join("\n\n"), { inline_keyboard: [[{ text: "مرکز پشتیبانی", url: `${APP_URL}/support` }]] });
}

async function pendingDisputesCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const rows = await db
    .select({
      id: disputes.id,
      reason: disputes.reason,
      status: disputes.status,
      createdAt: disputes.createdAt,
      matchId: matches.id,
      round: matches.round,
      matchNumber: matches.matchNumber,
      tournamentId: tournaments.id,
      tournamentName: tournaments.name,
      playerName: players.displayName,
      playerUsername: players.username,
    })
    .from(disputes)
    .innerJoin(matches, eq(disputes.matchId, matches.id))
    .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
    .leftJoin(players, eq(disputes.raisedById, players.id))
    .where(eq(disputes.status, "open"))
    .orderBy(desc(disputes.createdAt))
    .limit(10);

  if (!rows.length) return sendMessage(chatId, "✅ اعتراض باز وجود ندارد.", { inline_keyboard: [[{ text: "پنل اعتراض‌ها", url: `${APP_URL}/admin/disputes` }]] });
  const text = [
    "🚨 <b>اعتراض‌های باز</b>",
    "",
    ...rows.map((row, i) => `${i + 1}) <b>${html(row.tournamentName || "تورنومنت")}</b> | R${row.round}-${row.matchNumber}\n👤 ${html(row.playerName || row.playerUsername || "بازیکن")}\n📝 ${html(row.reason.slice(0, 160))}\n⏱ ${new Date(row.createdAt).toLocaleString("fa-IR")}`),
  ].join("\n\n");
  await sendMessage(chatId, text, {
    inline_keyboard: [
      ...rows.slice(0, 5).map((row, i) => [{ text: `مشاهده اعتراض ${i + 1}`, url: `${APP_URL}/admin/disputes?matchId=${row.matchId}` }]),
      [{ text: "پنل اعتراض‌ها", url: `${APP_URL}/admin/disputes` }],
    ],
  });
}

async function honorStatsCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");

  const topViews = await db
    .select({ title: honors.title, id: honors.id, count: sql<number>`count(${honorViews.id})::int` })
    .from(honorViews)
    .innerJoin(honors, eq(honorViews.honorId, honors.id))
    .where(eq(honors.status, "approved"))
    .groupBy(honors.id, honors.title)
    .orderBy(desc(sql`count(${honorViews.id})`))
    .limit(5);
  const topLikes = await db
    .select({ title: honors.title, id: honors.id, count: sql<number>`count(${honorLikes.id})::int` })
    .from(honorLikes)
    .innerJoin(honors, eq(honorLikes.honorId, honors.id))
    .where(eq(honors.status, "approved"))
    .groupBy(honors.id, honors.title)
    .orderBy(desc(sql`count(${honorLikes.id})`))
    .limit(5);

  const views = topViews.length ? topViews.map((row, i) => `${i + 1}) <b>${html(row.title)}</b> — ${Number(row.count).toLocaleString("fa-IR")} سین`).join("\n") : "داده‌ای ثبت نشده.";
  const likes = topLikes.length ? topLikes.map((row, i) => `${i + 1}) <b>${html(row.title)}</b> — ${Number(row.count).toLocaleString("fa-IR")} لایک`).join("\n") : "داده‌ای ثبت نشده.";
  await sendMessage(chatId, ["🏛 <b>آمار تالار افتخارات</b>", "", "👁 پربازدیدترین‌ها", views, "", "♥️ محبوب‌ترین‌ها", likes].join("\n"), {
    inline_keyboard: [[{ text: "پنل تالار افتخارات", url: `${APP_URL}/admin/honors` }]],
  });
}

async function pendingHonorsCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const rows = await db.select().from(honors).where(eq(honors.status, "pending")).orderBy(desc(honors.createdAt)).limit(10);
  if (!rows.length) return sendMessage(chatId, "✅ محتوای pending تالار افتخارات وجود ندارد.", { inline_keyboard: [[{ text: "پنل تالار افتخارات", url: `${APP_URL}/admin/honors` }]] });
  const text = [
    "🏛 <b>تالار افتخارات — در انتظار بررسی</b>",
    "",
    ...rows.map((row, i) => `${i + 1}) <b>${html(row.title)}</b>\nنوع: <b>${html(row.type)}</b> | بازی: <b>${html(row.game || "عمومی")}</b>\n${html(row.description.slice(0, 180))}`),
  ].join("\n\n");
  await sendMessage(chatId, text, {
    inline_keyboard: [
      ...rows.slice(0, 5).map((row, i) => ([
        { text: `✅ تأیید ${i + 1}`, callback_data: `honor:approve:${row.id}` },
        { text: `❌ رد ${i + 1}`, callback_data: `honor:reject:${row.id}` },
      ])),
      [{ text: "پنل تالار افتخارات", url: `${APP_URL}/admin/honors` }],
    ],
  });
}

async function reviewHonorFromTelegram(chatId: number, telegramId: string, honorId: string, decision: "approve" | "reject") {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const status = decision === "approve" ? "approved" : "rejected";
  const [updated] = await db.update(honors).set({ status, publishedAt: status === "approved" ? new Date() : null, updatedAt: new Date() }).where(eq(honors.id, honorId)).returning();
  if (!updated) return sendMessage(chatId, "محتوا پیدا نشد.");
  if (status === "approved") {
    await publishHonorToTelegramChannel({ id: updated.id, title: updated.title, description: updated.description, type: updated.type, game: updated.game, imageUrl: updated.imageUrl, highlight: updated.highlight }).catch(() => undefined);
  }
  await sendMessage(chatId, status === "approved" ? `✅ منتشر شد: <b>${html(updated.title)}</b>` : `❌ رد شد: <b>${html(updated.title)}</b>`, { inline_keyboard: [[{ text: "پنل تالار افتخارات", url: `${APP_URL}/admin/honors` }]] });
}

async function playersCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }

  const rows = await db
    .select({
      fullName: telegramPreRegistrations.fullName,
      game: telegramPreRegistrations.game,
      gamerTag: telegramPreRegistrations.gamerTag,
      gamentId: telegramPreRegistrations.gamentId,
      telegramUsername: telegramPreRegistrations.telegramUsername,
      status: telegramPreRegistrations.status,
      updatedAt: telegramPreRegistrations.updatedAt,
    })
    .from(telegramPreRegistrations)
    .orderBy(desc(telegramPreRegistrations.updatedAt))
    .limit(12);

  if (!rows.length) {
    await sendMessage(chatId, "هنوز پیش‌ثبت‌نامی ثبت نشده است.");
    return;
  }

  const text = [
    "👥 <b>آخرین پیش‌ثبت‌نام‌های تلگرام</b>",
    "",
    ...rows.map((row, index) => {
      const username = row.telegramUsername ? `@${row.telegramUsername}` : "—";
      return `${index + 1}) <b>${html(row.fullName)}</b> | ${html(gameLabel(row.game))}\n🏷 ${html(row.gamerTag)} | 🆔 ${html(row.gamentId || "—")} | ${html(username)} | ${html(row.status)}`;
    }),
  ].join("\n\n");

  await sendMessage(chatId, text, { inline_keyboard: [[{ text: "پنل کامل", url: `${APP_URL}/admin` }]] });
}

async function announceCommand(chatId: number, telegramId: string, text: string, gameFilter?: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }

  const message = text.trim();
  if (!message) {
    await sendMessage(chatId, "متن اطلاعیه را وارد کن. مثال:\n<code>/announce امشب روم کلش ساعت ۹ فعال است.</code>");
    return;
  }

  const normalizedGame = gameFilter ? normalizeGame(gameFilter) : "";
  const rows = await db
    .select({ telegramId: telegramPreRegistrations.telegramId, status: telegramPreRegistrations.status, game: telegramPreRegistrations.game })
    .from(telegramPreRegistrations)
    .orderBy(desc(telegramPreRegistrations.updatedAt))
    .limit(500);

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.status === "archived") {
      skipped += 1;
      continue;
    }
    if (normalizedGame && normalizeGame(row.game) !== normalizedGame) {
      skipped += 1;
      continue;
    }
    const numericId = Number(row.telegramId);
    if (!Number.isFinite(numericId)) {
      failed += 1;
      continue;
    }
    try {
      await sendMessage(numericId, `📢 <b>اطلاعیه Gament</b>\n\n${html(message)}`, mainMenuKeyboard());
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  await sendMessage(chatId, `ارسال اطلاعیه تمام شد.\n✅ موفق: ${sent}\n⏭ ردشده: ${skipped}\n❌ ناموفق: ${failed}`);
}

async function postLatestTournamentCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }

  const [latest] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.status, "registration"))
    .orderBy(desc(tournaments.createdAt))
    .limit(1);

  if (!latest) {
    await sendMessage(chatId, "تورنومنت فعالی برای انتشار در کانال پیدا نشد.");
    return;
  }

  const result = await publishTournamentToTelegramChannel(latest);
  if (result.ok) {
    await sendMessage(chatId, `✅ آخرین تورنومنت در کانال منتشر شد:\n<b>${html(latest.name)}</b>`);
  } else {
    await sendMessage(chatId, `❌ انتشار در کانال انجام نشد.\n${html(result.description || "خطای نامشخص")}`);
  }
}

async function myTournamentsCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای مشاهده تورنومنت‌های خودت، اول حساب را با /link وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
    });
    return;
  }
  const rows = await db
    .select({
      registrationId: registrations.id,
      checkedInAt: registrations.checkedInAt,
      tournamentId: tournaments.id,
      name: tournaments.name,
      game: tournaments.game,
      status: tournaments.status,
      entryFee: tournaments.entryFee,
      startDate: tournaments.startDate,
      roomId: tournaments.roomId,
      roomVisibleAt: tournaments.roomVisibleAt,
    })
    .from(registrations)
    .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
    .where(eq(registrations.visibleUserId, linked.userId))
    .orderBy(desc(registrations.registeredAt))
    .limit(10);

  if (!rows.length) {
    await sendMessage(chatId, "هنوز در تورنومنتی ثبت‌نام نکرده‌ای.", {
      inline_keyboard: [[{ text: "🏟 مشاهده روم‌ها", callback_data: "menu:rooms" }]],
    });
    return;
  }

  const text = [
    "🎮 <b>تورنومنت‌های من</b>",
    "",
    ...rows.map((row, index) => `${index + 1}) <b>${html(row.name)}</b>\n🎮 ${html(gameLabel(row.game))} | وضعیت: <b>${html(row.status)}</b> | چک‌این: ${row.checkedInAt ? "✅" : "⬜"}`),
  ].join("\n\n");
  const keyboard = rows.flatMap((row) => {
    const result: Array<Array<Record<string, string>>> = [
      [{ text: `جزئیات: ${row.name.slice(0, 28)}`, url: `${APP_URL}/tournaments/${row.tournamentId}` }],
      [
        { text: "✅ چک‌این", callback_data: `checkin:${row.registrationId}` },
        { text: "🏟 لابی", callback_data: `mylobby:${row.tournamentId}` },
        { text: "لغو", callback_data: `cancelreg:${row.registrationId}` },
      ],
    ];
    if (row.game === "clash_royale" && !isFreeEntryFee(row.entryFee)) {
      result.push([{ text: "⚔️ 1V1 کلش رویال", callback_data: `qr:${row.tournamentId}` }]);
    }
    return result;
  });
  await sendMessage(chatId, text, { inline_keyboard: keyboard });
}

async function showMyLobby(chatId: number, telegramId: string, tournamentId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "حساب لینک نیست.");
  const [row] = await db
    .select({ roomId: tournaments.roomId, roomPassword: tournaments.roomPassword, lobbyNotes: tournaments.lobbyNotes, roomVisibleAt: tournaments.roomVisibleAt, name: tournaments.name })
    .from(registrations)
    .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
    .where(and(eq(registrations.visibleUserId, linked.userId), eq(tournaments.id, tournamentId)))
    .limit(1);
  if (!row) return sendMessage(chatId, "شما در این تورنومنت ثبت‌نام نکرده‌اید.");
  if (!row.roomId || (row.roomVisibleAt && new Date(row.roomVisibleAt) > new Date())) {
    return sendMessage(chatId, "اطلاعات لابی هنوز منتشر نشده است.");
  }
  await sendMessage(chatId, `🏟 <b>لابی ${html(row.name)}</b>\n\nRoom ID: <code>${html(row.roomId)}</code>\nPassword: <code>${html(row.roomPassword || "بدون رمز")}</code>\n\n${html(row.lobbyNotes || "به‌موقع وارد شوید.")}`);
}

async function cancelRegistrationCommand(chatId: number, telegramId: string, registrationId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "حساب لینک نیست.");
  const [row] = await db
    .select({ registrationId: registrations.id, tournamentId: tournaments.id, tournamentName: tournaments.name, status: tournaments.status })
    .from(registrations)
    .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
    .where(and(eq(registrations.id, registrationId), eq(registrations.visibleUserId, linked.userId)))
    .limit(1);
  if (!row) return sendMessage(chatId, "ثبت‌نام پیدا نشد.");
  if (row.status === "in_progress" || row.status === "completed") return sendMessage(chatId, "بعد از شروع/پایان تورنومنت امکان لغو از ربات نیست.");

  const refundText = await db.transaction(async (tx) => {
    await tx.delete(registrations).where(eq(registrations.id, registrationId));
    const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, linked.userId)).limit(1);
    if (!wallet) return "";
    const [entry] = await tx
      .select({ id: transactions.id, amount: transactions.amount })
      .from(transactions)
      .where(sql`${transactions.type} = 'entry_fee' AND ${transactions.status} = 'completed' AND ${transactions.metadata}->>'tournamentId' = ${row.tournamentId} AND ${transactions.metadata}->>'userId' = ${linked.userId}`)
      .limit(1);
    if (!entry) return "";
    const [existingRefund] = await tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.referenceId, `telegram-cancel-refund-${entry.id}`)).limit(1);
    if (existingRefund) return "";
    const amount = bigIntFromText(entry.amount);
    if (amount <= BigInt(0)) return "";
        await tx.update(wallets).set({ balance: sql`${wallets.balance} + ${amount.toString()}`, updatedAt: new Date() }).where(eq(wallets.id, wallet.id));
    await tx.insert(transactions).values({
      walletId: wallet.id,
      amount: amount.toString(),
      type: "refund",
      status: "completed",
      referenceId: `telegram-cancel-refund-${entry.id}`,
      metadata: { kind: "telegram_cancel_refund", tournamentId: row.tournamentId, userId: linked.userId, originalTransactionId: entry.id },
    });
    return `\n💳 مبلغ ${html(formatTomanFromRial(amount))} به کیف پول برگشت.`;
  });

  await sendMessage(chatId, `✅ ثبت‌نام شما در <b>${html(row.tournamentName)}</b> لغو شد.${refundText}`);
  await notifyWaitlistSpot(row.tournamentId).catch(() => undefined);
}

async function walletCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای مشاهده کیف پول، اول حساب تلگرامت را با /link به Gament وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
    });
    return;
  }
  const wallet = await getOrCreateWallet(linked.userId);
  const balance = bigIntFromText(wallet.balance);
  const txRows = await db.select().from(transactions).where(eq(transactions.walletId, wallet.id)).orderBy(desc(transactions.createdAt)).limit(5);
  const recent = txRows.length
    ? txRows.map((tx) => `• ${html(tx.type)}: <b>${html(formatTomanFromRial(bigIntFromText(tx.amount)))}</b> — ${html(tx.status)}`).join("\n")
    : "هنوز تراکنشی ندارید.";
  await sendMessage(chatId, `💳 <b>کیف پول Gament</b>\n\nموجودی: <b>${html(formatTomanFromRial(balance))}</b>\n\nآخرین تراکنش‌ها:\n${recent}`, {
    inline_keyboard: [[{ text: "شارژ کیف پول", url: `${APP_URL}/wallet` }], [{ text: "تراکنش‌ها", url: `${APP_URL}/wallet` }]],
  });
}

async function achievementsCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای مشاهده دستاوردها، اول حساب را با /link وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
    });
    return;
  }
  const progress = await achievementProgressForUser(linked.userId);
  type AchievementProgressItem = Awaited<ReturnType<typeof achievementProgressForUser>>[number];
  const unlocked = progress.filter((item: AchievementProgressItem) => item.unlocked).slice(0, 8);
  const locked = progress.filter((item: AchievementProgressItem) => !item.unlocked).slice(0, 5);
  const text = [
    "🏅 <b>دستاوردهای Gament</b>",
    "",
    unlocked.length ? "✅ بازشده:" : "هنوز دستاوردی باز نشده.",
    ...unlocked.map((item: AchievementProgressItem) => `${item.icon} <b>${html(item.nameFA)}</b> — +${item.points} XP`),
    "",
    locked.length ? "⬜ بعدی‌ها:" : "",
    ...locked.map((item: AchievementProgressItem) => `${item.icon} ${html(item.nameFA)} — ${item.progress}/${item.requirement}`),
  ].filter(Boolean).join("\n");
  await sendMessage(chatId, text, { inline_keyboard: [[{ text: "مشاهده در وب‌اپ", url: `${APP_URL}/achievements` }]] });
}

async function supportStartCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای ثبت تیکت پشتیبانی، اول حساب تلگرامت را با /link به Gament وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
    });
    return;
  }
  await setSession(telegramId, "support_subject", {});
  await sendMessage(chatId, "🎧 موضوع تیکت پشتیبانی را بنویس:", replyKeyboard([[CANCEL_TEXT]]));
}

async function userMatchRows(telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return { linked: null, rows: [] as Array<{ id: string; status: string; round: number; matchNumber: number; tournamentName: string | null; playerId: string | null }> };
  const myPlayers = await db.select({ id: players.id }).from(players).where(eq(players.visibleUserId, linked.userId));
  const playerIds = myPlayers.map((p) => p.id);
  if (!playerIds.length) return { linked, rows: [] };
  const rows = await db
    .select({
      id: matches.id,
      status: matches.status,
      round: matches.round,
      matchNumber: matches.matchNumber,
      tournamentName: tournaments.name,
      player1Id: matches.player1Id,
      player2Id: matches.player2Id,
    })
    .from(matches)
    .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
    .where(or(inArray(matches.player1Id, playerIds), inArray(matches.player2Id, playerIds)))
    .orderBy(desc(matches.createdAt))
    .limit(10);
  return { linked, rows: rows.map((row) => ({ ...row, playerId: playerIds.includes(row.player1Id || "") ? row.player1Id : row.player2Id })) };
}

async function matchesCommand(chatId: number, telegramId: string) {
  const { linked, rows } = await userMatchRows(telegramId);
  if (!linked) {
    await sendMessage(chatId, "برای مشاهده مسابقات، اول حساب تلگرامت را با /link وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
    });
    return;
  }
  if (!rows.length) {
    await sendMessage(chatId, "فعلاً مسابقه‌ای برای حساب شما پیدا نشد.", mainMenuKeyboard());
    return;
  }
  const keyboard = rows.slice(0, 6).flatMap((match, index) => [
    [{ text: `${index + 1}) ${match.tournamentName || "مسابقه"} | R${match.round}-${match.matchNumber}`, callback_data: `match:${match.id}` }],
  ]);
  await sendMessage(chatId, "⚔️ مسابقات اخیر شما؛ یکی را انتخاب کن:", { inline_keyboard: keyboard });
}

async function handleMatchAction(chatId: number, telegramId: string, matchId: string) {
  const { linked, rows } = await userMatchRows(telegramId);
  const match = rows.find((row) => row.id === matchId);
  if (!linked || !match) {
    await sendMessage(chatId, "این مسابقه برای حساب شما پیدا نشد.");
    return;
  }
  await sendMessage(chatId, `⚔️ <b>${html(match.tournamentName || "مسابقه")}</b>\nوضعیت: <b>${html(match.status)}</b>\n\nنتیجه یا عملیات را انتخاب کن:`, {
    inline_keyboard: [
      [{ text: "✅ بردم", callback_data: `result:win:${matchId}` }, { text: "❌ باختم", callback_data: `result:lose:${matchId}` }],
      [{ text: "📎 ارسال اسکرین‌شات", callback_data: `evidence:${matchId}` }],
      [{ text: "🚨 اعتراض دارم", callback_data: `dispute:${matchId}` }],
    ],
  });
}

async function submitTelegramResult(chatId: number, telegramId: string, matchId: string, action: "win" | "lose") {
  const { linked, rows } = await userMatchRows(telegramId);
  const match = rows.find((row) => row.id === matchId);
  if (!linked || !match) {
    await sendMessage(chatId, "این مسابقه برای حساب شما پیدا نشد.");
    return;
  }
  await db
    .update(matches)
    .set({
      status: "awaiting_judgment",
      evidence: {
        source: "telegram",
        reporterTelegramId: telegramId,
        reporterUserId: linked.userId,
        reporterClaim: action,
        reportedAt: new Date().toISOString(),
      },
    })
    .where(eq(matches.id, matchId));
  await sendMessage(chatId, action === "win" ? "✅ نتیجه شما ثبت شد و برای داوری ارسال شد." : "✅ گزارش باخت ثبت شد. ممنون از اعلام نتیجه.");
}

async function startDispute(chatId: number, telegramId: string, matchId: string) {
  await setSession(telegramId, "dispute_reason", { disputeMatchId: matchId });
  await sendMessage(chatId, "🚨 دلیل اعتراض را بنویس. اگر مدرک داری، توضیح بده کجا قابل بررسی است:", replyKeyboard([[CANCEL_TEXT]]));
}

async function startEvidenceUpload(chatId: number, telegramId: string, matchId: string) {
  await setSession(telegramId, "evidence_upload", { evidenceMatchId: matchId });
  await sendMessage(chatId, "📎 لطفاً اسکرین‌شات نتیجه را به‌صورت عکس ارسال کن. کپشن اختیاری است.", replyKeyboard([[CANCEL_TEXT]]));
}

async function aiCommand(chatId: number, prompt: string, telegramId: string) {
  const query = prompt.trim();
  if (!query) {
    await sendMessage(chatId, "سؤال را بعد از دستور بنویس. مثال:\n<code>/ai بهترین دک کلش رویال برای شروع تورنومنت چیه؟</code>");
    return;
  }
  const linked = await getLinkedUserByTelegram(telegramId);
  await sendMessage(chatId, "🤖 در حال فکر کردن...");
  const response = await generateRealAssistantResponse(query, { lang: "fa", userName: linked?.displayName || undefined });
  await sendMessage(chatId, `🤖 <b>دستیار Gament</b>\n\n${html(response.response)}\n\n<code>${response.provider}</code>`);
}

async function inviteCommand(chatId: number, telegramId: string) {
  const username = process.env.TELEGRAM_BOT_USERNAME || "FlexaTournamentBot";
  const link = `https://t.me/${username}?start=ref_${telegramId}`;
  const [{ value }] = await db.select({ value: count() }).from(telegramReferrals).where(eq(telegramReferrals.referrerTelegramId, telegramId));
  await sendMessage(chatId, `🎁 <b>لینک دعوت اختصاصی شما</b>\n\n${html(link)}\n\nدعوت‌های ثبت‌شده: <b>${value}</b>\n\nاین لینک را برای دوستات بفرست؛ در فاز جایزه، دعوت‌های معتبر امتیاز می‌گیرند.`, {
    inline_keyboard: [[{ text: "اشتراک‌گذاری", url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("به Gament بپیوند و توی تورنومنت‌های گیمینگ شرکت کن!")}` }]],
  });
}


type ClashPairParticipant = {
  registrationId: string;
  playerId: string;
  userId: string;
  playerName: string | null;
  playerUsername: string | null;
  playerGameId: string | null;
  telegramId: string;
  inviteLink: string | null;
  qrFileId: string | null;
  clashRoyaleId: string | null;
  clashRoyaleUsername: string | null;
};

type CreatedClashPair = {
  matchId: string;
  matchNumber: number;
  tournamentId: string;
  tournamentName: string;
  tournamentStartDate: Date | null;
  player1: ClashPairParticipant;
  player2: ClashPairParticipant;
};

function clashParticipantDisplayName(player: ClashPairParticipant) {
  return player.playerName || player.playerUsername || player.clashRoyaleUsername || "Gament Player";
}

function clashParticipantTag(player: ClashPairParticipant) {
  return player.clashRoyaleId || player.playerGameId || player.clashRoyaleUsername || "ثبت نشده";
}

function clashQrPromptText(tournamentName: string, existing = false) {
  return [
    `⚔️ <b>${existing ? "به‌روزرسانی" : "شروع"} 1V1 کلش رویال</b>`,
    "",
    `تورنومنت: <b>${html(tournamentName)}</b>`,
    "",
    "از داخل Clash Royale مسیر زیر را برو:",
    "<code>Social → Add Friends → QR / Share Link</code>",
    "",
    "حالا یکی از این دو مورد را همین‌جا بفرست:",
    "1) عکس QR Code",
    "2) Share Link دعوت / Add Friend",
    "",
    "بات تلاش می‌کند QR را بخواند؛ اگر QR خوانده نشد، همان عکس QR برای حریف ارسال می‌شود. برای بهترین نتیجه، اگر لینک داری آن را هم به‌صورت متن یا کپشن بفرست.",
  ].join("\n");
}

async function getOrCreateClash1v1Tournament() {
  const [existing] = await db
    .select()
    .from(tournaments)
    .where(and(
      eq(tournaments.game, CLASH_1V1_CONFIG.game),
      eq(tournaments.status, "registration"),
      or(eq(tournaments.categoryLabel, CLASH_1V1_CONFIG.categoryLabel), eq(tournaments.name, CLASH_1V1_CONFIG.name))
    ))
    .orderBy(desc(tournaments.createdAt))
    .limit(1);

  const values = {
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
    prize2nd: null,
    prize3rd: null,
    prize4to10: null,
    rules: CLASH_1V1_CONFIG.rules,
    roomId: null,
    roomPassword: null,
    lobbyNotes: CLASH_1V1_CONFIG.lobbyNotes,
    roomVisibleAt: null,
    updatedAt: new Date(),
  };

  if (existing) {
    const [updated] = await db
      .update(tournaments)
      .set(values)
      .where(eq(tournaments.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(tournaments)
    .values({ ...values, createdAt: new Date() })
    .returning();
  return created;
}

async function startClash1v1(chatId: number, telegramId: string) {
  const tournament = await getOrCreateClash1v1Tournament();
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(
      chatId,
      "⚔️ <b>1V1 کلش رویال</b>\n\nبرای ثبت‌نام واقعی و پرداخت ورودی، اول حساب تلگرام را به حساب Gament وصل کن.",
      {
        inline_keyboard: [
          [{ text: "🔗 اتصال حساب", callback_data: "menu:link" }],
          [{ text: "🆕 ساخت حساب", url: `${APP_URL}/register` }],
        ],
      }
    );
    return;
  }

  const [existingRegistration] = await db
    .select({ id: registrations.id, submittedAt: registrations.gameInviteSubmittedAt })
    .from(registrations)
    .where(and(eq(registrations.tournamentId, tournament.id), eq(registrations.visibleUserId, linked.userId)))
    .limit(1);

  if (existingRegistration) {
    await startClashQrSubmission(chatId, telegramId, tournament.id, existingRegistration.id);
    return;
  }

  await sendMessage(
    chatId,
    [
      "⚔️ <b>1V1 کلش رویال</b>",
      "",
      `💳 ورودی هر نفر: <b>${html(CLASH_1V1_CONFIG.entryFee)}</b>`,
      `🏆 جایزه نفر اول: <b>${html(CLASH_1V1_CONFIG.prize1st)}</b>`,
      "",
      "این حالت Room ID / Password ندارد؛ بعد از پرداخت، QR یا Share Link کلش رویال را می‌فرستی و بات به‌صورت خودکار یک حریف واقعی بهت معرفی می‌کند.",
    ].join("\n"),
    {
      inline_keyboard: [
        [{ text: "✅ ثبت‌نام و کسر ۵۰,۰۰۰ تومان", callback_data: `join:${tournament.id}` }],
        [{ text: "💳 شارژ کیف پول", url: `${APP_URL}/wallet` }],
        [{ text: "جزئیات در Gament", url: `${APP_URL}/tournaments/${tournament.id}` }],
      ],
    }
  );
}

async function startClashQrSubmission(chatId: number, telegramId: string, tournamentId?: string, registrationId?: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای شروع 1V1 کلش رویال، اول حساب تلگرام را با /link به Gament وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
    });
    return;
  }

  const conditions = [
    eq(registrations.visibleUserId, linked.userId),
    eq(tournaments.game, "clash_royale"),
    inArray(tournaments.status, ["registration", "in_progress"]),
  ];
  if (tournamentId) conditions.push(eq(tournaments.id, tournamentId));
  if (registrationId) conditions.push(eq(registrations.id, registrationId));

  const rows = await db
    .select({
      registrationId: registrations.id,
      tournamentId: tournaments.id,
      tournamentName: tournaments.name,
      tournamentStatus: tournaments.status,
      entryFee: tournaments.entryFee,
      submittedAt: registrations.gameInviteSubmittedAt,
    })
    .from(registrations)
    .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
    .where(and(...conditions))
    .orderBy(desc(registrations.registeredAt))
    .limit(8);

  const eligible = rows.filter((row) => !isFreeEntryFee(row.entryFee));
  if (!eligible.length) {
    const activeClashRooms = await db
      .select({
        id: tournaments.id,
        name: tournaments.name,
        entryFee: tournaments.entryFee,
        maxPlayers: tournaments.maxPlayers,
        registeredCount: count(registrations.id),
      })
      .from(tournaments)
      .leftJoin(registrations, eq(registrations.tournamentId, tournaments.id))
      .where(and(eq(tournaments.game, "clash_royale"), eq(tournaments.status, "registration")))
      .groupBy(tournaments.id)
      .orderBy(desc(tournaments.createdAt))
      .limit(6);

    const paidRooms = activeClashRooms.filter((room) => !isFreeEntryFee(room.entryFee));
    const keyboard: Array<Array<Record<string, string>>> = paidRooms.flatMap((room) => {
      const title = room.name.slice(0, 32);
      const isFull = Number(room.registeredCount || 0) >= Number(room.maxPlayers || 0);
      return [
        [{ text: isFull ? `ظرفیت تکمیل: ${title}` : `ثبت‌نام 1V1: ${title}`, callback_data: `join:${room.id}` }],
        [{ text: `جزئیات: ${title}`, url: `${APP_URL}/tournaments/${room.id}` }],
      ];
    });
    keyboard.push([{ text: "🏟 همه روم‌های کلش", url: `${APP_URL}/tournaments?game=clash_royale` }]);

    await sendMessage(
      chatId,
      "⚔️ <b>1V1 کلش رویال</b>\n\nبرای واقعی شدن مچ‌میکینگ، اول باید در یک تورنومنت <b>پولی کلش رویال</b> ثبت‌نام کرده باشی و ورودی پرداخت شده باشد.\n\nبعد از ثبت‌نام، همین دکمه را بزن یا دستور /qr را بفرست تا QR/Share Link را بگیرم و حریف را اتوماتیک وصل کنم.",
      { inline_keyboard: keyboard }
    );
    return;
  }

  if (!tournamentId && !registrationId && eligible.length > 1) {
    await sendMessage(chatId, "برای کدام تورنومنت، 1V1 کلش رویال را شروع می‌کنی؟", {
      inline_keyboard: eligible.map((row) => [{ text: `${row.submittedAt ? "🔁" : "📲"} ${row.tournamentName.slice(0, 42)}`, callback_data: `qr:${row.tournamentId}` }]),
    });
    return;
  }

  const row = eligible[0];
  await setSession(telegramId, "clash_qr_submission", {
    qrTournamentId: row.tournamentId,
    qrRegistrationId: row.registrationId,
  });
  await sendMessage(chatId, clashQrPromptText(row.tournamentName, Boolean(row.submittedAt)), replyKeyboard([[CANCEL_TEXT]]));
}

async function tryAutoPairClashTournament(tournamentId: string): Promise<CreatedClashPair[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM tournaments WHERE id = ${tournamentId} FOR UPDATE`);

    const [tournament] = await tx
      .select({ id: tournaments.id, name: tournaments.name, game: tournaments.game, status: tournaments.status, startDate: tournaments.startDate })
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .limit(1);

    if (!tournament || tournament.game !== "clash_royale" || !["registration", "in_progress"].includes(tournament.status)) {
      return [];
    }

    const existingMatches = await tx
      .select({ player1Id: matches.player1Id, player2Id: matches.player2Id })
      .from(matches)
      .where(eq(matches.tournamentId, tournamentId));

    const busyPlayerIds = new Set<string>();
    for (const match of existingMatches) {
      if (match.player1Id) busyPlayerIds.add(match.player1Id);
      if (match.player2Id) busyPlayerIds.add(match.player2Id);
    }

    const queued = await tx
      .select({
        registrationId: registrations.id,
        playerId: registrations.playerId,
        userId: registrations.visibleUserId,
        inviteLink: registrations.gameInviteLink,
        qrFileId: registrations.gameInviteQrFileId,
        playerName: players.displayName,
        playerUsername: players.username,
        playerGameId: players.gameId,
        telegramId: telegramAccounts.telegramId,
        clashRoyaleId: users.clashRoyaleId,
        clashRoyaleUsername: users.clashRoyaleUsername,
        submittedAt: registrations.gameInviteSubmittedAt,
      })
      .from(registrations)
      .innerJoin(players, eq(registrations.playerId, players.id))
      .innerJoin(telegramAccounts, eq(registrations.visibleUserId, telegramAccounts.userId))
      .leftJoin(users, eq(registrations.visibleUserId, users.id))
      .where(and(eq(registrations.tournamentId, tournamentId), sql`${registrations.gameInviteSubmittedAt} IS NOT NULL`))
      .orderBy(registrations.gameInviteSubmittedAt, registrations.registeredAt);

    const eligible = queued
      .filter((row) => row.playerId && !busyPlayerIds.has(row.playerId))
      .map((row) => ({
        registrationId: row.registrationId,
        playerId: row.playerId,
        userId: row.userId,
        playerName: row.playerName,
        playerUsername: row.playerUsername,
        playerGameId: row.playerGameId,
        telegramId: row.telegramId,
        inviteLink: row.inviteLink,
        qrFileId: row.qrFileId,
        clashRoyaleId: row.clashRoyaleId,
        clashRoyaleUsername: row.clashRoyaleUsername,
      } satisfies ClashPairParticipant));

    if (eligible.length < 2) return [];

    const [{ value: existingMatchCount }] = await tx.select({ value: count() }).from(matches).where(eq(matches.tournamentId, tournamentId));
    let nextMatchNumber = Number(existingMatchCount || 0) + 1;
    const createdPairs: CreatedClashPair[] = [];

    while (eligible.length >= 2) {
      const player1 = eligible.shift()!;
      const player2 = eligible.shift()!;
      const [match] = await tx
        .insert(matches)
        .values({
          tournamentId,
          round: 1,
          matchNumber: nextMatchNumber,
          player1Id: player1.playerId,
          player2Id: player2.playerId,
          status: "pending",
          scheduledAt: tournament.startDate || null,
        })
        .returning({ id: matches.id, matchNumber: matches.matchNumber });

      createdPairs.push({
        matchId: match.id,
        matchNumber: match.matchNumber,
        tournamentId,
        tournamentName: tournament.name,
        tournamentStartDate: tournament.startDate,
        player1,
        player2,
      });
      nextMatchNumber += 1;
      busyPlayerIds.add(player1.playerId);
      busyPlayerIds.add(player2.playerId);
    }

    return createdPairs;
  });
}

async function notifyClashPairSide(pair: CreatedClashPair, me: ClashPairParticipant, opponent: ClashPairParticipant) {
  const chatId = Number(me.telegramId);
  if (!Number.isFinite(chatId)) return;
  const opponentLink = opponent.inviteLink;
  const startLine = pair.tournamentStartDate
    ? `⏰ زمان پیشنهادی/شروع: <b>${html(new Date(pair.tournamentStartDate).toLocaleString("fa-IR"))}</b>`
    : "";

  const lines = [
    "⚔️ <b>حریف 1V1 کلش رویال شما پیدا شد</b>",
    "",
    `🏆 تورنومنت: <b>${html(pair.tournamentName)}</b>`,
    `⚔️ مسابقه: <b>#${pair.matchNumber}</b>`,
    startLine,
    "",
    `👤 حریف: <b>${html(clashParticipantDisplayName(opponent))}</b>`,
    `🏷 Player Tag / ID: <code>${html(clashParticipantTag(opponent))}</code>`,
    opponent.clashRoyaleUsername ? `👑 Username: <b>${html(opponent.clashRoyaleUsername)}</b>` : "",
    opponentLink ? `🔗 Invite/QR Link: <code>${html(opponentLink)}</code>` : "🔗 لینک متنی از حریف ثبت نشده؛ QR به‌صورت عکس ارسال می‌شود.",
    "",
    "قدم بعدی:",
    "1) لینک/QR حریف را در Clash Royale باز یا اسکن کن.",
    "2) او را Add Friend کن و Friendly Battle را شروع کنید.",
    "3) بعد از بازی نتیجه را با /matches ثبت کن.",
  ].filter(Boolean).join("\n");

  const keyboard: Array<Array<Record<string, string>>> = [];
  if (isHttpUrl(opponentLink)) keyboard.push([{ text: "🔗 باز کردن لینک دعوت حریف", url: opponentLink! }]);
  keyboard.push([
    { text: "⚔️ ثبت نتیجه", callback_data: `match:${pair.matchId}` },
    { text: "🏆 تورنومنت", url: `${APP_URL}/tournaments/${pair.tournamentId}` },
  ]);

  await sendMessage(chatId, lines, { inline_keyboard: keyboard });
  if (opponent.qrFileId) {
    await sendPhoto(chatId, opponent.qrFileId, `⚔️ QR حریف 1V1 کلش رویال: ${html(clashParticipantDisplayName(opponent))}`);
  }
}

async function notifyClashPairs(pairs: CreatedClashPair[]) {
  for (const pair of pairs) {
    await notifyClashPairSide(pair, pair.player1, pair.player2).catch((err) => logger.warn({ err, matchId: pair.matchId }, "Failed to notify Clash pair player1"));
    await notifyClashPairSide(pair, pair.player2, pair.player1).catch((err) => logger.warn({ err, matchId: pair.matchId }, "Failed to notify Clash pair player2"));
  }
}

function missionsKeyboard(status: { channelMember: boolean; linked: boolean; preReg: boolean; invites: number }) {
  const rows: Array<Array<Record<string, string>>> = [];
  if (status.channelMember) rows.push([{ text: "🎁 دریافت پاداش عضویت کانال", callback_data: "mission:claim:channel" }]);
  if (status.linked) rows.push([{ text: "🎁 دریافت پاداش اتصال حساب", callback_data: "mission:claim:link" }]);
  if (status.preReg) rows.push([{ text: "🎁 دریافت پاداش پیش‌ثبت‌نام", callback_data: "mission:claim:prereg" }]);
  if (status.invites > 0) rows.push([{ text: "🎁 دریافت پاداش دعوت", callback_data: "mission:claim:invite" }]);
  rows.push([{ text: "🔗 لینک دعوت من", callback_data: "mission:invite" }, { text: "اتصال حساب", callback_data: "menu:link" }]);
  return { inline_keyboard: rows };
}

async function getMissionStatus(telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  const [preReg] = await db.select({ id: telegramPreRegistrations.id }).from(telegramPreRegistrations).where(eq(telegramPreRegistrations.telegramId, telegramId)).limit(1);
  const [{ value: invites }] = await db.select({ value: count() }).from(telegramReferrals).where(eq(telegramReferrals.referrerTelegramId, telegramId));
  const channelMember = await isChannelMember(telegramId);
  return { linked, preReg: Boolean(preReg), invites, channelMember };
}

async function missionsCommand(chatId: number, telegramId: string) {
  const status = await getMissionStatus(telegramId);
  await sendMessage(chatId, [
    "🎯 <b>مأموریت‌های رشد Gament</b>",
    "",
    `${status.channelMember ? "✅" : "⬜"} عضویت در کانال Gament Games — <b>10 XP</b>`,
    `${status.linked ? "✅" : "⬜"} اتصال حساب با /link — <b>30 XP</b>`,
    `${status.preReg ? "✅" : "⬜"} پیش‌ثبت‌نام در ربات — <b>20 XP</b>`,
    `${status.invites > 0 ? "✅" : "⬜"} دعوت حداقل یک نفر با /invite — <b>50 XP</b>`,
    "",
    "اگر مأموریت انجام شده باشد، دکمه دریافت پاداش را بزن. هر پاداش فقط یک‌بار قابل دریافت است.",
  ].join("\n"), missionsKeyboard({ channelMember: status.channelMember, linked: Boolean(status.linked), preReg: status.preReg, invites: status.invites }));
}

async function claimMissionReward(chatId: number, telegramId: string, mission: string) {
  const status = await getMissionStatus(telegramId);
  if (!status.linked?.userId) {
    await sendMessage(chatId, "برای دریافت پاداش XP، اول حساب تلگرام را با /link به Gament وصل کن.", { inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]] });
    return;
  }

  const missions: Record<string, { ok: boolean; xp: number; title: string }> = {
    channel: { ok: status.channelMember, xp: 10, title: "عضویت در کانال" },
    link: { ok: Boolean(status.linked), xp: 30, title: "اتصال حساب" },
    prereg: { ok: status.preReg, xp: 20, title: "پیش‌ثبت‌نام" },
    invite: { ok: status.invites > 0, xp: 50, title: "دعوت دوست" },
  };
  const item = missions[mission];
  if (!item) return sendMessage(chatId, "این مأموریت معتبر نیست.");
  if (!item.ok) return sendMessage(chatId, "این مأموریت هنوز کامل نشده است. /missions را ببین.");

  const key = `mission:${mission}:${telegramId}`;
  const [existing] = await db.select({ id: telegramSentNotifications.id }).from(telegramSentNotifications).where(eq(telegramSentNotifications.dedupeKey, key)).limit(1);
  if (existing) return sendMessage(chatId, `✅ پاداش مأموریت «${html(item.title)}» قبلاً دریافت شده است.`);

  await db.insert(telegramSentNotifications).values({ dedupeKey: key, telegramId, type: "mission_reward" });
  const xpText = await rewardUserXP(status.linked.userId, item.xp, item.title);
  await sendMessage(chatId, `🎁 <b>پاداش مأموریت دریافت شد</b>\n\n${html(item.title)}${xpText}`);
}


async function sendLobbyToRegisteredUsers(chatId: number, tournamentId: string) {
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
  if (!tournament) {
    await sendMessage(chatId, "تورنومنت پیدا نشد.");
    return;
  }
  if (!tournament.roomId) {
    await sendMessage(chatId, "برای این تورنومنت هنوز Room ID ثبت نشده است.");
    return;
  }
  const recipients = await db
    .select({ telegramId: telegramAccounts.telegramId })
    .from(registrations)
    .innerJoin(telegramAccounts, eq(registrations.visibleUserId, telegramAccounts.userId))
    .where(eq(registrations.tournamentId, tournamentId));
  let sent = 0;
  for (const row of recipients) {
    await sendMessage(Number(row.telegramId), `🏟 <b>اطلاعات لابی آماده شد</b>\n\n🏆 ${html(tournament.name)}\nRoom ID: <code>${html(tournament.roomId)}</code>\nPassword: <code>${html(tournament.roomPassword || "بدون رمز")}</code>\n\n${html(tournament.lobbyNotes || "لطفاً به‌موقع وارد لابی شوید.")}`);
    sent += 1;
  }
  await sendMessage(chatId, `✅ اطلاعات لابی برای ${sent} نفر ارسال شد.`);
}

async function checkInCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای چک‌این، اول حساب را با /link وصل کن.", { inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]] });
    return;
  }
  const rows = await db
    .select({ id: registrations.id, checkedInAt: registrations.checkedInAt, tournamentId: tournaments.id, name: tournaments.name, status: tournaments.status })
    .from(registrations)
    .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
    .where(and(eq(registrations.visibleUserId, linked.userId), inArray(tournaments.status, ["registration", "in_progress"])))
    .orderBy(desc(registrations.registeredAt))
    .limit(8);
  if (!rows.length) {
    await sendMessage(chatId, "ثبت‌نام فعالی برای چک‌این پیدا نشد.");
    return;
  }
  await sendMessage(chatId, "✅ برای کدام تورنومنت حضور داری؟", {
    inline_keyboard: rows.map((row) => [{ text: `${row.checkedInAt ? "✅" : "⬜"} ${row.name.slice(0, 35)}`, callback_data: `checkin:${row.id}` }]),
  });
}

async function handleCheckIn(chatId: number, telegramId: string, registrationId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "حساب شما لینک نیست.");
    return;
  }
  const [row] = await db
    .select({ id: registrations.id, tournamentName: tournaments.name })
    .from(registrations)
    .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
    .where(and(eq(registrations.id, registrationId), eq(registrations.visibleUserId, linked.userId)))
    .limit(1);
  if (!row) {
    await sendMessage(chatId, "این ثبت‌نام برای شما پیدا نشد.");
    return;
  }
  await db.update(registrations).set({ checkedInAt: new Date() }).where(eq(registrations.id, registrationId));
  await sendMessage(chatId, `✅ حضور شما برای تورنومنت <b>${html(row.tournamentName)}</b> ثبت شد.`);
}

async function adminTournamentsCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }
  const rows = await db.select().from(tournaments).orderBy(desc(tournaments.createdAt)).limit(8);
  if (!rows.length) {
    await sendMessage(chatId, "تورنومنتی پیدا نشد.");
    return;
  }
  const keyboard = rows.flatMap((tournament, index) => [
    [{ text: `${index + 1}) ${tournament.name.slice(0, 28)} | ${tournament.status}`, callback_data: `adm:info:${tournament.id}` }],
    [
      { text: "📣 کانال", callback_data: `adm:post:${tournament.id}` },
      { text: "🏟 لابی", callback_data: `adm:lobby:${tournament.id}` },
      { text: "▶️ شروع", callback_data: `adm:start:${tournament.id}` },
      { text: "⛔ بستن", callback_data: `adm:close:${tournament.id}` },
    ],
  ]);
  await sendMessage(chatId, "🧩 مدیریت سریع تورنومنت‌ها:", { inline_keyboard: keyboard });
}

async function handleAdminTournamentAction(chatId: number, telegramId: string, action: string, tournamentId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
  if (!tournament) {
    await sendMessage(chatId, "تورنومنت پیدا نشد.");
    return;
  }
  if (action === "post") {
    const result = await publishTournamentToTelegramChannel(tournament);
    await sendMessage(chatId, result.ok ? "✅ در کانال منتشر شد." : `❌ انتشار انجام نشد: ${html(result.description || "خطا")}`);
    return;
  }
  if (action === "lobby") return sendLobbyToRegisteredUsers(chatId, tournamentId);
  if (action === "start") {
    await db.update(tournaments).set({ status: "in_progress", updatedAt: new Date() }).where(eq(tournaments.id, tournamentId));
    await sendMessage(chatId, "▶️ وضعیت تورنومنت به in_progress تغییر کرد.");
    return;
  }
  if (action === "close") {
    await db.update(tournaments).set({ status: "cancelled", updatedAt: new Date() }).where(eq(tournaments.id, tournamentId));
    await sendMessage(chatId, "⛔ تورنومنت لغو/بسته شد.");
    return;
  }
  await sendMessage(chatId, `🏆 <b>${html(tournament.name)}</b>\n🎮 ${html(gameLabel(tournament.game))}\nوضعیت: <b>${html(tournament.status)}</b>\nورودی: <b>${html(tournament.entryFee || "رایگان")}</b>`, {
    inline_keyboard: [[{ text: "مشاهده در سایت", url: `${APP_URL}/tournaments/${tournament.id}` }]],
  });
}

async function leaderboardCommand(chatId: number) {
  const rows = await db
    .select({ displayName: users.displayName, username: users.username, gamentId: users.gamentId, rankPoints: users.rankPoints, level: users.level })
    .from(users)
    .orderBy(desc(users.rankPoints))
    .limit(10);
  const text = [
    "🏆 <b>لیدربورد Gament</b>",
    "",
    ...rows.map((row, index) => `${index + 1}) <b>${html(row.displayName || row.username)}</b> — RP <b>${row.rankPoints}</b> | Lv ${row.level}\n<code>${html(row.gamentId)}</code>`),
  ].join("\n\n");
  await sendMessage(chatId, text);
}

async function dailyCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "برای دریافت جایزه روزانه، اول /link را انجام بده.");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
  const key = `daily:${today}:${telegramId}`;
  const [existing] = await db.select({ id: telegramSentNotifications.id }).from(telegramSentNotifications).where(eq(telegramSentNotifications.dedupeKey, key)).limit(1);
  if (existing) return sendMessage(chatId, "🎁 جایزه روزانه امروز را قبلاً گرفتی. فردا دوباره بیا!");
  const xp = crypto.randomInt(15, 76);
  await db.insert(telegramSentNotifications).values({ dedupeKey: key, telegramId, type: "daily" });
  const xpText = await rewardUserXP(linked.userId, xp, "جایزه روزانه");
  await sendMessage(chatId, `🎁 <b>جایزه روزانه Gament</b>\n\nامروز گرفتی:${xpText}`);
}

const QUIZ_QUESTIONS = [
  {
    question: "برای شرکت معتبر در تورنومنت، مهم‌ترین مورد چیست؟",
    options: ["آیدی بازی صحیح", "چند اکانت همزمان", "ارسال نتیجه جعلی"],
    correct: 0,
    explain: "آیدی بازی باید با پروفایل Gament و روز مسابقه یکی باشد.",
  },
  {
    question: "اگر نتیجه مسابقه مورد اختلاف باشد، بهترین کار چیست؟",
    options: ["ثبت اعتراض با مدرک", "دعوا در چت", "خروج از تورنومنت"],
    correct: 0,
    explain: "اعتراض همراه با اسکرین‌شات/مدرک مسیر درست داوری است.",
  },
  {
    question: "شارژ کیف پول کارت‌به‌کارت چه زمانی قابل استفاده می‌شود؟",
    options: ["بعد از تأیید ادمین", "بلافاصله بدون فیش", "بعد از حذف حساب"],
    correct: 0,
    explain: "فیش واریز باید بررسی شود و بعد موجودی داخل سایت فعال می‌شود.",
  },
  {
    question: "استفاده از چیت یا ابزار غیرمجاز چه نتیجه‌ای دارد؟",
    options: ["حذف/بن طبق قوانین", "امتیاز اضافه", "برد خودکار"],
    correct: 0,
    explain: "Gament روی بازی جوانمردانه و داوری معتبر حساس است.",
  },
];

function todayTehranKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
}

function dailyQuizIndex() {
  const today = todayTehranKey();
  let hash = 0;
  for (const ch of today) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % QUIZ_QUESTIONS.length;
}

async function quizCommand(chatId: number, telegramId?: string) {
  const today = todayTehranKey();
  const questionIndex = dailyQuizIndex();
  const q = QUIZ_QUESTIONS[questionIndex];
  const alreadyAnswered = telegramId
    ? await db.select({ id: telegramSentNotifications.id }).from(telegramSentNotifications).where(eq(telegramSentNotifications.dedupeKey, `quiz:${today}:${telegramId}`)).limit(1)
    : [];

  await sendMessage(chatId, [
    "🧠 <b>کوییز روزانه Gament</b>",
    "",
    q.question,
    "",
    alreadyAnswered.length ? "✅ امروز قبلاً امتیاز کوییز را گرفته‌ای؛ باز هم می‌توانی جواب را ببینی." : "جواب درست، XP روزانه می‌دهد.",
  ].join("\n"), {
    inline_keyboard: q.options.map((option, index) => ([{ text: option, callback_data: `quiz:ans:${questionIndex}:${index}` }])),
  });
}

async function handleQuizAnswer(chatId: number, telegramId: string, questionIndex: number, answerIndex: number) {
  const q = QUIZ_QUESTIONS[questionIndex] || QUIZ_QUESTIONS[dailyQuizIndex()];
  const correct = answerIndex === q.correct;
  if (!correct) {
    await sendMessage(chatId, `❌ جواب درست نبود.\n\n✅ پاسخ صحیح: <b>${html(q.options[q.correct])}</b>\n${html(q.explain)}`);
    return;
  }

  const linked = await getLinkedUserByTelegram(telegramId);
  const today = todayTehranKey();
  const key = `quiz:${today}:${telegramId}`;
  const [existing] = await db.select({ id: telegramSentNotifications.id }).from(telegramSentNotifications).where(eq(telegramSentNotifications.dedupeKey, key)).limit(1);
  if (existing) {
    await sendMessage(chatId, `✅ درست بود!\n\nامتیاز امروز را قبلاً گرفته‌ای.\n${html(q.explain)}`);
    return;
  }

  await db.insert(telegramSentNotifications).values({ dedupeKey: key, telegramId, type: "quiz" });
  const xpText = linked?.userId ? await rewardUserXP(linked.userId, 20, "کوییز روزانه") : "\nبرای دریافت XP، حساب را با /link وصل کن.";
  await sendMessage(chatId, `✅ درست بود!\n${html(q.explain)}${xpText || ""}`);
}

async function healthCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const started = Date.now();
  let dbStatus = "OK";
  try { await db.select({ value: count() }).from(users); } catch { dbStatus = "ERROR"; }
  const webhook = await telegramApi("getWebhookInfo", {});
  const ms = Date.now() - started;
  await sendMessage(chatId, `🩺 <b>Health Gament</b>\n\nDB: <b>${dbStatus}</b>\nTelegram Webhook: <b>${webhook?.ok ? "OK" : "ERROR"}</b>\nAI Keys: <b>${process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY ? "Configured" : "Local fallback"}</b>\nLatency: <b>${ms}ms</b>`);
}

async function exportTelegramCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const rows = await db.select().from(telegramPreRegistrations).orderBy(desc(telegramPreRegistrations.updatedAt)).limit(1000);
  const headers = ["telegramId", "username", "fullName", "phone", "gamentId", "game", "platform", "gamerTag", "status", "createdAt"];
  const csv = [headers.join(","), ...rows.map((r) => [r.telegramId, r.telegramUsername || "", r.fullName, r.phoneNumber, r.gamentId || "", r.game, r.platform || "", r.gamerTag, r.status, r.createdAt.toISOString()].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
  await sendDocument(chatId, "\ufeff" + csv, `telegram_registrations_${Date.now()}.csv`, "خروجی پیش‌ثبت‌نام‌های تلگرام");
}

async function couponCommand(chatId: number, telegramId: string, code: string) {
  const value = code.trim().toUpperCase();
  if (!value) return sendMessage(chatId, "کد تخفیف را بعد از دستور وارد کن. مثال: <code>/coupon GAMENT50</code>");
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "برای استفاده از کوپن، اول حساب را با /link وصل کن.");

  const [coupon] = await db.select().from(coupons).where(eq(coupons.code, value)).limit(1);
  if (!coupon || !coupon.isActive || (coupon.expiresAt && new Date(coupon.expiresAt) < new Date())) {
    return sendMessage(chatId, "این کد معتبر نیست یا منقضی شده است.");
  }
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return sendMessage(chatId, "ظرفیت استفاده از این کد تمام شده است.");

  await db.insert(couponRedemptions).values({
    couponId: coupon.id,
    userId: linked.userId,
    telegramId,
    status: "active",
  });
  const xpText = await rewardUserXP(linked.userId, 10, `کد ${value}`);
  await sendMessage(chatId, `🎟 کد <code>${html(value)}</code> فعال شد.\nتخفیف: <b>${coupon.discountPercent}%</b>\nدر ثبت‌نام پولی بعدی از تلگرام اعمال می‌شود.${xpText}`);
}

async function pollCommand(chatId: number, telegramId: string, question: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const q = question.trim() || "تورنومنت بعدی کدام بازی باشد؟";
  await telegramApi("sendPoll", {
    chat_id: process.env.TELEGRAM_CHANNEL_ID || "@Gament_games",
    question: q,
    options: ["COD Mobile", "Clash Royale", "Fortnite"],
    is_anonymous: false,
  });
  await sendMessage(chatId, "✅ نظرسنجی در کانال ارسال شد.");
}

async function shopCommand(chatId: number) {
  await sendMessage(chatId, "🛒 فروشگاه Gament\n\nفعلاً خرید از داخل وب‌اپ انجام می‌شود. آیتم‌های پیشنهادی: بلیت تورنومنت، Badge، بسته XP و آیتم‌های ویژه.", {
    inline_keyboard: [[{ text: "باز کردن فروشگاه/کیف پول", url: `${APP_URL}/wallet` }]],
  });
}

async function judgeCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!hasAdminAccess(telegramId) && !["judge", "moderator", "admin", "super_admin"].includes(String(linked?.role || ""))) {
    return sendMessage(chatId, "شما دسترسی داوری ندارید.");
  }
  const rows = await db
    .select({ id: matches.id, status: matches.status, tournamentName: tournaments.name, round: matches.round, matchNumber: matches.matchNumber })
    .from(matches)
    .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
    .where(inArray(matches.status, ["awaiting_judgment", "disputed"]))
    .orderBy(desc(matches.createdAt))
    .limit(10);
  if (!rows.length) return sendMessage(chatId, "مسابقه‌ای در صف داوری نیست.");
  await sendMessage(chatId, "⚖️ صف داوری:", {
    inline_keyboard: rows.flatMap((m, i) => [
      [{ text: `${i + 1}) ${m.tournamentName || "Match"} | ${m.status}`, callback_data: `judge:info:${m.id}` }],
      [{ text: "✅ تأیید", callback_data: `judge:approve:${m.id}` }, { text: "🚨 بررسی/اعتراض", callback_data: `judge:review:${m.id}` }],
    ]),
  });
}

async function handleJudgeAction(chatId: number, telegramId: string, action: string, matchId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!hasAdminAccess(telegramId) && !["judge", "moderator", "admin", "super_admin"].includes(String(linked?.role || ""))) {
    return sendMessage(chatId, "شما دسترسی داوری ندارید.");
  }
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) return sendMessage(chatId, "مسابقه پیدا نشد.");
  if (action === "review") {
    await db.update(matches).set({ status: "disputed" }).where(eq(matches.id, matchId));
    return sendMessage(chatId, "🚨 مسابقه برای بررسی/اعتراض علامت‌گذاری شد.");
  }
  if (action === "approve") {
    const evidence = (match.evidence || {}) as { reporterUserId?: string; reporterClaim?: string };
    let winnerId = match.winnerId;
    if (!winnerId && evidence.reporterUserId) {
      const [reporterPlayer] = await db.select({ id: players.id }).from(players).where(eq(players.visibleUserId, evidence.reporterUserId)).limit(1);
      if (evidence.reporterClaim === "win") winnerId = reporterPlayer?.id || null;
      if (evidence.reporterClaim === "lose") winnerId = match.player1Id === reporterPlayer?.id ? match.player2Id : match.player1Id;
    }
    await db.update(matches).set({ status: "completed", winnerId: winnerId || null, completedAt: new Date() }).where(eq(matches.id, matchId));
    let prizeText = "";
    if (winnerId) {
      const prize = await db.transaction(async (tx) => payoutClash1v1Prize(tx, matchId, winnerId!)).catch((err) => {
        logger.warn({ err, matchId, winnerId }, "Failed to payout Clash 1V1 prize");
        return { paid: false as const, reason: "error" };
      });
      if (prize.paid) prizeText = `\n💰 جایزه ${CLASH_1V1_CONFIG.prize1st} به کیف پول برنده واریز شد.`;
      else if (prize.reason === "already_paid") prizeText = "\n💰 جایزه این مسابقه قبلاً پرداخت شده بود.";
    }
    return sendMessage(chatId, `✅ نتیجه مسابقه تأیید و مسابقه تکمیل شد.${prizeText}`);
  }
  await sendMessage(chatId, `Match ID: <code>${html(match.id)}</code>\nStatus: <b>${html(match.status)}</b>`);
}

const OUTREACH_MESSAGE_TEMPLATE = `سلام 👋\n\nمن از تیم Gament هستم، پلتفرم برگزاری تورنومنت‌های گیمینگ (Call of Duty Mobile, Clash Royale, Fortnite).\n\nاگر به مسابقات گیمینگ، تورنومنت‌های پولی یا جامعهٔ بازیکنان علاقه‌مند هستی، به ما سر بزن:\n\n🔗 https://www.gament1.ir\n\nثبت‌نام اولیه از طریق ربات تلگرام هم امکان‌پذیره: @FlexaTournamentBot`;

async function classifiedAdsCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }
  await clearSession(telegramId);
  const rows = await db
    .select()
    .from(classifiedAds)
    .where(eq(classifiedAds.status, "new"))
    .orderBy(desc(classifiedAds.createdAt))
    .limit(20);

  if (!rows.length) {
    await sendMessage(chatId, "🔍 آگهی جدیدی یافت نشد.\n\nبرای اسکن دستور زیر را بزن:\n<code>/ads_scan</code>\nیا برای اسکن کل کشور:\n<code>/ads_allcities</code>", mainMenuKeyboard());
    return;
  }

  await sendMessage(chatId, `📋 <b>${rows.length} آگهی گیمینگ جدید</b>.\n\nبرای انتخاب گروهی، روی دکمه‌های ✅/⬜ کلیک کن. سپس عملیات گروهی را انتخاب کن:`, {
    inline_keyboard: rows.flatMap((ad) => [
      [{ text: `⬜ ${ad.platform} | ${ad.title.slice(0, 40)}`, callback_data: `ad:select:${ad.id}` }],
    ]),
  });
  await sendMessage(chatId, "عملیات گروهی:", {
    inline_keyboard: [
      [{ text: "📋 انتخاب همه", callback_data: "ad:bulk:select_all" }],
      [{ text: "✅ علامت‌گذاری انتخاب‌شده‌ها", callback_data: "ad:bulk:contact" }, { text: "❌ نادیده انتخاب‌شده‌ها", callback_data: "ad:bulk:ignore" }],
      [{ text: "📤 خروجی CSV انتخاب‌شده‌ها", callback_data: "ad:bulk:export" }],
      [{ text: "🔗 باز کردن همه انتخاب‌شده‌ها", callback_data: "ad:bulk:open" }],
    ],
  });
}

async function toggleAdSelection(chatId: number, telegramId: string, adId: string, messageId?: number) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const session = await getSession(telegramId);
  const selected = new Set(session.data.selectedAdIds || []);
  if (selected.has(adId)) selected.delete(adId);
  else selected.add(adId);
  await setSession(telegramId, session.state, { ...session.data, selectedAdIds: Array.from(selected) });

  // Refresh list if possible
  await refreshAdsList(chatId, telegramId, messageId);
}

async function refreshAdsList(chatId: number, telegramId: string, messageId?: number) {
  if (!hasAdminAccess(telegramId)) return;
  const session = await getSession(telegramId);
  const selected = new Set(session.data.selectedAdIds || []);
  const rows = await db
    .select()
    .from(classifiedAds)
    .where(eq(classifiedAds.status, "new"))
    .orderBy(desc(classifiedAds.createdAt))
    .limit(20);

  const keyboard = rows.flatMap((ad) => {
    const isSelected = selected.has(ad.id);
    return [
      [{ text: `${isSelected ? "✅" : "⬜"} ${ad.platform} | ${ad.title.slice(0, 40)}`, callback_data: `ad:select:${ad.id}` }],
      [{ text: "👁 مشاهده", callback_data: `ad:view:${ad.id}` }, { text: "🔗 باز کردن", url: ad.url }],
    ];
  });

  const text = `📋 <b>${rows.length} آگهی گیمینگ جدید</b>. انتخاب‌شده: <b>${selected.size}</b>`;
  if (messageId) await editMessage(chatId, messageId, text, { inline_keyboard: keyboard });
  else await sendMessage(chatId, text, { inline_keyboard: keyboard });
}

async function selectAllAds(chatId: number, telegramId: string, messageId?: number) {
  if (!hasAdminAccess(telegramId)) return;
  const rows = await db
    .select({ id: classifiedAds.id })
    .from(classifiedAds)
    .where(eq(classifiedAds.status, "new"))
    .orderBy(desc(classifiedAds.createdAt))
    .limit(20);
  await setSession(telegramId, "idle", { selectedAdIds: rows.map((r) => r.id) });
  await refreshAdsList(chatId, telegramId, messageId);
}

async function bulkMarkAds(chatId: number, telegramId: string, mode: "contacted" | "ignored") {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const session = await getSession(telegramId);
  const ids = session.data.selectedAdIds || [];
  if (!ids.length) return sendMessage(chatId, "هیچ آگهی انتخاب نشده. اول /ads را بزن و آگهی‌ها را انتخاب کن.");

  for (const id of ids) {
    await db.delete(classifiedAds).where(eq(classifiedAds.id, id));
  }
  await clearSession(telegramId);
  await sendMessage(chatId, `🗑 ${ids.length} آگهی ${mode === "contacted" ? "تماس‌گرفته‌شده" : "نادیده"} از لیست حذف شد.`, mainMenuKeyboard());
}

async function bulkExportAds(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const session = await getSession(telegramId);
  const ids = session.data.selectedAdIds || [];
  if (!ids.length) return sendMessage(chatId, "هیچ آگهی انتخاب نشده.");

  const rows = await db.select().from(classifiedAds).where(inArray(classifiedAds.id, ids));
  const headers = ["platform", "city", "title", "price", "url", "keywords", "status"];
  const csv = [headers.join(","), ...rows.map((r) => [
    r.platform, r.city || "", r.title, r.price || "", r.url, (r.keywords as string[]).join("|"), r.status,
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");

  await sendDocument(chatId, "\ufeff" + csv, `selected_ads_${Date.now()}.csv`, `${rows.length} آگهی انتخاب‌شده`);
  await clearSession(telegramId);
}

async function bulkOpenAds(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const session = await getSession(telegramId);
  const ids = session.data.selectedAdIds || [];
  if (!ids.length) return sendMessage(chatId, "هیچ آگهی انتخاب نشده.");
  const rows = await db.select({ url: classifiedAds.url, title: classifiedAds.title }).from(classifiedAds).where(inArray(classifiedAds.id, ids));
  const links = rows.map((r, i) => `${i + 1}. <a href="${r.url}">${r.title.slice(0, 30)}</a>`).join("\n");
  await sendMessage(chatId, `🔗 <b>آگهی‌های انتخاب‌شده</b>\n\n${links}\n\nروی هر لینک کلیک کن و در دیوار/شیپور پیام بده.`, mainMenuKeyboard());
}

async function classifiedAdsScanCommand(chatId: number, telegramId: string, allCities = false) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }
  await sendMessage(chatId, `🔍 در حال اسکن ${allCities ? "کل کشور" : "تهران"} ... این فرایند چند دقیقه طول می‌کشد.`);
  const { runClassifiedScrape } = await import("@/lib/classified-scraper");
  const results = await runClassifiedScrape({ allCities, limitPerCity: 5 });
  const totalFound = results.reduce((sum, r) => sum + r.found, 0);
  const totalNew = results.reduce((sum, r) => sum + r.new, 0);
  const summary = results.filter((r) => r.found > 0 || r.status === "error").map((r) => `${r.platform} ${r.city}: ${r.found} یافت، ${r.new} جدید${r.error ? " (خطا)" : ""}`).join("\n");
  await sendMessage(chatId, `✅ اسکن تمام شد.\n\n<b>کل یافت: ${totalFound}</b>\n<b>کل جدید: ${totalNew}</b>\n\n${html(summary)}\n\nبرای مشاهده: /ads`, mainMenuKeyboard());
}

async function classifiedAdsStatsCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }
  const allAds = await db.select({ status: classifiedAds.status, platform: classifiedAds.platform }).from(classifiedAds);
  const byStatus: Record<string, number> = {};
  const byPlatform: Record<string, number> = {};
  for (const ad of allAds) {
    byStatus[ad.status] = (byStatus[ad.status] || 0) + 1;
    byPlatform[ad.platform] = (byPlatform[ad.platform] || 0) + 1;
  }

  const [lastLog] = await db.select().from(classifiedScrapeLogs).orderBy(desc(classifiedScrapeLogs.createdAt)).limit(1);

  const text = [
    "📊 <b>آمار آگهی‌های گیمینگ</b>",
    "",
    "📁 کل آگهی‌ها: <b>" + allAds.length + "</b>",
    "🆕 جدید: <b>" + (byStatus.new || 0) + "</b>",
    "✅ تماس گرفته شده: <b>" + (byStatus.contacted || 0) + "</b>",
    "❌ نادیده: <b>" + (byStatus.ignored || 0) + "</b>",
    "",
    "🏪 دیوار: <b>" + (byPlatform.divar || 0) + "</b>",
    "🏪 شیپور: <b>" + (byPlatform.sheypoor || 0) + "</b>",
    "",
    lastLog
      ? `آخرین اسکن: <b>${lastLog.platform}</b> | ${lastLog.status} | ${lastLog.itemsFound} یافت، ${lastLog.itemsNew} جدید`
      : "هنوز اسکنی ثبت نشده.",
  ].join("\n");

  await sendMessage(chatId, text, {
    inline_keyboard: [
      [{ text: "🔍 مشاهده آگهی‌های جدید", callback_data: "menu:ads" }],
      [{ text: "🚀 اسکن تهران", callback_data: "menu:ads_scan" }, { text: "🇮🇷 اسکن کل کشور", callback_data: "menu:ads_scan_all" }],
    ],
  });
}

async function viewClassifiedAd(chatId: number, telegramId: string, adId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const [ad] = await db.select().from(classifiedAds).where(eq(classifiedAds.id, adId)).limit(1);
  if (!ad) return sendMessage(chatId, "آگهی پیدا نشد.");

  const text = [
    `📌 <b>${html(ad.title)}</b>`,
    `🏪 پلتفرم: <b>${html(ad.platform)}</b>`,
    ad.city ? `📍 شهر: <b>${html(ad.city)}</b>` : "",
    ad.price ? `💰 قیمت: <b>${html(ad.price)}</b>` : "",
    ad.keywords && (ad.keywords as string[]).length ? `🏷 کلمات: <b>${(ad.keywords as string[]).join(", ")}</b>` : "",
    "",
    `📝 ${html(ad.description || "بدون توضیحات")}`,
  ].filter(Boolean).join("\n");

  await sendMessage(chatId, text, {
    inline_keyboard: [
      [{ text: "🔗 باز کردن آگهی", url: ad.url }],
      [
        { text: "✅ تماس گرفتم", callback_data: `ad:contact:${ad.id}` },
        { text: "❌ نادیده", callback_data: `ad:ignore:${ad.id}` },
      ],
      [
        { text: "📋 کپی متن پیام", callback_data: `ad:copy:${ad.id}` },
        { text: "🗑 حذف از لیست", callback_data: `ad:delete:${ad.id}` },
      ],
      [{ text: "🔙 لیست آگهی‌ها", callback_data: "menu:ads" }],
    ],
  });
}

async function contactClassifiedAd(chatId: number, telegramId: string, adId: string, method: "contact" | "ignore" | "delete") {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const [ad] = await db.select().from(classifiedAds).where(eq(classifiedAds.id, adId)).limit(1);
  if (!ad) return sendMessage(chatId, "آگهی پیدا نشد.");

  if (method === "delete") {
    await db.delete(classifiedAds).where(eq(classifiedAds.id, adId));
    await sendMessage(chatId, "🗑 آگهی از لیست حذف شد.", mainMenuKeyboard());
    return;
  }

  const status = method === "contact" ? "contacted" : "ignored";
  await db
    .update(classifiedAds)
    .set({ status, contactedAt: method === "contact" ? new Date() : null, contactMethod: "telegram_admin", updatedAt: new Date() })
    .where(eq(classifiedAds.id, adId));

  if (method === "contact") {
    await sendMessage(chatId, `✅ آگهی <b>${html(ad.title)}</b> به عنوان «تماس گرفته شده» ثبت شد.\n\nمتن پیشنهادی برای ارسال دستی در دیوار/شیپور:\n\n<pre>${html(OUTREACH_MESSAGE_TEMPLATE)}</pre>`, {
      inline_keyboard: [[{ text: "🔗 باز کردن آگهی", url: ad.url }], [{ text: "🔙 لیست آگهی‌ها", callback_data: "menu:ads" }]],
    });
  } else {
    await sendMessage(chatId, "آگهی نادیده گرفته شد. از لیست حذف شد.", mainMenuKeyboard());
  }
}

async function copyOutreachMessage(chatId: number, telegramId: string, adId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const [ad] = await db.select().from(classifiedAds).where(eq(classifiedAds.id, adId)).limit(1);
  await sendMessage(chatId, `📋 متن آماده برای ارسال دستی به آگهی <b>${html(ad?.title || "")}</b>:\n\n<pre>${html(OUTREACH_MESSAGE_TEMPLATE)}</pre>\n\nبرای ارسال، روی لینک آگهی کلیک کن و در دیوار/شیپور پیام را بچسبان.`, {
    inline_keyboard: [[{ text: "🔗 باز کردن آگهی", url: ad?.url || APP_URL }], [{ text: "✅ تماس گرفتم", callback_data: `ad:contact:${adId}` }]],
  });
}

async function handleCommand(message: TelegramMessage, text: string) {
  const chatId = message.chat.id;
  const user = message.from;
  if (!user) return;
  const telegramId = String(user.id);
  const [command, ...args] = text.trim().split(/\s+/);
  const normalizedCommand = command.split("@")[0].toLowerCase();

  if (normalizedCommand === "/start") {
    const payload = args[0];
    await recordReferralIfNeeded(user, payload);
    if (await handleStartPayload(chatId, telegramId, user, payload)) return;
    return startCommand(chatId);
  }
  if (normalizedCommand === "/help") return startCommand(chatId);
  if (normalizedCommand === "/links") return linksCommand(chatId);
  if (normalizedCommand === "/deep_links") return deepLinksCommand(chatId, telegramId);
  if (normalizedCommand === "/channel") return channelCommand(chatId);
  if (normalizedCommand === "/link") return linkCommand(chatId, user);
  if (normalizedCommand === "/profile") return profileCommand(chatId, telegramId);
  if (normalizedCommand === "/wallet") return walletCommand(chatId, telegramId);
  if (normalizedCommand === "/deposit" || normalizedCommand === "/wallet_deposit") { if (!(await ensureFeatureEnabled(chatId, "telegram_wallet_deposit_enabled", "ثبت فیش از ربات"))) return; return startWalletDeposit(chatId, telegramId); }
  if (normalizedCommand === "/achievements") return achievementsCommand(chatId, telegramId);
  if (normalizedCommand === "/my_tournaments") return myTournamentsCommand(chatId, telegramId);
  if (normalizedCommand === "/daily") return dailyCommand(chatId, telegramId);
  if (normalizedCommand === "/quiz" || normalizedCommand === "/challenge") { if (!(await ensureFeatureEnabled(chatId, "telegram_quiz_enabled", "کوییز روزانه"))) return; return quizCommand(chatId, telegramId); }
  if (normalizedCommand === "/coupon") return couponCommand(chatId, telegramId, args.join(" "));
  if (normalizedCommand === "/shop") return shopCommand(chatId);
  if (normalizedCommand === "/invite") return inviteCommand(chatId, telegramId);
  if (normalizedCommand === "/missions") { if (!(await ensureFeatureEnabled(chatId, "telegram_missions_enabled", "مأموریت‌ها"))) return; return missionsCommand(chatId, telegramId); }
  if (normalizedCommand === "/claim_missions") return missionsCommand(chatId, telegramId);
  if (normalizedCommand === "/leaderboard") return leaderboardCommand(chatId);
  if (normalizedCommand === "/ai") { if (!(await ensureFeatureEnabled(chatId, "telegram_ai_enabled", "دستیار AI"))) return; return aiCommand(chatId, args.join(" "), telegramId); }
  if (normalizedCommand === "/support") { if (!(await ensureFeatureEnabled(chatId, "telegram_support_enabled", "پشتیبانی"))) return; return supportStartCommand(chatId, telegramId); }
  if (normalizedCommand === "/my_tickets") return myTicketsCommand(chatId, telegramId);
  if (normalizedCommand === "/matches") return matchesCommand(chatId, telegramId);
  if (normalizedCommand === "/qr" || normalizedCommand === "/clash_qr") {
    const tournamentId = args.join(" ").match(/[0-9a-f-]{36}/i)?.[0];
    return tournamentId ? startClashQrSubmission(chatId, telegramId, tournamentId) : startClash1v1(chatId, telegramId);
  }
  if (normalizedCommand === "/checkin") return checkInCommand(chatId, telegramId);
  if (normalizedCommand === "/judge") return judgeCommand(chatId, telegramId);
  if (normalizedCommand === "/health") return healthCommand(chatId, telegramId);
  if (normalizedCommand === "/export_telegram") return exportTelegramCommand(chatId, telegramId);
  if (normalizedCommand === "/poll") return pollCommand(chatId, telegramId, args.join(" "));
  if (normalizedCommand === "/ads") return classifiedAdsCommand(chatId, telegramId);
  if (normalizedCommand === "/ads_scan") return classifiedAdsScanCommand(chatId, telegramId, false);
  if (normalizedCommand === "/ads_allcities") return classifiedAdsScanCommand(chatId, telegramId, true);
  if (normalizedCommand === "/ads_stats") return classifiedAdsStatsCommand(chatId, telegramId);
  if (normalizedCommand === "/rules") return rulesCommand(chatId);
  if (normalizedCommand === "/howto" || normalizedCommand === "/guide") {
    const game = normalizeGame(args.join(" "));
    if (game && ["cod_mobile", "clash_royale", "fortnite"].includes(game)) {
      const guide = getGameIdGuide(game);
      return sendMessage(chatId, [`<b>${guide.title}</b>`, "", ...guide.steps].join("\n"));
    }
    return sendMessage(chatId, "🎮 برای کدام بازی آیدی را پیدا می‌کنی؟", gameGuideKeyboard());
  }
  if (normalizedCommand === "/rooms") return roomsCommand(chatId, args.join(" "));
  if (normalizedCommand === "/register") return registerStart(chatId, telegramId);
  if (normalizedCommand === "/status") return statusCommand(chatId, telegramId);
  if (normalizedCommand === "/unregister") return unregisterCommand(chatId, telegramId);
  if (normalizedCommand === "/admin" || normalizedCommand === "/stats") return adminCommand(chatId, telegramId);
  if (normalizedCommand === "/players") return playersCommand(chatId, telegramId);
  if (normalizedCommand === "/pending_wallets") return pendingWalletsCommand(chatId, telegramId);
  if (normalizedCommand === "/pending_disputes") return pendingDisputesCommand(chatId, telegramId);
  if (normalizedCommand === "/pending_support") return pendingSupportCommand(chatId, telegramId);
  if (normalizedCommand === "/pending_honors") return pendingHonorsCommand(chatId, telegramId);
  if (normalizedCommand === "/honor_stats") return honorStatsCommand(chatId, telegramId);
  if (normalizedCommand === "/ops") return adminCommand(chatId, telegramId);
  if (normalizedCommand === "/manage" || normalizedCommand === "/tournaments_admin") return adminTournamentsCommand(chatId, telegramId);
  if (normalizedCommand === "/post_latest") return postLatestTournamentCommand(chatId, telegramId);
  if (normalizedCommand === "/announce") return announceCommand(chatId, telegramId, args.join(" "));
  if (normalizedCommand === "/announce_game") {
    const [game, ...messageParts] = args;
    return announceCommand(chatId, telegramId, messageParts.join(" "), game);
  }

  return sendMessage(chatId, "دستور را متوجه نشدم. از /start استفاده کن.", mainMenuKeyboard());
}

async function handleConversationMessage(message: TelegramMessage) {
  const chatId = message.chat.id;
  const user = message.from;
  if (!user) return;
  const telegramId = String(user.id);
  const text = normalizeDigits(message.text || "").trim();

  if (text === CANCEL_TEXT) {
    await clearSession(telegramId);
    await sendMessage(chatId, "عملیات لغو شد.", removeKeyboard());
    await startCommand(chatId);
    return;
  }

  const session = await getSession(telegramId);
  const data = { ...session.data };

  if (session.state === "clash_qr_submission") {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId || !data.qrRegistrationId || !data.qrTournamentId) {
      await clearSession(telegramId);
      await sendMessage(chatId, "اطلاعات QR ناقص است. دوباره /qr را بزن.", removeKeyboard());
      return;
    }

    const [registration] = await db
      .select({
        registrationId: registrations.id,
        tournamentId: registrations.tournamentId,
        tournamentName: tournaments.name,
        game: tournaments.game,
        entryFee: tournaments.entryFee,
      })
      .from(registrations)
      .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
      .where(and(eq(registrations.id, data.qrRegistrationId), eq(registrations.visibleUserId, linked.userId)))
      .limit(1);

    if (!registration || registration.game !== "clash_royale" || isFreeEntryFee(registration.entryFee)) {
      await clearSession(telegramId);
      await sendMessage(chatId, "این ثبت‌نام برای 1V1 کلش رویال معتبر نیست یا تورنومنت پولی کلش نیست.", removeKeyboard());
      return;
    }

    const photos = message.photo || [];
    const bestPhoto = photos[photos.length - 1];
    const rawInput = normalizeDigits(message.caption || message.text || "").trim();
    const typedInvite = extractInviteReference(rawInput);

    if (!bestPhoto && !typedInvite) {
      await sendMessage(chatId, "لطفاً عکس QR یا Share Link دعوت کلش رویال را ارسال کن. برای لغو، «لغو» را بزن.");
      return;
    }

    const decodedInvite = bestPhoto ? await decodeQrInviteFromTelegramPhoto(bestPhoto.file_id) : null;
    const inviteLink = typedInvite || decodedInvite;

    await db
      .update(registrations)
      .set({
        gameInviteLink: inviteLink || null,
        gameInviteQrFileId: bestPhoto?.file_id || null,
        gameInviteSubmittedAt: new Date(),
      })
      .where(eq(registrations.id, registration.registrationId));

    await clearSession(telegramId);
    await sendMessage(
      chatId,
      [
        "✅ اطلاعات 1V1 کلش رویال شما ثبت شد.",
        decodedInvite && !typedInvite ? "🔎 لینک داخل QR با موفقیت خوانده شد." : "",
        !inviteLink && bestPhoto ? "ℹ️ لینک داخل QR خوانده نشد، اما خود عکس QR ذخیره شد و برای حریف ارسال می‌شود." : "",
        "",
        "اکنون در صف 1V1 کلش رویال هستی. هر وقت یک پلیر دیگر آماده شود، بات شما دو نفر را واقعی به هم وصل می‌کند.",
      ].filter(Boolean).join("\n"),
      removeKeyboard()
    );

    const pairs = await tryAutoPairClashTournament(registration.tournamentId);
    await notifyClashPairs(pairs);
    return;
  }


  if (session.state === "wallet_deposit_amount") {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId) {
      await clearSession(telegramId);
      await sendMessage(chatId, "حساب شما لینک نیست. اول /link را انجام بده.", removeKeyboard());
      return;
    }
    const amountRial = parseTomanToRial(text);
    const validation = validateDepositAmountRial(amountRial);
    if (!validation.ok) {
      await sendMessage(chatId, `${html(validation.error)}\n\nمبلغ را دوباره به تومان وارد کن:`);
      return;
    }
    data.walletDepositAmountToman = rialToTomanNumber(amountRial).toString();
    await setSession(telegramId, "wallet_deposit_tracking", data);
    await sendMessage(chatId, `مبلغ ثبت شد: <b>${html(formatTomanFromRial(amountRial))}</b>\n\nشماره پیگیری یا ۴ رقم آخر کارت مبدأ را بفرست. اگر نداری «رد کردن» را بزن.`, replyKeyboard([[SKIP_TEXT], [CANCEL_TEXT]]));
    return;
  }

  if (session.state === "wallet_deposit_tracking") {
    data.walletDepositTracking = text === SKIP_TEXT ? "" : text.slice(0, 80);
    await setSession(telegramId, "wallet_deposit_receipt", data);
    await sendMessage(chatId, "حالا تصویر فیش واریز را به‌صورت عکس ارسال کن.\n\nحداکثر حجم قابل قبول ۱.۲ مگابایت است.", replyKeyboard([[CANCEL_TEXT]]));
    return;
  }

  if (session.state === "wallet_deposit_receipt") {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId || !data.walletDepositAmountToman) {
      await clearSession(telegramId);
      await sendMessage(chatId, "اطلاعات واریز ناقص است. دوباره /deposit را شروع کن.", removeKeyboard());
      return;
    }
    const photos = message.photo || [];
    const bestPhoto = photos[photos.length - 1];
    if (!bestPhoto) {
      await sendMessage(chatId, "لطفاً فیش را به‌صورت عکس ارسال کن، نه متن یا فایل دیگر.");
      return;
    }

    try {
      const amountRial = parseTomanToRial(data.walletDepositAmountToman);
      const receipt = await downloadTelegramPhotoAsDataUrl(bestPhoto.file_id);
      const wallet = await getOrCreateWallet(linked.userId);
      const [tx] = await db.insert(transactions).values({
        walletId: wallet.id,
        amount: amountRial.toString(),
        type: "deposit",
        status: "pending",
        referenceId: createWalletReference("deposit"),
        metadata: {
          kind: "manual_deposit_request",
          provider: "telegram_bot_card_transfer",
          withdrawable: false,
          userId: linked.userId,
          telegramId,
          displayName: linked.displayName,
          trackingNumber: data.walletDepositTracking || null,
          note: sanitizeWalletNote(message.caption || "ثبت از ربات تلگرام"),
          receiptUploaded: true,
          receiptUrl: receipt.dataUrl,
          receiptFileName: receipt.fileName,
          receiptFileType: receipt.contentType,
          receiptFileSize: receipt.size,
          telegramFileId: bestPhoto.file_id,
          telegramFileUniqueId: bestPhoto.file_unique_id,
        },
      }).returning();

      await clearSession(telegramId);
      await sendMessage(chatId, `✅ فیش واریز ثبت شد.\n\nمبلغ: <b>${html(formatTomanFromRial(amountRial))}</b>\nوضعیت: <b>در انتظار بررسی ادمین</b>\n\nبعد از تأیید مدیریت، موجودی کیف پولت افزایش پیدا می‌کند.`, {
        inline_keyboard: [[{ text: "مشاهده کیف پول", url: `${APP_URL}/wallet` }]],
      });
      await notifyAdminsOnWalletDeposit(user, linked.userId, amountRial, tx.id).catch((err) => logger.warn({ err }, "Failed to notify admins on Telegram wallet deposit"));
    } catch (err) {
      const messageText = err instanceof Error && err.message === "RECEIPT_TOO_LARGE"
        ? "حجم تصویر فیش بیشتر از ۱.۲ مگابایت است. لطفاً تصویر سبک‌تر ارسال کن."
        : "ثبت فیش انجام نشد. لطفاً دوباره عکس فیش را ارسال کن یا بعداً از سایت اقدام کن.";
      await sendMessage(chatId, messageText);
    }
    return;
  }

  if (session.state === "evidence_upload") {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId || !data.evidenceMatchId) {
      await clearSession(telegramId);
      await sendMessage(chatId, "اطلاعات ارسال مدرک ناقص است. دوباره /matches را بزن.");
      return;
    }
    const photos = message.photo || [];
    const bestPhoto = photos[photos.length - 1];
    if (!bestPhoto) {
      await sendMessage(chatId, "لطفاً مدرک را به‌صورت عکس ارسال کن.");
      return;
    }
    const [match] = await db.select().from(matches).where(eq(matches.id, data.evidenceMatchId)).limit(1);
    const myPlayers = await db.select({ id: players.id }).from(players).where(eq(players.visibleUserId, linked.userId));
    const isMyMatch = myPlayers.some((p) => p.id === match?.player1Id || p.id === match?.player2Id);
    if (!match || !isMyMatch) {
      await clearSession(telegramId);
      await sendMessage(chatId, "این مسابقه برای حساب شما پیدا نشد.");
      return;
    }
    await db.insert(matchEvidence).values({
      matchId: match.id,
      uploadedById: linked.userId,
      fileUrl: `telegram_file:${bestPhoto.file_id}`,
      fileType: "photo",
      description: message.caption || "Telegram screenshot evidence",
    });
    await db.update(matches).set({ status: "awaiting_judgment" }).where(eq(matches.id, match.id));
    await clearSession(telegramId);
    await sendMessage(chatId, "✅ اسکرین‌شات ثبت شد و برای داوری ارسال شد.", removeKeyboard());
    return;
  }

  if (session.state === "support_subject") {
    if (text.length < 3 || text.length > 120) {
      await sendMessage(chatId, "موضوع باید بین ۳ تا ۱۲۰ کاراکتر باشد. دوباره بنویس:");
      return;
    }
    data.supportSubject = text;
    await setSession(telegramId, "support_message", data);
    await sendMessage(chatId, "متن پیام پشتیبانی را بنویس:");
    return;
  }

  if (session.state === "support_message") {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId) {
      await clearSession(telegramId);
      await sendMessage(chatId, "حساب شما لینک نیست. اول /link را انجام بده.");
      return;
    }
    if (text.length < 5 || text.length > 2000) {
      await sendMessage(chatId, "متن پیام باید بین ۵ تا ۲۰۰۰ کاراکتر باشد. دوباره بنویس:");
      return;
    }
    const [ticket] = await db.insert(tickets).values({ userId: linked.userId, subject: data.supportSubject || "پشتیبانی تلگرام" }).returning();
    await db.insert(ticketMessages).values({ ticketId: ticket.id, senderId: linked.userId, message: text });
    await clearSession(telegramId);
    await sendMessage(chatId, "✅ تیکت پشتیبانی شما ثبت شد. از داخل سایت هم می‌توانید پیگیری کنید.", {
      inline_keyboard: [[{ text: "مرکز پشتیبانی", url: `${APP_URL}/support` }], [{ text: "تیکت‌های من", callback_data: "support:mine" }]],
    });
    await notifyAdminsOnSupportTicket(user, linked.userId, ticket.id, data.supportSubject || "پشتیبانی تلگرام", text).catch((err) => logger.warn({ err, ticketId: ticket.id }, "Failed to notify admins on Telegram support ticket"));
    return;
  }

  if (session.state === "dispute_reason") {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId || !data.disputeMatchId) {
      await clearSession(telegramId);
      await sendMessage(chatId, "اطلاعات اعتراض ناقص است. دوباره /matches را بزن.");
      return;
    }
    const myPlayers = await db.select({ id: players.id }).from(players).where(eq(players.visibleUserId, linked.userId));
    const playerIds = myPlayers.map((p) => p.id);
    const [match] = await db.select().from(matches).where(eq(matches.id, data.disputeMatchId)).limit(1);
    const raisedById = playerIds.find((id) => id === match?.player1Id || id === match?.player2Id);
    if (!match || !raisedById) {
      await clearSession(telegramId);
      await sendMessage(chatId, "این مسابقه برای حساب شما پیدا نشد.");
      return;
    }
    await db.insert(disputes).values({ matchId: match.id, raisedById, reason: text, evidenceUrls: [] });
    await db.update(matches).set({ status: "disputed" }).where(eq(matches.id, match.id));
    await clearSession(telegramId);
    await sendMessage(chatId, "✅ اعتراض شما ثبت شد و در پنل داوری بررسی می‌شود.");
    return;
  }

  if (session.state === "full_name") {
    if (text.length < 2 || text.length > 80) {
      await sendMessage(chatId, "نام معتبر نیست. لطفاً نام نمایشی یا نام کامل را دوباره وارد کن:");
      return;
    }
    data.fullName = text;
    await setSession(telegramId, "gamer_tag", data);
    await sendMessage(chatId, gamePrompt(data.game));
    return;
  }

  if (session.state === "gamer_tag") {
    if (text.length < 2 || text.length > 80) {
      await sendMessage(chatId, "آیدی بازی معتبر نیست. دوباره وارد کن:");
      return;
    }
    data.gamerTag = text;
    await setSession(telegramId, "phone", data);
    await sendMessage(chatId, "شماره تماس خودت را وارد کن یا دکمه ارسال شماره را بزن:", {
      keyboard: [[{ text: "📱 ارسال شماره من", request_contact: true }], [CANCEL_TEXT]],
      resize_keyboard: true,
      one_time_keyboard: true,
    });
    return;
  }

  if (session.state === "phone") {
    const phone = message.contact?.phone_number ? normalizePhoneNumber(message.contact.phone_number) : normalizePhoneNumber(text);
    if (!/^09\d{9}$/.test(phone)) {
      await sendMessage(chatId, "شماره تماس معتبر نیست. نمونه درست: 09123456789");
      return;
    }
    if (message.contact?.user_id && message.contact.user_id !== user.id) {
      await sendMessage(chatId, "لطفاً شماره تماس خودت را ارسال کن، نه مخاطب دیگران.");
      return;
    }
    data.phoneNumber = phone;
    await setSession(telegramId, "gament_id", data);
    await sendMessage(
      chatId,
      GAMENT_ID_REQUIRED
        ? `Gament ID خودت را وارد کن؛ مثل <code>FLX-1234</code>. اگر حساب نداری اول از وب‌اپ بساز: ${html(`${APP_URL}/register`)}`
        : `اگر در وب‌اپ Gament حساب داری، Gament ID خودت را وارد کن؛ مثل <code>FLX-1234</code>. اگر هنوز حساب نداری، «رد کردن» را بزن.`,
      GAMENT_ID_REQUIRED ? removeKeyboard() : replyKeyboard([[SKIP_TEXT], [CANCEL_TEXT]])
    );
    return;
  }

  if (session.state === "gament_id") {
    if (text === SKIP_TEXT && !GAMENT_ID_REQUIRED) {
      data.gamentId = "";
    } else if (!isValidGamentId(text)) {
      await sendMessage(chatId, "Gament ID معتبر نیست. نمونه درست: <code>FLX-1234</code>", GAMENT_ID_REQUIRED ? undefined : replyKeyboard([[SKIP_TEXT], [CANCEL_TEXT]]));
      return;
    } else {
      data.gamentId = normalizeGamentId(text);
    }
    await setSession(telegramId, "city", data);
    await sendMessage(chatId, "شهر محل سکونت را بنویس. اگر لازم نیست، «رد کردن» را بزن:", replyKeyboard([[SKIP_TEXT], [CANCEL_TEXT]]));
    return;
  }

  if (session.state === "city") {
    data.city = text === SKIP_TEXT ? "" : text.slice(0, 80);
    await setSession(telegramId, "team", data);
    await sendMessage(chatId, "نام تیم/کلن را بنویس. اگر انفرادی هستی، «رد کردن» را بزن:", replyKeyboard([[SKIP_TEXT], [CANCEL_TEXT]]));
    return;
  }

  if (session.state === "team") {
    data.teamName = text === SKIP_TEXT ? "" : text.slice(0, 80);
    await setSession(telegramId, "confirm", data);
    await sendMessage(chatId, "✅ اطلاعات دریافت شد.", removeKeyboard());
    await sendMessage(chatId, `${registrationSummary(data)}\n\nاگر اطلاعات درست است، ثبت نهایی را بزن.`, confirmKeyboard());
    return;
  }

  await sendMessage(chatId, "متوجه نشدم. از /start استفاده کن.", mainMenuKeyboard());
}

async function handleCallback(callback: TelegramCallbackQuery) {
  const chatId = callback.message?.chat.id;
  const messageId = callback.message?.message_id;
  const telegramId = String(callback.from.id);
  const data = callback.data || "";

  await answerCallback(callback.id);
  if (!chatId) return;

  if (data === "support:mine") return myTicketsCommand(chatId, telegramId);
  if (data === "menu:home") return startCommand(chatId);
  if (data === "mission:invite") return inviteCommand(chatId, telegramId);
  if (data.startsWith("mission:claim:")) return claimMissionReward(chatId, telegramId, data.replace("mission:claim:", ""));
  if (data === "admin:wallets") return pendingWalletsCommand(chatId, telegramId);
  if (data === "admin:disputes") return pendingDisputesCommand(chatId, telegramId);
  if (data === "admin:support") return pendingSupportCommand(chatId, telegramId);
  if (data === "admin:honors") return pendingHonorsCommand(chatId, telegramId);
  if (data === "admin:honor_stats") return honorStatsCommand(chatId, telegramId);
  if (data === "admin:tournaments") return adminTournamentsCommand(chatId, telegramId);
  if (data.startsWith("honor:")) {
    const [, action, honorId] = data.split(":");
    if ((action === "approve" || action === "reject") && honorId) return reviewHonorFromTelegram(chatId, telegramId, honorId, action);
  }
  if (data === "menu:rooms") return roomsCommand(chatId);
  if (data === "menu:register") return registerStart(chatId, telegramId);
  if (data === "menu:ads") return classifiedAdsCommand(chatId, telegramId);
  if (data === "menu:ads_scan") return classifiedAdsScanCommand(chatId, telegramId, false);
  if (data === "menu:ads_scan_all") return classifiedAdsScanCommand(chatId, telegramId, true);
  if (data.startsWith("howto:")) {
    const game = data.replace("howto:", "");
    const guide = getGameIdGuide(game);
    return sendMessage(chatId, [`<b>${guide.title}</b>`, "", ...guide.steps].join("\n"));
  }
  if (data.startsWith("ad:select:")) return toggleAdSelection(chatId, telegramId, data.replace("ad:select:", ""), messageId);
  if (data === "ad:bulk:select_all") return selectAllAds(chatId, telegramId, messageId);
  if (data === "ad:bulk:contact") return bulkMarkAds(chatId, telegramId, "contacted");
  if (data === "ad:bulk:ignore") return bulkMarkAds(chatId, telegramId, "ignored");
  if (data === "ad:bulk:export") return bulkExportAds(chatId, telegramId);
  if (data === "ad:bulk:open") return bulkOpenAds(chatId, telegramId);
  if (data.startsWith("ad:view:")) return viewClassifiedAd(chatId, telegramId, data.replace("ad:view:", ""));
  if (data.startsWith("ad:contact:")) return contactClassifiedAd(chatId, telegramId, data.replace("ad:contact:", ""), "contact");
  if (data.startsWith("ad:ignore:")) return contactClassifiedAd(chatId, telegramId, data.replace("ad:ignore:", ""), "ignore");
  if (data.startsWith("ad:delete:")) return contactClassifiedAd(chatId, telegramId, data.replace("ad:delete:", ""), "delete");
  if (data.startsWith("ad:copy:")) return copyOutreachMessage(chatId, telegramId, data.replace("ad:copy:", ""));
  if (data.startsWith("join:")) return joinTournamentFromTelegram(chatId, telegramId, data.replace("join:", ""));
  if (data.startsWith("waitlist:")) return joinWaitlist(chatId, telegramId, data.replace("waitlist:", ""));
  if (data === "menu:rules") return rulesCommand(chatId);
  if (data === "menu:status") return statusCommand(chatId, telegramId);
  if (data === "menu:link") return linkCommand(chatId, callback.from);
  if (data === "menu:profile") return profileCommand(chatId, telegramId);
  if (data === "menu:wallet") return walletCommand(chatId, telegramId);
  if (data === "menu:my_tournaments") return myTournamentsCommand(chatId, telegramId);
  if (data === "menu:matches") return matchesCommand(chatId, telegramId);
  if (data === "menu:clash_qr") return startClash1v1(chatId, telegramId);
  if (data.startsWith("qr:")) return startClashQrSubmission(chatId, telegramId, data.replace("qr:", ""));
  if (data === "menu:checkin") return checkInCommand(chatId, telegramId);
  if (data === "menu:missions") { if (!(await ensureFeatureEnabled(chatId, "telegram_missions_enabled", "مأموریت‌ها"))) return; return missionsCommand(chatId, telegramId); }
  if (data === "menu:quiz") { if (!(await ensureFeatureEnabled(chatId, "telegram_quiz_enabled", "کوییز روزانه"))) return; return quizCommand(chatId, telegramId); }
  if (data === "menu:support") { if (!(await ensureFeatureEnabled(chatId, "telegram_support_enabled", "پشتیبانی"))) return; return supportStartCommand(chatId, telegramId); }
  if (data === "wallet:deposit") { if (!(await ensureFeatureEnabled(chatId, "telegram_wallet_deposit_enabled", "ثبت فیش از ربات"))) return; return startWalletDeposit(chatId, telegramId); }
  if (data.startsWith("match:")) return handleMatchAction(chatId, telegramId, data.replace("match:", ""));
  if (data.startsWith("result:")) {
    const [, action, matchId] = data.split(":");
    if ((action === "win" || action === "lose") && matchId) return submitTelegramResult(chatId, telegramId, matchId, action);
  }
  if (data.startsWith("dispute:")) return startDispute(chatId, telegramId, data.replace("dispute:", ""));
  if (data.startsWith("evidence:")) return startEvidenceUpload(chatId, telegramId, data.replace("evidence:", ""));
  if (data.startsWith("judge:")) {
    const [, action, matchId] = data.split(":");
    if (action && matchId) return handleJudgeAction(chatId, telegramId, action, matchId);
  }
  if (data.startsWith("quiz:ans:")) {
    const [, , qIndex, aIndex] = data.split(":");
    return handleQuizAnswer(chatId, telegramId, Number(qIndex), Number(aIndex));
  }
  if (data.startsWith("adm:")) {
    const [, action, tournamentId] = data.split(":");
    if (action && tournamentId) return handleAdminTournamentAction(chatId, telegramId, action, tournamentId);
  }
  if (data.startsWith("checkin:")) return handleCheckIn(chatId, telegramId, data.replace("checkin:", ""));
  if (data.startsWith("mylobby:")) return showMyLobby(chatId, telegramId, data.replace("mylobby:", ""));
  if (data.startsWith("cancelreg:")) return cancelRegistrationCommand(chatId, telegramId, data.replace("cancelreg:", ""));

  if (data === "reg:abort") {
    await clearSession(telegramId);
    if (messageId) await editMessage(chatId, messageId, "عملیات پیش‌ثبت‌نام لغو شد.", mainMenuKeyboard());
    else await sendMessage(chatId, "عملیات پیش‌ثبت‌نام لغو شد.", mainMenuKeyboard());
    return;
  }

  if (data === "reg:restart") {
    await setSession(telegramId, "idle", {});
    if (messageId) await editMessage(chatId, messageId, "پیش‌ثبت‌نام از اول شروع شد. بازی را انتخاب کن:", gameKeyboard());
    else await sendMessage(chatId, "بازی را انتخاب کن:", gameKeyboard());
    return;
  }

  if (data.startsWith("reg:game:")) {
    const game = normalizeGame(data.replace("reg:game:", ""));
    await setSession(telegramId, "idle", { game });
    if (messageId) await editMessage(chatId, messageId, `بازی انتخاب شد: <b>${html(gameLabel(game))}</b>\n\nحالا پلتفرم را انتخاب کن:`, platformKeyboard());
    else await sendMessage(chatId, "حالا پلتفرم را انتخاب کن:", platformKeyboard());
    return;
  }

  if (data.startsWith("reg:platform:")) {
    const index = Number(data.replace("reg:platform:", ""));
    const platform = PLATFORM_OPTIONS[index] || "Other";
    const session = await getSession(telegramId);
    await setSession(telegramId, "full_name", { ...session.data, platform });
    if (messageId) await editMessage(chatId, messageId, `پلتفرم انتخاب شد: <b>${html(platform)}</b>\n\nنام نمایشی Gament یا نام و نام‌خانوادگی خودت را بنویس:`);
    else await sendMessage(chatId, "نام نمایشی Gament یا نام و نام‌خانوادگی خودت را بنویس:");
    return;
  }

  if (data === "reg:confirm") {
    const session = await getSession(telegramId);
    const required = [session.data.game, session.data.platform, session.data.fullName, session.data.gamerTag, session.data.phoneNumber];
    if (GAMENT_ID_REQUIRED) required.push(session.data.gamentId);
    if (session.state !== "confirm" || required.some((value) => !value)) {
      await sendMessage(chatId, "بخشی از اطلاعات ناقص است. لطفاً /register را دوباره شروع کن.", mainMenuKeyboard());
      return;
    }

    await savePreRegistration(callback.from, session.data);
    await clearSession(telegramId);
    const text = `✅ پیش‌ثبت‌نام شما با موفقیت داخل پنل Gament ثبت شد.\n\n${registrationSummary(session.data)}\n\nبرای ثبت‌نام قطعی در روم، پرداخت ورودی احتمالی و مشاهده لابی وارد وب‌اپ شو.`;
    if (messageId) await editMessage(chatId, messageId, text, {
      inline_keyboard: [
        [{ text: "🏆 تکمیل ثبت‌نام در وب‌اپ", url: `${APP_URL}/tournaments` }],
        [{ text: "👤 پروفایل Gament", url: `${APP_URL}/profile` }],
      ],
    });
    else await sendMessage(chatId, text, mainMenuKeyboard());
    return;
  }

  await sendMessage(chatId, "این دکمه قدیمی یا نامعتبر است. منوی جدید را باز کردم؛ برای 1V1 کلش رویال روی دکمه ⚔️ بزن یا دستور /qr را ارسال کن.", mainMenuKeyboard());
}

async function handleUpdate(update: TelegramUpdate) {
  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }

  const message = update.message;
  if (!message?.from) return;
  const text = message.text || "";

  if (!(await telegramFeatureEnabled("telegram_bot_enabled", true)) && !text.trim().startsWith("/admin")) {
    await sendMessage(message.chat.id, "ربات Gament فعلاً در حالت تعمیرات است. لطفاً کمی بعد دوباره تلاش کن.");
    return;
  }

  if (text.trim().startsWith("/")) {
    await handleCommand(message, text);
    return;
  }

  await handleConversationMessage(message);
}

export async function POST(request: NextRequest) {
  const auth = validateWebhookSecret(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const update = await request.json() as TelegramUpdate;
    await handleUpdate(update);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Telegram webhook failed");
    // Always return 200 to Telegram for handled server-side errors to avoid a
    // retry storm. Check Render logs for details.
    return NextResponse.json({ ok: false });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    webhook: "Gament Telegram webhook",
    setWebhookUrl: `https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=${APP_URL}/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>`,
  });
}
