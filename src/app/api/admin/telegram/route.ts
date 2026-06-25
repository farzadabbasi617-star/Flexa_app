import { NextRequest, NextResponse } from "next/server";
import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  couponRedemptions,
  coupons,
  registrations,
  telegramAccounts,
  telegramCampaignEvents,
  telegramPreRegistrations,
  telegramReferrals,
  tournamentWaitlist,
  transactions,
  siteSettings,
} from "@/db/schema";
import { requireAdminPermission } from "@/lib/admin-permissions";
import logger from "@/lib/logger";
import { telegramApi } from "@/lib/telegram";

export const dynamic = "force-dynamic";


const TELEGRAM_SETTING_KEYS = [
  "telegram_bot_enabled",
  "telegram_require_channel_membership",
  "telegram_wallet_deposit_enabled",
  "telegram_support_enabled",
  "telegram_missions_enabled",
  "telegram_quiz_enabled",
  "telegram_ai_enabled",
  "telegram_welcome_text",
] as const;

async function getTelegramSettings() {
  const rows = await db.select().from(siteSettings);
  const settings: Record<string, string> = {};
  for (const key of TELEGRAM_SETTING_KEYS) settings[key] = "";
  for (const row of rows) {
    if ((TELEGRAM_SETTING_KEYS as readonly string[]).includes(row.key)) settings[row.key] = row.value || "";
  }
  return settings;
}

async function saveTelegramSettings(payload: Record<string, unknown>) {
  for (const key of TELEGRAM_SETTING_KEYS) {
    if (payload[key] === undefined) continue;
    const value = typeof payload[key] === "boolean" ? (payload[key] ? "true" : "false") : String(payload[key] ?? "");
    await db
      .insert(siteSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: new Date() } });
  }
}

function appUrl() {
  return (process.env.APP_URL || "https://www.gament1.ir").replace(/\/$/, "");
}

async function setupTelegramCommands() {
  const commands = [
    { command: "start", description: "شروع و منوی اصلی Gament" },
    { command: "link", description: "اتصال حساب تلگرام به Gament" },
    { command: "wallet", description: "کیف پول و ثبت فیش واریز" },
    { command: "deposit", description: "ثبت فیش کارت‌به‌کارت" },
    { command: "rooms", description: "روم‌ها و تورنومنت‌های فعال" },
    { command: "my_tournaments", description: "تورنومنت‌های من، لابی و چک‌این" },
    { command: "matches", description: "مسابقات، نتیجه، مدرک و اعتراض" },
    { command: "support", description: "ساخت تیکت پشتیبانی" },
    { command: "missions", description: "مأموریت‌ها و پاداش XP" },
    { command: "quiz", description: "کوییز روزانه" },
    { command: "admin", description: "داشبورد ادمین" },
  ];
  const results: Record<string, unknown> = {};
  results.commands = await telegramApi("setMyCommands", { commands, scope: { type: "default" }, language_code: "fa" });
  results.menuButton = await telegramApi("setChatMenuButton", { menu_button: { type: "web_app", text: "Open Gament", web_app: { url: appUrl() } } });
  results.description = await telegramApi("setMyDescription", { description: "Gament Bot؛ کیف پول، تورنومنت، چک‌این، لابی، نتایج، پشتیبانی، مأموریت‌ها و اعلان‌های هوشمند گیمینگ.", language_code: "fa" });
  return results;
}

function isAdminError(result: { user: unknown; error: string | null | undefined }) {
  return result.error || !result.user;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "overview");
    if (isAdminError(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const [preRegs] = await db.select({ value: count() }).from(telegramPreRegistrations);
    const [linked] = await db.select({ value: count() }).from(telegramAccounts);
    const [referrals] = await db.select({ value: count() }).from(telegramReferrals);
    const [waitlist] = await db.select({ value: count() }).from(tournamentWaitlist).where(eq(tournamentWaitlist.status, "waiting"));
    const [couponUses] = await db.select({ value: count() }).from(couponRedemptions).where(eq(couponRedemptions.status, "used"));

    const telegramRevenueRows = await db
      .select({ amount: transactions.amount })
      .from(transactions)
      .where(sql`${transactions.type} = 'entry_fee' AND ${transactions.status} = 'completed' AND ${transactions.metadata}->>'kind' = 'telegram_entry_fee'`);
    const revenueToman = telegramRevenueRows.reduce((sum, row) => sum + Number((BigInt(row.amount || "0") / BigInt(10)).toString()), 0);

    const campaignRows = await db
      .select({ campaign: telegramCampaignEvents.campaign, events: count() })
      .from(telegramCampaignEvents)
      .groupBy(telegramCampaignEvents.campaign)
      .orderBy(desc(count()))
      .limit(50);

    const couponRows = await db
      .select({ code: coupons.code, discountPercent: coupons.discountPercent, usedCount: coupons.usedCount, isActive: coupons.isActive })
      .from(coupons)
      .orderBy(desc(coupons.createdAt))
      .limit(50);

    const recentPreRegs = await db
      .select({
        telegramId: telegramPreRegistrations.telegramId,
        username: telegramPreRegistrations.telegramUsername,
        fullName: telegramPreRegistrations.fullName,
        phoneNumber: telegramPreRegistrations.phoneNumber,
        game: telegramPreRegistrations.game,
        status: telegramPreRegistrations.status,
        updatedAt: telegramPreRegistrations.updatedAt,
      })
      .from(telegramPreRegistrations)
      .orderBy(desc(telegramPreRegistrations.updatedAt))
      .limit(30);

    const recentTelegramRegistrations = await db
      .select({ value: count() })
      .from(registrations)
      .innerJoin(telegramAccounts, eq(registrations.visibleUserId, telegramAccounts.userId));

    const settings = await getTelegramSettings();

    return NextResponse.json({
      settings,
      stats: {
        preRegistrations: preRegs.value,
        linkedAccounts: linked.value,
        referrals: referrals.value,
        waiting: waitlist.value,
        couponUses: couponUses.value,
        telegramRegistrations: recentTelegramRegistrations[0]?.value || 0,
        revenueToman,
      },
      campaigns: campaignRows,
      coupons: couponRows,
      recentPreRegistrations: recentPreRegs,
    });
  } catch (err) {
    logger.error({ err }, "Admin Telegram analytics failed");
    return NextResponse.json({ error: "Failed to load Telegram analytics" }, { status: 500 });
  }
}


export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "settings");
    if (isAdminError(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json().catch(() => ({}));
    if (body.action === "setup") {
      const results = await setupTelegramCommands();
      return NextResponse.json({ success: true, results });
    }
    await saveTelegramSettings(body.settings || body);
    return NextResponse.json({ success: true, settings: await getTelegramSettings() });
  } catch (err) {
    logger.error({ err }, "Admin Telegram settings update failed");
    return NextResponse.json({ error: "Failed to update Telegram settings" }, { status: 500 });
  }
}
