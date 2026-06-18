import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { and, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { couponRedemptions, coupons, disputes, matchEvidence, matches, players, registrations, telegramAccounts, telegramBotSessions, telegramCampaignEvents, telegramLinkCodes, telegramPreRegistrations, telegramReferrals, telegramSentNotifications, tickets, ticketMessages, tournamentWaitlist, tournaments, transactions, users, wallets } from "@/db/schema";
import { normalizeDigits, normalizePhoneNumber } from "@/lib/phone";
import { publishTournamentToTelegramChannel } from "@/lib/telegram";
import { generateRealAssistantResponse } from "@/lib/ai-service";
import { bigIntFromText, formatTomanFromRial } from "@/lib/money";
import { getEntryFeeRial } from "@/lib/tournament-finance";
import { evaluateUserAchievements, achievementProgressForUser } from "@/lib/achievement-service";
import { LevelingService } from "@/lib/leveling-service";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

type BotState =
  | "idle"
  | "full_name"
  | "gamer_tag"
  | "phone"
  | "flexa_id"
  | "city"
  | "team"
  | "confirm"
  | "support_subject"
  | "support_message"
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
  flexaId?: string;
  city?: string;
  teamName?: string;
  supportSubject?: string;
  disputeMatchId?: string;
  evidenceMatchId?: string;
}

interface BotSession {
  state: BotState;
  data: SessionData;
}

const APP_URL = (process.env.APP_URL || "https://flexa-app-1.onrender.com").replace(/\/$/, "");
const CHANNEL_URL = (process.env.TELEGRAM_CHANNEL_URL || process.env.CHANNEL_URL || "https://t.me/Flexa_games").trim();
const SKIP_TEXT = "رد کردن";
const CANCEL_TEXT = "لغو";
const FLEXA_ID_REQUIRED = process.env.FLEXA_ID_REQUIRED === "true" || process.env.TELEGRAM_FLEXA_ID_REQUIRED === "true";

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

const DEFAULT_RULES = `📜 قوانین خلاصه Flexa

1) Flexa پلتفرم مدیریت، ثبت‌نام، اطلاع‌رسانی، داوری و پشتیبانی تورنومنت‌های گیمینگ است.
2) مسابقات بر پایه مهارت برگزار می‌شوند؛ شرط‌بندی، تبانی مالی، خرید/فروش نتیجه یا قمار ممنوع است.
3) اطلاعات ثبت‌شده شامل شماره تماس، Flexa ID و آیدی بازی باید صحیح و متعلق به خود بازیکن باشد.
4) آیدی بازی در روز مسابقه باید با آیدی ثبت‌شده مطابقت داشته باشد.
5) استفاده از چیت، هک، اسکریپت، سوءاستفاده از باگ، جعل اسکرین‌شات یا هر ابزار غیرمجاز باعث حذف می‌شود.
6) نتیجه مسابقه طبق قوانین همان روم و با مدارک قابل بررسی ثبت می‌شود؛ داوری Flexa ملاک تصمیم نهایی است.
7) بی‌احترامی، تهدید، نشر اطلاعات شخصی، اسپم و تبلیغات بدون مجوز ممنوع است.
8) ثبت‌نام قطعی، پرداخت ورودی احتمالی، مشاهده لابی و دریافت جایزه از داخل وب‌اپ Flexa انجام می‌شود.`;

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

function normalizeFlexaId(value: string) {
  return normalizeDigits(value).trim().toUpperCase().replace(/\s+/g, "");
}

