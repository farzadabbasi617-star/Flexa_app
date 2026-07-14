export function getAdminIds() {
  return (process.env.TELEGRAM_ADMIN_IDS || process.env.ADMIN_IDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function hasAdminAccess(telegramId: string) {
  return getAdminIds().includes(telegramId);
}
