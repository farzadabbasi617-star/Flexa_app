import { NextRequest, NextResponse } from "next/server";
import { telegramApi } from "@/lib/telegram";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const DEFAULT_APP_URL = "https://www.gament1.ir";

function appUrl() {
  return (process.env.APP_URL || DEFAULT_APP_URL).replace(/\/$/, "");
}

function requireSetupSecret(request: NextRequest) {
  const secret = process.env.TELEGRAM_SETUP_SECRET || process.env.TELEGRAM_CRON_SECRET || process.env.CRON_SECRET || process.env.ADMIN_SETUP_SECRET || "";
  if (!secret) return { ok: false, status: 503, error: "TELEGRAM_SETUP_SECRET is not configured" };
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || request.nextUrl.searchParams.get("secret") || "";
  if (provided !== secret) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true, status: 200, error: null };
}

function commands() {
  return [
    { command: "start", description: "شروع و منوی اصلی Gament" },
    { command: "link", description: "اتصال حساب تلگرام به Gament" },
    { command: "wallet", description: "کیف پول و ثبت فیش واریز" },
    { command: "deposit", description: "ثبت فیش کارت‌به‌کارت" },
    { command: "rooms", description: "روم‌ها و تورنومنت‌های فعال" },
    { command: "my_tournaments", description: "تورنومنت‌های من، لابی و چک‌این" },
    { command: "matches", description: "مسابقات، نتیجه، مدرک و اعتراض" },
    { command: "qr", description: "ارسال QR یا Share Link کلش رویال" },
    { command: "checkin", description: "چک‌این سریع تورنومنت" },
    { command: "support", description: "ساخت تیکت پشتیبانی" },
    { command: "my_tickets", description: "تیکت‌های من" },
    { command: "missions", description: "مأموریت‌ها و پاداش XP" },
    { command: "invite", description: "لینک دعوت اختصاصی" },
    { command: "daily", description: "جایزه روزانه" },
    { command: "quiz", description: "کوییز روزانه" },
    { command: "leaderboard", description: "لیدربورد Gament" },
    { command: "achievements", description: "دستاوردها" },
    { command: "profile", description: "پروفایل متصل" },
    { command: "rules", description: "قوانین Gament" },
    { command: "ai", description: "دستیار هوشمند Gament" },
    { command: "admin", description: "داشبورد ادمین تلگرام" },
  ];
}

async function configureBot(setWebhook: boolean) {
  const url = appUrl();
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  const results: Record<string, unknown> = {};

  results.commandsDefault = await telegramApi("setMyCommands", {
    commands: commands(),
    scope: { type: "default" },
    language_code: "fa",
  });

  results.commandsAllPrivate = await telegramApi("setMyCommands", {
    commands: commands(),
    scope: { type: "all_private_chats" },
    language_code: "fa",
  });

  results.menuButton = await telegramApi("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Open Gament",
      web_app: { url },
    },
  });

  results.description = await telegramApi("setMyDescription", {
    description: "Gament Bot؛ کیف پول، تورنومنت، چک‌این، لابی، نتایج، پشتیبانی، مأموریت‌ها و اعلان‌های هوشمند گیمینگ.",
    language_code: "fa",
  });

  results.shortDescription = await telegramApi("setMyShortDescription", {
    short_description: "ربات رسمی Gament برای تورنومنت، کیف پول و پشتیبانی",
    language_code: "fa",
  });

  if (setWebhook) {
    if (!webhookSecret) {
      results.webhook = { ok: false, description: "TELEGRAM_WEBHOOK_SECRET is missing" };
    } else {
      results.webhook = await telegramApi("setWebhook", {
        url: `${url}/api/telegram/webhook`,
        secret_token: webhookSecret,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: false,
      });
    }
  }

  results.webhookInfo = await telegramApi("getWebhookInfo", {});
  return results;
}

export async function POST(request: NextRequest) {
  const auth = requireSetupSecret(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json().catch(() => ({}));
    const results = await configureBot(Boolean(body.setWebhook));
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    logger.error({ err }, "Telegram setup failed");
    return NextResponse.json({ error: "Telegram setup failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = requireSetupSecret(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const setWebhook = request.nextUrl.searchParams.get("setWebhook") === "true";
    const results = await configureBot(setWebhook);
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    logger.error({ err }, "Telegram setup failed");
    return NextResponse.json({ error: "Telegram setup failed" }, { status: 500 });
  }
}
