import type { TelegramCallbackQuery, TelegramMessage, TelegramUpdate } from "./types";
import { html } from "./utils";
import {
  answerCallback,
  editMessage,
  editMessageCaption,
  sendMessage,
} from "./transport";
import { hasAdminAccess } from "./admin-access";
import {
  getCorrectedCaption,
  getHonorForPublish,
  getReviewsByHonor,
  markReviewStatus,
  publishNewsToChannelTargets,
  resolveReviewByReply,
  saveCorrectedCaption,
} from "@/lib/news-review";
import logger from "@/lib/logger";

/**
 * Owner review actions for generated gaming news.
 *
 * Buttons on the review message:
 *   news:approve:<honorId>  → publish to channel (with any corrected caption)
 *   news:edit:<honorId>     → ask the owner to Reply with corrected text
 *   news:reject:<honorId>   → mark rejected (channel is not touched)
 *
 * The owner may also simply Reply to the review message with corrected text;
 * handleNewsReviewReply captures that and stores the corrected caption.
 */

type NewsCallbackAction = "approve" | "edit" | "reject";

function parseNewsCallback(data: string): { action: NewsCallbackAction; honorId: string } | null {
  const match = data.match(/^news:(approve|edit|reject):([0-9a-f-]{36})$/i);
  if (!match) return null;
  return { action: match[1] as NewsCallbackAction, honorId: match[2] };
}

/** Rewrite a photo/text review message to its final state and drop the buttons. */
async function finalizeReviewMessage(honorId: string, finalCaption: string) {
  const rows = await getReviewsByHonor(honorId).catch(() => []);
  for (const row of rows) {
    if (!row.reviewerMessageId) continue;
    const options = { inline_keyboard: [] as unknown[] };
    try {
      if (row.hasPhoto) {
        await editMessageCaption(row.reviewerChatId, row.reviewerMessageId, finalCaption, options);
      } else {
        await editMessage(row.reviewerChatId, row.reviewerMessageId, finalCaption, options);
      }
    } catch (err) {
      // The message may already be gone (deleted) or the caption changed; either
      // way the decision is already recorded, so this is non-fatal.
      logger.warn({ err, honorId, chatId: row.reviewerChatId, messageId: row.reviewerMessageId }, "Failed to finalize news review message");
    }
  }
}

export async function handleNewsReviewCallback(callback: TelegramCallbackQuery): Promise<boolean> {
  const data = callback.data || "";
  const parsed = parseNewsCallback(data);
  if (!parsed) return false;

  const telegramId = String(callback.from.id);
  const chatId = callback.message?.chat.id;
  const messageId = callback.message?.message_id;
  const { action, honorId } = parsed;

  // Only the configured owner/admin may approve, edit or reject.
  if (!hasAdminAccess(telegramId)) {
    await answerCallback(callback.id, "⛔ فقط ادمین گمنت به این دکمه دسترسی دارد.", true).catch(() => undefined);
    return true;
  }

  try {
    if (action === "approve") {
      await approveReview(callback, honorId);
    } else if (action === "edit") {
      await answerCallback(callback.id, "همین پیام را Reply کن و متن اصلاحشده را بفرست.", true).catch(() => undefined);
      if (chatId) {
        await sendMessage(chatId, "✏️ همین خبر را Reply کن و متن کامل اصلاحشده را بفرست؛ بعد دکمه «انتشار در کانال» را بزن.").catch(() => undefined);
      }
    } else if (action === "reject") {
      await markReviewStatus(honorId, "rejected");
      await finalizeReviewMessage(honorId, "🚫 <b>رد شد — در کانال منتشر نشد.</b>");
      await answerCallback(callback.id, "خبر رد شد.", false).catch(() => undefined);
    }
  } catch (err) {
    logger.error({ err, action, honorId, telegramId }, "News review callback failed");
    await answerCallback(callback.id, "خطا در بررسی خبر. دوباره تلاش کن.", true).catch(() => undefined);
  }
  return true;
}

async function approveReview(callback: TelegramCallbackQuery, honorId: string) {
  const honor = await getHonorForPublish(honorId);
  if (!honor) {
    await answerCallback(callback.id, "خبر پیدا نشد (شاید حذف شده).", true).catch(() => undefined);
    return;
  }

  const existing = await getReviewsByHonor(honorId);
  if (existing.some((row) => row.status === "approved")) {
    await answerCallback(callback.id, "این خبر قبلاً در کانال منتشر شده است.", true).catch(() => undefined);
    return;
  }

  const corrected = await getCorrectedCaption(honorId);
  const result = await publishNewsToChannelTargets(
    { id: honor.id, title: honor.title, description: honor.description, game: honor.game, imageUrl: honor.imageUrl },
    corrected,
  );

  if (result.sent > 0) {
    await markReviewStatus(honorId, "approved");
    await finalizeReviewMessage(honorId, "✅ <b>در کانال منتشر شد.</b>");
    await answerCallback(callback.id, "✅ خبر در کانال منتشر شد.", false).catch(() => undefined);
  } else {
    await answerCallback(callback.id, "انتشار ناموفق بود (کانال با خطا مواجه شد). دوباره تلاش کن.", true).catch(() => undefined);
  }
}

export async function handleNewsReviewReply(message: TelegramMessage): Promise<boolean> {
  // Detect a Reply to one of our review messages, sent by the owner/admin.
  const reply = (message as TelegramMessage & { reply_to_message?: TelegramMessage }).reply_to_message;
  if (!reply) return false;
  if (!message.text?.trim()) return false;
  if (!message.from) return false;

  const telegramId = String(message.from.id);
  if (!hasAdminAccess(telegramId)) return false;

  const chatId = message.chat.id;
  const review = await resolveReviewByReply(chatId, reply.message_id);
  if (!review) return false;

  await saveCorrectedCaption(chatId, reply.message_id, message.text);
  await sendMessage(
    chatId,
    "✏️ <b>متن اصلاح‌شده ذخیره شد.</b>\n\nحالا دکمه <b>«✅ انتشار در کانال»</b> را بزن تا همین متن (به‌جای نسخه قبلی) در کانال منتشر شود.",
  ).catch(() => undefined);
  return true;
}

// Re-exported so the caller can pass an update directly and stay type-safe.
export async function handleNewsReviewUpdate(update: TelegramUpdate): Promise<boolean> {
  if (update.callback_query) {
    return handleNewsReviewCallback(update.callback_query);
  }
  if (update.message) {
    return handleNewsReviewReply(update.message);
  }
  return false;
}
