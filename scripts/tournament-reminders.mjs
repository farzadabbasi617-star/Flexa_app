#!/usr/bin/env node
/**
 * gament-reminders — یادآوری تلگرامی تورنومنت‌ها
 *
 * هر دقیقه توسط systemd timer اجرا می‌شود. سه فاز:
 *   reminder_30m — ۳۰ دقیقه قبل از شروع
 *   reminder_15m — ۱۵ دقیقه قبل از شروع
 *   started      — لحظه شروع (تا ۱۵ دقیقه بعد، اگر هنوز نرسیده باشد)
 *
 * گیرندگان: ثبت‌نامی‌های تورنومنت که حساب تلگرام‌شان لینک است.
 * دی‌دوپ: telegram_sent_notifications.dedupe_key = reminder:<فاز>:<تورنومنت>:<تلگرام‌آیدی>
 * اگر هیچ ثبت‌نامی نباشد، فاز مارک نمی‌شود تا ثبت‌نامی‌های بعدی هم یادآوری بگیرند.
 *
 * DRY_RUN=1 → فقط لاگ، بدون ارسال و بدون مارک.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";

const env = readFileSync("/var/www/gament/.env.production", "utf8");
const envGet = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim() : null;
};

const DBURL = envGet("DATABASE_URL");
const BOT_TOKEN = envGet("BOT_TOKEN");
const APP_URL = (envGet("APP_URL") || "https://www.gament1.ir").replace(/\/+$/, "");
const DRY = process.env.DRY_RUN === "1";
if (!DBURL) { console.error("DATABASE_URL missing"); process.exit(1); }

const PHASES = [
  { key: "reminder_30m", limitSec: 1800, text: (n) => `⏰ یادآوری گیمنت\n\n«${n}» تا ۳۰ دقیقه دیگر شروع می‌شود!\n\n📱 Room ID و رمز روم حدود ۱۵ دقیقه قبل از شروع در صفحه لابی نمایش داده می‌شود.` },
  { key: "reminder_15m", limitSec: 900,  text: (n) => `⏳ ۱۵ دقیقه تا شروع!\n\n«${n}» به‌زودی شروع می‌شود — آماده باش.\nRoom ID به‌زودی در لابی می‌آید.` },
  { key: "started",      limitSec: 900,  text: (n) => `🚀 شروع شد!\n\n«${n}» همین حالا استارت خورد.\nوارد لابی شو و چک‌این کن.`, past: true },
];

async function sendMessage(telegramId, text, lobbyUrl) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: telegramId,
      text,
      reply_markup: { inline_keyboard: [[{ text: "🎮 ورود به لابی", url: lobbyUrl }]] },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`telegram ${res.status}: ${(await res.text()).slice(0, 120)}`);
  return res.json();
}

const client = new Client({ connectionString: DBURL });
await client.connect();

try {
  const { rows: tournaments } = await client.query(
    `SELECT id, name,
            EXTRACT(EPOCH FROM (start_date - (now() AT TIME ZONE 'UTC')))::int AS remaining_sec
     FROM tournaments
     WHERE status IN ('registration', 'in_progress')
       AND start_date IS NOT NULL
       AND start_date < (now() AT TIME ZONE 'UTC') + interval '31 minutes'
       AND start_date > (now() AT TIME ZONE 'UTC') - interval '16 minutes'`
  );

  for (const t of tournaments) {
    const remainingSec = Number(t.remaining_sec);
    for (const phase of PHASES) {
      const due = phase.past
        ? remainingSec <= 0 && -remainingSec <= phase.limitSec
        : remainingSec > 0 && remainingSec <= phase.limitSec;
      if (!due) continue;

      const { rows: recipients } = await client.query(
        `SELECT DISTINCT ta.telegram_id
         FROM registrations r
         JOIN players p ON p.id = r.player_id
         JOIN telegram_accounts ta ON ta.user_id = p.user_id
         WHERE r.tournament_id = $1 AND ta.telegram_id IS NOT NULL`,
        [t.id]
      );
      if (recipients.length === 0) {
        console.log(`${t.id.slice(0, 8)} ${phase.key}: no linked recipients — skipped (not marked)`);
        continue;
      }

      const lobbyUrl = `${APP_URL}/tournaments/${t.id}/lobby`;
      let sent = 0, failed = 0;
      for (const { telegram_id } of recipients) {
        const dedupeKey = `reminder:${phase.key}:${t.id}:${telegram_id}`.slice(0, 180);
        try {
          const { rowCount } = await client.query(
            `INSERT INTO telegram_sent_notifications (dedupe_key, telegram_id, tournament_id, type)
             VALUES ($1, $2, $3, $4) ON CONFLICT (dedupe_key) DO NOTHING`,
            [dedupeKey, telegram_id, t.id, phase.key]
          );
          if (rowCount === 0) continue; // قبلاً ارسال شده
          if (DRY) { console.log(`DRY → ${telegram_id} ${phase.key}`); sent++; continue; }
          await sendMessage(telegram_id, phase.text(t.name), lobbyUrl);
          sent++;
        } catch (e) {
          failed++;
          console.error(`send fail ${telegram_id} ${phase.key}: ${e.message}`);
          // مارک شده ولی نرسیده — قابل قبول؛ ارسال دوباره فوراً ریسک اسپم دارد
        }
      }
      console.log(`${t.id.slice(0, 8)} "${t.name}" ${phase.key}: sent=${sent} failed=${failed}`);
    }
  }
  if (tournaments.length === 0) console.log("no tournament in reminder window");
} finally {
  await client.end();
}