function linkCodeHash(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function generateLinkCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

function isValidFlexaId(value: string) {
  const normalized = normalizeFlexaId(value);
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
        { text: "⚡ Open Flexa Mini App", web_app: { url: APP_URL } },
        { text: "🌐 وب‌اپ", url: APP_URL },
      ],
      ...(CHANNEL_URL ? [[{ text: "📣 کانال Flexa Games", url: CHANNEL_URL }]] : []),
      [
        { text: "🏟 روم‌های فعال", callback_data: "menu:rooms" },
        { text: "🎮 پیش‌ثبت‌نام", callback_data: "menu:register" },
      ],
      [
        { text: "📜 قوانین", callback_data: "menu:rules" },
        { text: "👤 وضعیت من", callback_data: "menu:status" },
      ],
      [
        { text: "🔗 اتصال حساب", callback_data: "menu:link" },
        { text: "👤 پروفایل", callback_data: "menu:profile" },
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
    const title = (row.name || "روم Flexa").slice(0, 28);
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
  const requireMembership = process.env.TELEGRAM_REQUIRE_CHANNEL_MEMBERSHIP === "true";
  if (!requireMembership) return true;
  const result = await telegramApi("getChatMember", {
    chat_id: process.env.TELEGRAM_CHANNEL_ID || "@Flexa_games",
    user_id: Number(telegramId),
  });
  const member = result?.result as { status?: string } | undefined;
  return Boolean(member?.status && !["left", "kicked"].includes(member.status));
}

async function promptChannelMembership(chatId: number) {
  await sendMessage(chatId, "برای ادامه، اول عضو کانال رسمی Flexa Games شو و بعد دوباره تلاش کن:", {
    inline_keyboard: [
      [{ text: "📣 عضویت در کانال", url: CHANNEL_URL || "https://t.me/Flexa_games" }],
      [{ text: "✅ عضو شدم", callback_data: "menu:register" }],
    ],
  });
}

async function getLinkedUserByTelegram(telegramId: string) {
  const [row] = await db
    .select({
      userId: telegramAccounts.userId,
      flexaId: users.flexaId,
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
      displayName: fallbackName || username || "Flexa Player",
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
    "⚡ <b>خلاصه پیش‌ثبت‌نام Flexa</b>",
    "",
    `🎮 بازی: <b>${html(gameLabel(data.game))}</b>`,
    `🕹 پلتفرم: <b>${html(data.platform || "-")}</b>`,
    `👤 نام: <b>${html(data.fullName || "-")}</b>`,
    `🏷 آیدی بازی: <b>${html(data.gamerTag || "-")}</b>`,
    data.flexaId ? `🆔 Flexa ID: <code>${html(data.flexaId)}</code>` : "🆔 Flexa ID: <b>ثبت نشده</b>",
    `📞 شماره تماس: <b>${html(data.phoneNumber || "-")}</b>`,
    data.city ? `📍 شهر: <b>${html(data.city)}</b>` : "",
    data.teamName ? `👥 تیم/کلن: <b>${html(data.teamName)}</b>` : "",
  ].filter(Boolean).join("\n");
}

async function findLinkedUserId(flexaId: string | undefined, phoneNumber: string) {
  const conditions = [];
  if (flexaId) conditions.push(eq(users.flexaId, flexaId));
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
  const flexaId = data.flexaId ? normalizeFlexaId(data.flexaId) : null;
  const linkedUserId = await findLinkedUserId(flexaId || undefined, phoneNumber);
  const values = {
    telegramId: String(user.id),
    telegramUsername: user.username || null,
    telegramFirstName: user.first_name || null,
    telegramLastName: user.last_name || null,
    linkedUserId,
    flexaId,
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
      await db
        .insert(telegramReferrals)
        .values({
          referrerTelegramId,
          referredTelegramId,
          referredUsername: user.username || null,
        })
        .onConflictDoNothing({ target: telegramReferrals.referredTelegramId });
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

async function startCommand(chatId: number) {
  await sendMessage(
    chatId,
    `سلام 👋\nبه <b>Flexa — پلتفرم تورنومنت گیمینگ</b> خوش آمدی.\n\nاز اینجا می‌تونی روم‌های فعال رو ببینی، پیش‌ثبت‌نام کنی و لینک‌های مهم فلکسا رو دریافت کنی.\n\nثبت‌نام قطعی، پرداخت ورودی احتمالی، مشاهده لابی و داوری نهایی از داخل وب‌اپ انجام می‌شود.`,
    mainMenuKeyboard()
  );
}

async function linksCommand(chatId: number) {
  const rows: Array<Array<Record<string, string>>> = [
    [{ text: "⚡ وب‌اپ Flexa", url: APP_URL }],
    [{ text: "🏟 تورنومنت‌ها", url: `${APP_URL}/tournaments` }],
    [{ text: "🆕 ساخت حساب", url: `${APP_URL}/register` }],
    [{ text: "👤 پروفایل", url: `${APP_URL}/profile` }],
  ];
  if (CHANNEL_URL) rows.push([{ text: "📣 کانال Flexa Games", url: CHANNEL_URL }]);
  await sendMessage(chatId, "🔗 لینک‌های مهم Flexa:", { inline_keyboard: rows });
}

async function channelCommand(chatId: number) {
  if (!CHANNEL_URL) {
    await sendMessage(chatId, "لینک کانال هنوز تنظیم نشده است.", mainMenuKeyboard());
    return;
  }
  await sendMessage(chatId, "📣 کانال رسمی Flexa Games:", {
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
    "🎮 <b>پیش‌ثبت‌نام تلگرامی Flexa</b>\n\nبازی موردنظر را انتخاب کن.\n\nنکته: ثبت‌نام قطعی و پرداخت ورودی احتمالی از داخل وب‌اپ انجام می‌شود.",
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
    "🏟 <b>روم‌های فعال Flexa</b>",
    "",
    ...rows.map((row, index) => [
      `<b>${index + 1}. ${html(row.name || "روم Flexa")}</b>`,
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
    await sendMessage(chatId, "برای ثبت‌نام مستقیم، اول حساب تلگرامت را با /link به Flexa وصل کن.", {
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
  const player = await getOrCreateUserPlayer(linked.userId, linked.displayName || linked.username || "Flexa Player", linked.username);

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
      const balance = bigIntFromText(wallet.balance);
      if (balance < finalEntryFeeRial) return { ok: false as const, code: "INSUFFICIENT", balance, finalEntryFeeRial };
      const nextBalance = balance - finalEntryFeeRial;
      await tx.update(wallets).set({ balance: nextBalance.toString(), updatedAt: new Date() }).where(eq(wallets.id, wallet.id));
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

    await tx.insert(registrations).values({ tournamentId, playerId: player.id, visibleUserId: linked.userId });
    return { ok: true as const, paymentText };
  });

  if (!result.ok) {
    if (result.code === "FULL") return sendMessage(chatId, "ظرفیت این تورنومنت تکمیل شده است. می‌خواهی در لیست انتظار قرار بگیری؟", {
      inline_keyboard: [[{ text: "🕒 ورود به لیست انتظار", callback_data: `waitlist:${tournament.id}` }]],
    });
    if (result.code === "DUPLICATE") {
      return sendMessage(chatId, "شما قبلاً در این تورنومنت ثبت‌نام کرده‌اید.", {
        inline_keyboard: [[{ text: "مشاهده تورنومنت", url: `${APP_URL}/tournaments/${tournament.id}` }]],
      });
    }
    if (result.code === "INSUFFICIENT") {
      return sendMessage(chatId, `موجودی کیف پول کافی نیست.\nمبلغ لازم: <b>${html(formatTomanFromRial(result.finalEntryFeeRial || entryFeeRial))}</b>\nموجودی شما: <b>${html(formatTomanFromRial(result.balance || BigInt(0)))}</b>`, {
        inline_keyboard: [[{ text: "شارژ کیف پول", url: `${APP_URL}/wallet` }], [{ text: "مشاهده تورنومنت", url: `${APP_URL}/tournaments/${tournament.id}` }]],
      });
    }
    return sendMessage(chatId, "ثبت‌نام انجام نشد.");
  }

  await evaluateUserAchievements(linked.userId).catch(() => undefined);
  const xpText = await rewardUserXP(linked.userId, isPaid ? 25 : 15, isPaid ? "ثبت‌نام پولی" : "ثبت‌نام تورنومنت");

  await sendMessage(chatId, `✅ ثبت‌نام شما در تورنومنت انجام شد.\n\n🏆 <b>${html(tournament.name)}</b>\n🎮 ${html(gameLabel(tournament.game))}${result.paymentText}${xpText}`, {
    inline_keyboard: [[{ text: "مشاهده تورنومنت", url: `${APP_URL}/tournaments/${tournament.id}` }]],
  });
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
      row.flexaId ? `Flexa ID: <code>${html(row.flexaId)}</code>` : "Flexa ID: ثبت نشده",
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
      flexaId: users.flexaId,
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

  const alreadyLinked = existing?.flexaId
    ? `\n\nاکنون به حساب <b>${html(existing.displayName || "Flexa")}</b> با Flexa ID <code>${html(existing.flexaId)}</code> لینک هستی. اگر کد جدید را در حساب دیگری وارد کنی، اتصال منتقل می‌شود.`
    : "";

  await sendMessage(
    chatId,
    [
      "🔗 <b>اتصال حساب تلگرام به Flexa</b>",
      "",
      "کد زیر را داخل سایت Flexa، صفحه پروفایل، بخش «اتصال تلگرام» وارد کن:",
      "",
      `<code>${code}</code>`,
      "",
      "⏳ اعتبار کد: ۱۰ دقیقه",
      alreadyLinked,
      "",
      "اگر هنوز حساب Flexa نداری، اول ثبت‌نام کن و بعد همین کد را وارد کن.",
    ].join("\n"),
    {
      inline_keyboard: [
        [{ text: "👤 ورود به پروفایل و وارد کردن کد", url: `${APP_URL}/profile` }],
        [{ text: "🆕 ساخت حساب Flexa", url: `${APP_URL}/register` }],
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
      userFlexaId: users.flexaId,
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

  if (linked?.userFlexaId) {
    const lines = [
      "👤 <b>پروفایل Flexa شما</b>",
      "",
      "✅ حساب تلگرام به حساب وب‌اپ لینک شده است.",
      `نام: <b>${html(linked.displayName || "—")}</b>`,
      `Username: <b>${html(linked.username || "—")}</b>`,
      `Flexa ID: <code>${html(linked.userFlexaId)}</code>`,
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
      preFlexaId: telegramPreRegistrations.flexaId,
      preStatus: telegramPreRegistrations.status,
      linkedUserId: telegramPreRegistrations.linkedUserId,
      displayName: users.displayName,
      username: users.username,
      userFlexaId: users.flexaId,
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
      "هنوز حساب تلگرام شما در Flexa شناسایی نشده است. اول /register را بزن یا در وب‌اپ حساب بساز.",
      mainMenuKeyboard()
    );
    return;
  }

  const lines = [
    "👤 <b>پروفایل Flexa شما</b>",
    "",
    row.linkedUserId ? "✅ حساب تلگرام به حساب وب‌اپ لینک شده است." : "⚠️ حساب وب‌اپ هنوز کامل لینک نشده؛ با Flexa ID/شماره مشابه در سایت ثبت‌نام کن.",
    `نام: <b>${html(row.displayName || row.preFullName)}</b>`,
    `Username: <b>${html(row.username || "—")}</b>`,
    `Flexa ID: <code>${html(row.userFlexaId || row.preFlexaId || "—")}</code>`,
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
  if (CHANNEL_URL) keyboardRows.push([{ text: "📣 کانال Flexa Games", url: CHANNEL_URL }]);
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
    "🆕 <b>پیش‌ثبت‌نام جدید Flexa</b>",
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

async function adminCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }
  const [total] = await db.select({ value: count() }).from(telegramPreRegistrations);
  const [newItems] = await db
    .select({ value: count() })
    .from(telegramPreRegistrations)
    .where(eq(telegramPreRegistrations.status, "new"));
  await sendMessage(
    chatId,
    [
      "🛠 <b>پنل ادمین Flexa</b>",
      "",
      `کل پیش‌ثبت‌نام‌های تلگرام: <b>${total.value}</b>`,
      `جدید و پیگیری‌نشده: <b>${newItems.value}</b>`,
      "",
      "/players — آخرین پیش‌ثبت‌نام‌ها",
      "/announce متن — ارسال اطلاعیه به همه کاربران ربات",
      "/announce_game cod_mobile متن — اطلاعیه هدفمند برای یک بازی",
      "/post_latest — انتشار آخرین تورنومنت فعال در کانال",
      "",
      "مدیریت کامل از داخل پنل سایت انجام می‌شود.",
    ].join("\n"),
    { inline_keyboard: [[{ text: "ورود به پنل ادمین", url: `${APP_URL}/admin` }]] }
  );
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
      flexaId: telegramPreRegistrations.flexaId,
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
      return `${index + 1}) <b>${html(row.fullName)}</b> | ${html(gameLabel(row.game))}\n🏷 ${html(row.gamerTag)} | 🆔 ${html(row.flexaId || "—")} | ${html(username)} | ${html(row.status)}`;
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
      await sendMessage(numericId, `📢 <b>اطلاعیه Flexa</b>\n\n${html(message)}`, mainMenuKeyboard());
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
  const keyboard = rows.flatMap((row) => [
    [{ text: `جزئیات: ${row.name.slice(0, 28)}`, url: `${APP_URL}/tournaments/${row.tournamentId}` }],
    [
      { text: "✅ چک‌این", callback_data: `checkin:${row.registrationId}` },
      { text: "🏟 لابی", callback_data: `mylobby:${row.tournamentId}` },
      { text: "لغو", callback_data: `cancelreg:${row.registrationId}` },
    ],
  ]);
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
    const nextBalance = bigIntFromText(wallet.balance) + amount;
    await tx.update(wallets).set({ balance: nextBalance.toString(), updatedAt: new Date() }).where(eq(wallets.id, wallet.id));
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
    await sendMessage(chatId, "برای مشاهده کیف پول، اول حساب تلگرامت را با /link به Flexa وصل کن.", {
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
  await sendMessage(chatId, `💳 <b>کیف پول Flexa</b>\n\nموجودی: <b>${html(formatTomanFromRial(balance))}</b>\n\nآخرین تراکنش‌ها:\n${recent}`, {
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
    "🏅 <b>دستاوردهای Flexa</b>",
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
    await sendMessage(chatId, "برای ثبت تیکت پشتیبانی، اول حساب تلگرامت را با /link به Flexa وصل کن.", {
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
  await sendMessage(chatId, `🤖 <b>دستیار Flexa</b>\n\n${html(response.response)}\n\n<code>${response.provider}</code>`);
}

async function inviteCommand(chatId: number, telegramId: string) {
  const username = process.env.TELEGRAM_BOT_USERNAME || "FlexaTournamentBot";
  const link = `https://t.me/${username}?start=ref_${telegramId}`;
  const [{ value }] = await db.select({ value: count() }).from(telegramReferrals).where(eq(telegramReferrals.referrerTelegramId, telegramId));
  await sendMessage(chatId, `🎁 <b>لینک دعوت اختصاصی شما</b>\n\n${html(link)}\n\nدعوت‌های ثبت‌شده: <b>${value}</b>\n\nاین لینک را برای دوستات بفرست؛ در فاز جایزه، دعوت‌های معتبر امتیاز می‌گیرند.`, {
    inline_keyboard: [[{ text: "اشتراک‌گذاری", url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("به Flexa بپیوند و توی تورنومنت‌های گیمینگ شرکت کن!")}` }]],
  });
}

async function missionsCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  const [preReg] = await db.select({ id: telegramPreRegistrations.id }).from(telegramPreRegistrations).where(eq(telegramPreRegistrations.telegramId, telegramId)).limit(1);
  const [{ value: invites }] = await db.select({ value: count() }).from(telegramReferrals).where(eq(telegramReferrals.referrerTelegramId, telegramId));
  const channelMember = await isChannelMember(telegramId);
  await sendMessage(chatId, [
    "🎯 <b>مأموریت‌های Flexa</b>",
    "",
    `${channelMember ? "✅" : "⬜"} عضویت در کانال Flexa Games`,
    `${linked ? "✅" : "⬜"} اتصال حساب با /link`,
    `${preReg ? "✅" : "⬜"} پیش‌ثبت‌نام در ربات`,
    `${invites > 0 ? "✅" : "⬜"} دعوت حداقل یک نفر با /invite`,
    "",
    "جایزه XP/اعتبار برای مأموریت‌ها در فاز بعدی فعال می‌شود.",
  ].join("\n"), mainMenuKeyboard());
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
    .select({ displayName: users.displayName, username: users.username, flexaId: users.flexaId, rankPoints: users.rankPoints, level: users.level })
    .from(users)
    .orderBy(desc(users.rankPoints))
    .limit(10);
  const text = [
    "🏆 <b>لیدربورد Flexa</b>",
    "",
    ...rows.map((row, index) => `${index + 1}) <b>${html(row.displayName || row.username)}</b> — RP <b>${row.rankPoints}</b> | Lv ${row.level}\n<code>${html(row.flexaId)}</code>`),
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
  await sendMessage(chatId, `🎁 <b>جایزه روزانه Flexa</b>\n\nامروز گرفتی:${xpText}`);
}

async function quizCommand(chatId: number) {
  await sendMessage(chatId, "🧠 کوییز Flexa\n\nکدام مورد برای شرکت در تورنومنت ضروری‌تر است؟", {
    inline_keyboard: [
      [{ text: "آیدی بازی صحیح", callback_data: "quiz:correct" }],
      [{ text: "چند اکانت همزمان", callback_data: "quiz:wrong" }],
      [{ text: "ارسال نتیجه جعلی", callback_data: "quiz:wrong" }],
    ],
  });
}

async function handleQuizAnswer(chatId: number, telegramId: string, correct: boolean) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!correct) return sendMessage(chatId, "❌ جواب درست نبود. آیدی بازی صحیح مهم‌ترین مورد است.");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
  const key = `quiz:${today}:${telegramId}`;
  const [existing] = await db.select({ id: telegramSentNotifications.id }).from(telegramSentNotifications).where(eq(telegramSentNotifications.dedupeKey, key)).limit(1);
  if (existing) return sendMessage(chatId, "✅ درست بود! امتیاز امروز را قبلاً گرفته‌ای.");
  await db.insert(telegramSentNotifications).values({ dedupeKey: key, telegramId, type: "quiz" });
  const xpText = linked?.userId ? await rewardUserXP(linked.userId, 20, "کوییز روزانه") : "";
  await sendMessage(chatId, `✅ درست بود!${xpText || ""}`);
}

async function healthCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const started = Date.now();
  let dbStatus = "OK";
  try { await db.select({ value: count() }).from(users); } catch { dbStatus = "ERROR"; }
  const webhook = await telegramApi("getWebhookInfo", {});
  const ms = Date.now() - started;
  await sendMessage(chatId, `🩺 <b>Health Flexa</b>\n\nDB: <b>${dbStatus}</b>\nTelegram Webhook: <b>${webhook?.ok ? "OK" : "ERROR"}</b>\nAI Keys: <b>${process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY ? "Configured" : "Local fallback"}</b>\nLatency: <b>${ms}ms</b>`);
}

async function exportTelegramCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const rows = await db.select().from(telegramPreRegistrations).orderBy(desc(telegramPreRegistrations.updatedAt)).limit(1000);
  const headers = ["telegramId", "username", "fullName", "phone", "flexaId", "game", "platform", "gamerTag", "status", "createdAt"];
  const csv = [headers.join(","), ...rows.map((r) => [r.telegramId, r.telegramUsername || "", r.fullName, r.phoneNumber, r.flexaId || "", r.game, r.platform || "", r.gamerTag, r.status, r.createdAt.toISOString()].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
  await sendDocument(chatId, "\ufeff" + csv, `telegram_registrations_${Date.now()}.csv`, "خروجی پیش‌ثبت‌نام‌های تلگرام");
}

async function couponCommand(chatId: number, telegramId: string, code: string) {
  const value = code.trim().toUpperCase();
  if (!value) return sendMessage(chatId, "کد تخفیف را بعد از دستور وارد کن. مثال: <code>/coupon FLEXA50</code>");
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
    chat_id: process.env.TELEGRAM_CHANNEL_ID || "@Flexa_games",
    question: q,
    options: ["COD Mobile", "Clash Royale", "Fortnite"],
    is_anonymous: false,
  });
  await sendMessage(chatId, "✅ نظرسنجی در کانال ارسال شد.");
}

async function shopCommand(chatId: number) {
  await sendMessage(chatId, "🛒 فروشگاه Flexa\n\nفعلاً خرید از داخل وب‌اپ انجام می‌شود. آیتم‌های پیشنهادی: بلیت تورنومنت، Badge، بسته XP و آیتم‌های ویژه.", {
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
    return sendMessage(chatId, "✅ نتیجه مسابقه تأیید و مسابقه تکمیل شد.");
  }
  await sendMessage(chatId, `Match ID: <code>${html(match.id)}</code>\nStatus: <b>${html(match.status)}</b>`);
}

async function handleCommand(message: TelegramMessage, text: string) {
  const chatId = message.chat.id;
  const user = message.from;
  if (!user) return;
  const telegramId = String(user.id);
  const [command, ...args] = text.trim().split(/\s+/);
  const normalizedCommand = command.split("@")[0].toLowerCase();

  if (normalizedCommand === "/start") {
    await recordReferralIfNeeded(user, args[0]);
    return startCommand(chatId);
  }
  if (normalizedCommand === "/help") return startCommand(chatId);
  if (normalizedCommand === "/links") return linksCommand(chatId);
  if (normalizedCommand === "/channel") return channelCommand(chatId);
  if (normalizedCommand === "/link") return linkCommand(chatId, user);
  if (normalizedCommand === "/profile") return profileCommand(chatId, telegramId);
  if (normalizedCommand === "/wallet") return walletCommand(chatId, telegramId);
  if (normalizedCommand === "/achievements") return achievementsCommand(chatId, telegramId);
  if (normalizedCommand === "/my_tournaments") return myTournamentsCommand(chatId, telegramId);
  if (normalizedCommand === "/daily") return dailyCommand(chatId, telegramId);
  if (normalizedCommand === "/quiz") return quizCommand(chatId);
  if (normalizedCommand === "/coupon") return couponCommand(chatId, telegramId, args.join(" "));
  if (normalizedCommand === "/shop") return shopCommand(chatId);
  if (normalizedCommand === "/invite") return inviteCommand(chatId, telegramId);
  if (normalizedCommand === "/missions") return missionsCommand(chatId, telegramId);
  if (normalizedCommand === "/leaderboard") return leaderboardCommand(chatId);
  if (normalizedCommand === "/ai") return aiCommand(chatId, args.join(" "), telegramId);
  if (normalizedCommand === "/support") return supportStartCommand(chatId, telegramId);
  if (normalizedCommand === "/matches") return matchesCommand(chatId, telegramId);
  if (normalizedCommand === "/checkin") return checkInCommand(chatId, telegramId);
  if (normalizedCommand === "/judge") return judgeCommand(chatId, telegramId);
  if (normalizedCommand === "/health") return healthCommand(chatId, telegramId);
  if (normalizedCommand === "/export_telegram") return exportTelegramCommand(chatId, telegramId);
  if (normalizedCommand === "/poll") return pollCommand(chatId, telegramId, args.join(" "));
  if (normalizedCommand === "/rules") return rulesCommand(chatId);
  if (normalizedCommand === "/rooms") return roomsCommand(chatId, args.join(" "));
  if (normalizedCommand === "/register") return registerStart(chatId, telegramId);
  if (normalizedCommand === "/status") return statusCommand(chatId, telegramId);
  if (normalizedCommand === "/unregister") return unregisterCommand(chatId, telegramId);
  if (normalizedCommand === "/admin" || normalizedCommand === "/stats") return adminCommand(chatId, telegramId);
  if (normalizedCommand === "/players") return playersCommand(chatId, telegramId);
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
      inline_keyboard: [[{ text: "مرکز پشتیبانی", url: `${APP_URL}/support` }]],
    });
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
    await setSession(telegramId, "flexa_id", data);
    await sendMessage(
      chatId,
      FLEXA_ID_REQUIRED
        ? `Flexa ID خودت را وارد کن؛ مثل <code>FLX-1234</code>. اگر حساب نداری اول از وب‌اپ بساز: ${html(`${APP_URL}/register`)}`
        : `اگر در وب‌اپ Flexa حساب داری، Flexa ID خودت را وارد کن؛ مثل <code>FLX-1234</code>. اگر هنوز حساب نداری، «رد کردن» را بزن.`,
      FLEXA_ID_REQUIRED ? removeKeyboard() : replyKeyboard([[SKIP_TEXT], [CANCEL_TEXT]])
    );
    return;
  }

  if (session.state === "flexa_id") {
    if (text === SKIP_TEXT && !FLEXA_ID_REQUIRED) {
      data.flexaId = "";
    } else if (!isValidFlexaId(text)) {
      await sendMessage(chatId, "Flexa ID معتبر نیست. نمونه درست: <code>FLX-1234</code>", FLEXA_ID_REQUIRED ? undefined : replyKeyboard([[SKIP_TEXT], [CANCEL_TEXT]]));
      return;
    } else {
      data.flexaId = normalizeFlexaId(text);
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

  if (data === "menu:rooms") return roomsCommand(chatId);
  if (data === "menu:register") return registerStart(chatId, telegramId);
  if (data.startsWith("join:")) return joinTournamentFromTelegram(chatId, telegramId, data.replace("join:", ""));
  if (data.startsWith("waitlist:")) return joinWaitlist(chatId, telegramId, data.replace("waitlist:", ""));
  if (data === "menu:rules") return rulesCommand(chatId);
  if (data === "menu:status") return statusCommand(chatId, telegramId);
  if (data === "menu:link") return linkCommand(chatId, callback.from);
  if (data === "menu:profile") return profileCommand(chatId, telegramId);
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
  if (data.startsWith("quiz:")) return handleQuizAnswer(chatId, telegramId, data.endsWith(":correct"));
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
    if (messageId) await editMessage(chatId, messageId, `پلتفرم انتخاب شد: <b>${html(platform)}</b>\n\nنام نمایشی Flexa یا نام و نام‌خانوادگی خودت را بنویس:`);
    else await sendMessage(chatId, "نام نمایشی Flexa یا نام و نام‌خانوادگی خودت را بنویس:");
    return;
  }

  if (data === "reg:confirm") {
    const session = await getSession(telegramId);
    const required = [session.data.game, session.data.platform, session.data.fullName, session.data.gamerTag, session.data.phoneNumber];
    if (FLEXA_ID_REQUIRED) required.push(session.data.flexaId);
    if (session.state !== "confirm" || required.some((value) => !value)) {
      await sendMessage(chatId, "بخشی از اطلاعات ناقص است. لطفاً /register را دوباره شروع کن.", mainMenuKeyboard());
      return;
    }

    await savePreRegistration(callback.from, session.data);
    await clearSession(telegramId);
    const text = `✅ پیش‌ثبت‌نام شما با موفقیت داخل پنل Flexa ثبت شد.\n\n${registrationSummary(session.data)}\n\nبرای ثبت‌نام قطعی در روم، پرداخت ورودی احتمالی و مشاهده لابی وارد وب‌اپ شو.`;
    if (messageId) await editMessage(chatId, messageId, text, {
      inline_keyboard: [
        [{ text: "🏆 تکمیل ثبت‌نام در وب‌اپ", url: `${APP_URL}/tournaments` }],
        [{ text: "👤 پروفایل Flexa", url: `${APP_URL}/profile` }],
      ],
    });
    else await sendMessage(chatId, text, mainMenuKeyboard());
  }
}

async function handleUpdate(update: TelegramUpdate) {
  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }

  const message = update.message;
  if (!message?.from) return;
  const text = message.text || "";

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
    webhook: "Flexa Telegram webhook",
    setWebhookUrl: `https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=${APP_URL}/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>`,
  });
}
