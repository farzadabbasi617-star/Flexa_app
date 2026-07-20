import { APP_URL, CHANNEL_URL, GAME_OPTIONS, PLATFORM_OPTIONS } from "./config";

export function replyKeyboard(rows: string[][]) {
  return {
    keyboard: rows,
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

export function removeKeyboard() {
  return { remove_keyboard: true };
}

export function mainMenuKeyboard() {
  const rows: Array<Array<Record<string, unknown>>> = [
    [
      { text: "⚡ Open Gament Mini App", web_app: { url: APP_URL } },
      { text: "🌐 وب‌اپ", url: APP_URL },
    ],
    ...(CHANNEL_URL ? [[{ text: "📣 کانال Gament Games", url: CHANNEL_URL }]] : []),
    [{ text: "🏟 روم‌های فعال", callback_data: "menu:rooms" }, { text: "🎮 پیش‌ثبت‌نام", callback_data: "menu:register" }],
    [{ text: "💳 کیف پول", callback_data: "menu:wallet" }, { text: "🏆 تورنومنت‌های من", callback_data: "menu:my_tournaments" }],
    [{ text: "✅ چک‌این", callback_data: "menu:checkin" }, { text: "⚔️ مسابقات من", callback_data: "menu:matches" }],
    [{ text: "⚔️ 1V1 کلش رویال", callback_data: "menu:clash_qr" }, { text: "🏅 کلش چندنفره", callback_data: "menu:clash_private" }],
    [{ text: "🎯 مأموریت‌ها", callback_data: "menu:missions" }, { text: "🧠 کوییز روزانه", callback_data: "menu:quiz" }],
    [{ text: "🎁 درآمد از معرفی", callback_data: "mission:invite" }, { text: "📣 همکاری رسانه‌ای", callback_data: "menu:affiliate" }],
    [{ text: "📜 قوانین", callback_data: "menu:rules" }, { text: "🎧 پشتیبانی", callback_data: "menu:support" }],
    [{ text: "🔗 اتصال حساب", callback_data: "menu:link" }, { text: "👤 پروفایل", callback_data: "menu:profile" }],
    [{ text: "👤 وضعیت من", callback_data: "menu:status" }],
    [{ text: "🆕 ساخت حساب", url: `${APP_URL}/register` }, { text: "🌐 پروفایل وب", url: `${APP_URL}/profile` }],
  ];
  return { inline_keyboard: rows };
}

export function gameKeyboard() {
  return {
    inline_keyboard: [
      ...GAME_OPTIONS.map((game) => [{ text: game.label, callback_data: `reg:game:${game.id}` }]),
      [{ text: "لغو", callback_data: "reg:abort" }],
    ],
  };
}

export function platformKeyboard() {
  const rows = [];
  for (let i = 0; i < PLATFORM_OPTIONS.length; i += 2) {
    rows.push(PLATFORM_OPTIONS.slice(i, i + 2).map((platform, offset) => ({
      text: platform,
      callback_data: `reg:platform:${i + offset}`,
    })));
  }
  rows.push([{ text: "لغو", callback_data: "reg:abort" }]);
  return { inline_keyboard: rows };
}

export function confirmKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "✅ تأیید و ثبت نهایی", callback_data: "reg:confirm" }],
      [{ text: "🔁 شروع دوباره", callback_data: "reg:restart" }, { text: "لغو", callback_data: "reg:abort" }],
    ],
  };
}

export function roomsKeyboard(rows: Array<{ id: string; name: string | null; entryFee?: string | null; registeredCount?: number; maxPlayers?: number }>) {
  const keyboard: Array<Array<Record<string, string>>> = [[{ text: "🌐 مشاهده همه روم‌ها در وب‌اپ", url: `${APP_URL}/tournaments` }]];
  for (const row of rows.slice(0, 5)) {
    const title = (row.name || "روم Gament").slice(0, 28);
    const isFull = typeof row.registeredCount === "number" && typeof row.maxPlayers === "number" && row.registeredCount >= row.maxPlayers;
    keyboard.push([{ text: isFull ? `ظرفیت تکمیل: ${title}` : `✅ ثبت‌نام: ${title}`, callback_data: `join:${row.id}` }]);
    keyboard.push([{ text: `جزئیات: ${title}`, url: `${APP_URL}/tournaments/${row.id}` }]);
  }
  keyboard.push([{ text: "🎮 پیش‌ثبت‌نام", callback_data: "menu:register" }]);
  return { inline_keyboard: keyboard };
}
