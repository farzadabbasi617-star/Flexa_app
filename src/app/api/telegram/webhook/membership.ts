import { telegramApi } from "@/lib/telegram";
import { CHANNEL_URL } from "./config";
import { getTelegramSetting } from "./settings";
import { sendMessage } from "./transport";

const membershipCache = new Map<string, { member: boolean; expiresAt: number }>();

export async function channelMembershipRequired() {
  const setting = await getTelegramSetting("telegram_require_channel_membership", "");
  const environmentRequires = process.env.TELEGRAM_REQUIRE_CHANNEL_MEMBERSHIP === "true";
  // Membership is a product requirement in production. This deliberately
  // overrides an old false value left in Render or the settings table.
  if (process.env.NODE_ENV === "production") return true;
  return environmentRequires || setting === "true";
}

export async function isChannelMember(telegramId: string, forceRefresh = false) {
  if (!(await channelMembershipRequired())) return true;
  const cached = membershipCache.get(telegramId);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.member;

  const result = await telegramApi<{ status?: string }>("getChatMember", {
    chat_id: process.env.TELEGRAM_CHANNEL_ID || "@Gament_games",
    user_id: Number(telegramId),
  });
  const member = result.ok ? result.result : undefined;
  const isMember = Boolean(member?.status && !["left", "kicked"].includes(member.status));
  membershipCache.set(telegramId, { member: isMember, expiresAt: Date.now() + (isMember ? 60_000 : 10_000) });
  return isMember;
}

export async function promptChannelMembership(chatId: number) {
  await sendMessage(chatId, [
    "📣 <b>عضویت در کانال Gament Games الزامی است</b>",
    "",
    "برای استفاده از Flexa ابتدا عضو کانال رسمی شو؛ سپس روی «عضو شدم» بزن تا عضویتت بررسی شود.",
  ].join("\n"), {
    inline_keyboard: [
      [{ text: "📣 عضویت در کانال", url: CHANNEL_URL || "https://t.me/Gament_games" }],
      [{ text: "✅ عضو شدم؛ بررسی کن", callback_data: "membership:check" }],
    ],
  });
}
