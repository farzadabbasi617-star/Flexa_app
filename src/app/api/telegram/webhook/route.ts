import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { and, count, desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { registrations, telegramBotSessions, telegramPreRegistrations, tournaments, users } from "@/db/schema";
import { normalizeDigits, normalizePhoneNumber } from "@/lib/phone";
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
  | "confirm";

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
  const rows: Array<Array<Record<string, string>>> = [
      [{ text: "⚡ ورود به وب‌اپ Flexa", url: APP_URL }],
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
        { text: "🆕 ساخت حساب", url: `${APP_URL}/register` },
        { text: "👤 پروفایل", url: `${APP_URL}/profile` },
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

function roomsKeyboard(rows: Array<{ id: string; name: string | null }>) {
  const keyboard: Array<Array<Record<string, string>>> = [[{ text: "🌐 مشاهده همه روم‌ها در وب‌اپ", url: `${APP_URL}/tournaments` }]];
  for (const row of rows.slice(0, 5)) {
    keyboard.push([{ text: `جزئیات: ${(row.name || "روم Flexa").slice(0, 32)}`, url: `${APP_URL}/tournaments/${row.id}` }]);
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

  const result = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
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

async function profileCommand(chatId: number, telegramId: string) {
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

async function handleCommand(message: TelegramMessage, text: string) {
  const chatId = message.chat.id;
  const user = message.from;
  if (!user) return;
  const telegramId = String(user.id);
  const [command, ...args] = text.trim().split(/\s+/);
  const normalizedCommand = command.split("@")[0].toLowerCase();

  if (normalizedCommand === "/start") return startCommand(chatId);
  if (normalizedCommand === "/help") return startCommand(chatId);
  if (normalizedCommand === "/links") return linksCommand(chatId);
  if (normalizedCommand === "/channel") return channelCommand(chatId);
  if (normalizedCommand === "/profile") return profileCommand(chatId, telegramId);
  if (normalizedCommand === "/rules") return rulesCommand(chatId);
  if (normalizedCommand === "/rooms") return roomsCommand(chatId, args.join(" "));
  if (normalizedCommand === "/register") return registerStart(chatId, telegramId);
  if (normalizedCommand === "/status") return statusCommand(chatId, telegramId);
  if (normalizedCommand === "/unregister") return unregisterCommand(chatId, telegramId);
  if (normalizedCommand === "/admin" || normalizedCommand === "/stats") return adminCommand(chatId, telegramId);
  if (normalizedCommand === "/players") return playersCommand(chatId, telegramId);
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
  if (data === "menu:rules") return rulesCommand(chatId);
  if (data === "menu:status") return statusCommand(chatId, telegramId);

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
