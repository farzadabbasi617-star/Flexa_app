import { telegramApi } from "@/lib/telegram";
import { CHANNEL_URL } from "./config";
import { getTelegramSetting } from "./settings";
import { sendMessage } from "./transport";

export async function isChannelMember(telegramId: string) {
  const setting = await getTelegramSetting("telegram_require_channel_membership", "");
  const requireMembership = setting ? setting === "true" : process.env.TELEGRAM_REQUIRE_CHANNEL_MEMBERSHIP === "true";
  if (!requireMembership) return true;

  const result = await telegramApi<{ status?: string }>("getChatMember", {
    chat_id: process.env.TELEGRAM_CHANNEL_ID || "@Gament_games",
    user_id: Number(telegramId),
  });
  const member = result.ok ? result.result : undefined;
  return Boolean(member?.status && !["left", "kicked"].includes(member.status));
}

export async function promptChannelMembership(chatId: number) {
  await sendMessage(chatId, "برای ادامه، اول عضو کانال رسمی Gament Games شو و بعد دوباره تلاش کن:", {
    inline_keyboard: [
      [{ text: "📣 عضویت در کانال", url: CHANNEL_URL || "https://t.me/Gament_games" }],
      [{ text: "✅ عضو شدم", callback_data: "menu:register" }],
    ],
  });
}
