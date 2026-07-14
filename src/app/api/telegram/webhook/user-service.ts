import { eq } from "drizzle-orm";
import { db } from "@/db";
import { telegramAccounts, users } from "@/db/schema";

export async function getLinkedUserByTelegram(telegramId: string) {
  const [row] = await db
    .select({
      userId: telegramAccounts.userId,
      gamentId: users.gamentId,
      displayName: users.displayName,
      username: users.username,
      role: users.role,
      level: users.level,
      rankPoints: users.rankPoints,
    })
    .from(telegramAccounts)
    .leftJoin(users, eq(telegramAccounts.userId, users.id))
    .where(eq(telegramAccounts.telegramId, telegramId))
    .limit(1);
  return row || null;
}
