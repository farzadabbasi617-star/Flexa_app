import { db } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { honors, newsReviews } from "@/db/schema";
import logger from "@/lib/logger";
import {
  getTelegramAdminIds,
  getTelegramChannelChatId,
  getTelegramNewsTargets,
} from "@/lib/telegram";

/**
 * Review-then-publish for generated gaming news.
 *
 * The scheduled sweep (`generateDailyGamingNews`) used to publish every news
 * item straight to the Telegram channel. That is no longer what the owner
 * wants: each generated news is now *sent for approval* to the owner/admin
 * chat, and only published to the channel after the owner presses
 * "انتشار در کانال" (or a typo-corrected caption is applied first).
 *
 * This module owns that workflow: the physical `news_reviews` table, sending
 * a review message, resolving a review by an inline callback or a reply, and
 * publishing the (possibly corrected) caption to every configured target.
 */

// --- ensure the physical table exists (missing migrations safety net) -------
let newsReviewSchemaReady: Promise<void> | null = null;

async function createNewsReviewSchema(client: any = db) {
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS news_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    honor_id uuid NOT NULL REFERENCES honors(id),
    reviewer_chat_id bigint NOT NULL,
    reviewer_message_id bigint,
    reviewer_telegram_id varchar(32),
    has_photo boolean NOT NULL DEFAULT false,
    corrected_caption text,
    status varchar(16) NOT NULL DEFAULT 'pending',
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  );`));
  // Repair a table that may have been created before a later column was added.
  await client.execute(sql.raw(`ALTER TABLE news_reviews ADD COLUMN IF NOT EXISTS corrected_caption text;`));
  await client.execute(sql.raw(`ALTER TABLE news_reviews ADD COLUMN IF NOT EXISTS has_photo boolean NOT NULL DEFAULT false;`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS news_reviews_honor_idx ON news_reviews(honor_id);`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS news_reviews_reply_idx ON news_reviews(reviewer_chat_id, reviewer_message_id);`));
}

export function ensureNewsReviewSchema(client: any = db) {
  if (client === db) {
    if (!newsReviewSchemaReady) {
      newsReviewSchemaReady = createNewsReviewSchema(client).catch((err) => {
        newsReviewSchemaReady = null;
        throw err;
      });
    }
    return newsReviewSchemaReady;
  }
  return createNewsReviewSchema(client);
}

// --- helpers -----------------------------------------------------------------
const APP_URL = (process.env.APP_URL || "https://www.gament1.ir").replace(/\/$/, "");

/**
 * The review/publish channel lives on the *Add_members* bot
 * (GAMING_NEWS_REVIEW_BOT_TOKEN = @NewAdd_members_bot), because that bot — not
 * the site's FlexaTournamentBot — is the administrator of @Flexa_games and is
 * the bot the owner actually uses. All review + channel sends go through it.
 */
function reviewBotToken(): string {
  return (process.env.GAMING_NEWS_REVIEW_BOT_TOKEN || process.env.BOT_TOKEN || "").trim();
}

async function reviewBotApi<T = { message_id?: number }>(
  method: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; result?: T; description?: string }> {
  const token = reviewBotToken();
  if (!token) return { ok: false, description: "GAMING_NEWS_REVIEW_BOT_TOKEN missing" };
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await response.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  return { ok: Boolean(json.ok), result: json.result, description: json.description };
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

export interface NewsReviewHonor {
  id: string;
  title: string;
  description: string;
  game?: string | null;
  imageUrl?: string | null;
}

/**
 * The caption published to the channel (and shown as the review preview).
 * Kept under Telegram's 1024-character photo-caption limit: `descLimit` lets a
 * caller trim the description for a preview that also carries a review note.
 */
export function buildNewsCaption(honor: NewsReviewHonor, opts: { descLimit?: number } = {}): string {
  const descLimit = opts.descLimit ?? 650;
  const game = honor.game ? `\n🎮 بازی: <b>${html(gameLabel(honor.game))}</b>` : "";
  const body = html((honor.description || "").trim().slice(0, descLimit));
  return [
    "🏛 <b>خبر جدید در تالار افتخارات Gament</b>",
    "",
    `🔥 <b>${String(honor.title || "").slice(0, 160)}</b>`,
    game,
    "",
    body,
    "",
    "برای دیدن جزئیات، لایک و سین خبر وارد Gament شو 👇",
  ].filter(Boolean).join("\n");
}

function reviewKeyboard(honorId: string) {
  return {
    inline_keyboard: [[
      { text: "✅ انتشار در کانال", callback_data: `news:approve:${honorId}` },
      { text: "✏️ اصلاح متن", callback_data: `news:edit:${honorId}` },
      { text: "❌ رد خبر", callback_data: `news:reject:${honorId}` },
    ]],
  };
}

function channelKeyboard(honorId: string) {
  // Channel posts only support `url` buttons — `web_app` buttons are not allowed
  // in channels and return BUTTON_TYPE_INVALID, which previously made every
  // channel publish fail.
  return {
    inline_keyboard: [[
      { text: "مشاهده در تالار افتخارات", url: `${APP_URL}/honors/${honorId}` },
      { text: "ورود به Gament", url: APP_URL },
    ]],
  };
}

// --- sending a news item for approval ---------------------------------------
export async function sendNewsForApproval(honor: NewsReviewHonor): Promise<{ sent: number; reviewers: number }> {
  await ensureNewsReviewSchema();
  const adminIds = getTelegramAdminIds();
  if (!adminIds.length) {
    // Honor "never publish without review": with no reviewer configured we must
    // NOT fall back to auto-publishing. Log loudly instead.
    logger.warn({ honorId: honor.id }, "No TELEGRAM_ADMIN_IDS configured; news kept on-site only, NOT auto-published");
    return { sent: 0, reviewers: 0 };
  }

  const preview = buildNewsCaption(honor, { descLimit: 430 });
  const note = "\n\n⚖️ <b>در انتظار تأیید تو برای کانال</b>\nبرای اصلاح متن، همان را Reply کن؛ سپس دکمه انتشار را بزن.";
  const caption = `${preview}${note}`.slice(0, 1020);
  const keyboard = reviewKeyboard(honor.id);
  let sent = 0;

  for (const adminId of adminIds) {
    const chatId = Number(adminId);
    if (!Number.isFinite(chatId)) continue;
    try {
      let messageId: number | undefined;
      let hasPhoto = false;
      if (honor.imageUrl) {
        const photo = await reviewBotApi("sendPhoto", {
          chat_id: chatId,
          photo: honor.imageUrl,
          caption,
          parse_mode: "HTML",
          reply_markup: keyboard,
        });
        const result = photo.ok ? (photo.result as { message_id?: number }) : undefined;
        if (photo.ok && result?.message_id) {
          messageId = Number(result.message_id);
          hasPhoto = true;
        }
      }
      if (!messageId) {
        const msg = await reviewBotApi("sendMessage", {
          chat_id: chatId,
          text: caption,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: keyboard,
        });
        const result = msg.ok ? (msg.result as { message_id?: number }) : undefined;
        if (msg.ok && result?.message_id) messageId = Number(result.message_id);
      }
      if (messageId) {
        await upsertReviewRecord({
          honorId: honor.id,
          reviewerChatId: chatId,
          reviewerMessageId: messageId,
          reviewerTelegramId: adminId,
          hasPhoto,
        });
        sent += 1;
      } else {
        logger.warn({ adminId, honorId: honor.id }, "Telegram refused the review message (chat not found? bot blocked?)");
      }
    } catch (err) {
      logger.warn({ err, adminId, honorId: honor.id }, "Failed to send news for approval to reviewer");
    }
  }
  return { sent, reviewers: adminIds.length };
}

async function upsertReviewRecord(r: {
  honorId: string;
  reviewerChatId: number;
  reviewerMessageId: number;
  reviewerTelegramId: string;
  hasPhoto: boolean;
}) {
  try {
    await db.insert(newsReviews).values({
      honorId: r.honorId,
      reviewerChatId: r.reviewerChatId,
      reviewerMessageId: r.reviewerMessageId,
      reviewerTelegramId: r.reviewerTelegramId,
      hasPhoto: r.hasPhoto,
      status: "pending",
    }).onConflictDoNothing();
  } catch (err) {
    logger.warn({ err, honorId: r.honorId }, "Failed to record news review message");
  }
}

// --- resolving / deciding ----------------------------------------------------
export interface NewsReviewRow {
  honorId: string;
  reviewerChatId: number;
  reviewerMessageId: number | null;
  hasPhoto: boolean;
  correctedCaption: string | null;
  status: string;
}

export async function getReviewsByHonor(honorId: string): Promise<NewsReviewRow[]> {
  await ensureNewsReviewSchema();
  const rows = await db.select().from(newsReviews).where(eq(newsReviews.honorId, honorId));
  return rows.map((row) => ({
    honorId: row.honorId,
    reviewerChatId: Number(row.reviewerChatId),
    reviewerMessageId: row.reviewerMessageId === null ? null : Number(row.reviewerMessageId),
    hasPhoto: row.hasPhoto,
    correctedCaption: row.correctedCaption,
    status: row.status,
  }));
}

export async function resolveReviewByReply(chatId: number, messageId: number): Promise<NewsReviewRow | null> {
  await ensureNewsReviewSchema();
  const [row] = await db
    .select()
    .from(newsReviews)
    .where(and(eq(newsReviews.reviewerChatId, chatId), eq(newsReviews.reviewerMessageId, messageId)))
    .limit(1);
  if (!row) return null;
  return {
    honorId: row.honorId,
    reviewerChatId: Number(row.reviewerChatId),
    reviewerMessageId: row.reviewerMessageId === null ? null : Number(row.reviewerMessageId),
    hasPhoto: row.hasPhoto,
    correctedCaption: row.correctedCaption,
    status: row.status,
  };
}

export async function saveCorrectedCaption(chatId: number, messageId: number, correctedCaption: string) {
  await ensureNewsReviewSchema();
  await db
    .update(newsReviews)
    .set({ correctedCaption: correctedCaption.trim().slice(0, 1024), status: "pending", updatedAt: new Date() })
    .where(and(eq(newsReviews.reviewerChatId, chatId), eq(newsReviews.reviewerMessageId, messageId)));
}

/** Apply a corrected caption to every review row for a honour (used by the Add_members bot). */
export async function saveCorrectedCaptionForHonor(honorId: string, correctedCaption: string) {
  await ensureNewsReviewSchema();
  await db
    .update(newsReviews)
    .set({ correctedCaption: correctedCaption.trim().slice(0, 1024), status: "pending", updatedAt: new Date() })
    .where(eq(newsReviews.honorId, honorId));
}

export async function markReviewStatus(honorId: string, status: "approved" | "rejected" | "dismissed") {
  await ensureNewsReviewSchema();
  await db
    .update(newsReviews)
    .set({ status, updatedAt: new Date() })
    .where(eq(newsReviews.honorId, honorId));
}

/** The currently saved corrected caption for a honour, if any. */
export async function getCorrectedCaption(honorId: string): Promise<string | null> {
  await ensureNewsReviewSchema();
  const rows = await db.select().from(newsReviews).where(eq(newsReviews.honorId, honorId));
  const corrected = rows.find((row) => row.correctedCaption?.trim());
  return corrected ? corrected.correctedCaption : null;
}

// --- publishing to the channel targets --------------------------------------
export async function publishNewsToChannelTargets(
  honor: NewsReviewHonor,
  captionOverride?: string | null,
): Promise<{ sent: number; failed: number }> {
  const targets = [...new Set(
    [getTelegramChannelChatId(), ...getTelegramNewsTargets()].filter((value): value is string => Boolean(value)),
  )];
  const caption = (captionOverride || "").trim() || buildNewsCaption(honor);
  const replyMarkup = channelKeyboard(honor.id);

  let sent = 0;
  let failed = 0;
  for (const chatId of targets) {
    try {
      if (honor.imageUrl) {
        const photo = await reviewBotApi("sendPhoto", {
          chat_id: chatId,
          photo: honor.imageUrl,
          caption,
          parse_mode: "HTML",
          reply_markup: replyMarkup,
        });
        if (photo.ok) {
          sent += 1;
          continue;
        }
      }
      const msg = await reviewBotApi("sendMessage", {
        chat_id: chatId,
        text: caption,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: replyMarkup,
      });
      if (msg.ok) sent += 1;
      else failed += 1;
    } catch (err) {
      logger.warn({ err, chatId, honorId: honor.id }, "Failed to publish reviewed news to a Telegram target");
      failed += 1;
    }
  }
  return { sent, failed };
}

/** Load a news honour from the DB for publishing. */
export async function getHonorForPublish(honorId: string) {
  const [row] = await db
    .select({
      id: honors.id,
      title: honors.title,
      description: honors.description,
      game: honors.game,
      imageUrl: honors.imageUrl,
      type: honors.type,
    })
    .from(honors)
    .where(eq(honors.id, honorId))
    .limit(1);
  return row || null;
}
