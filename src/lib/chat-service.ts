import { db } from "@/db";
import { globalChat, users } from "@/db/schema";
import { eq, asc, desc, sql } from "drizzle-orm";
import { moderateMessage } from "./ai-engine";

export const ChatService = {
  /**
   * Send a message with AI Moderation and Strike System
   */
  async sendMessage(senderId: string, message: string) {
    // 1. Check if user is currently banned
    const [user] = await db.select().from(users).where(eq(users.id, senderId));
    if (user.chatBanUntil && user.chatBanUntil > new Date()) {
      throw new Error(`شما تا ${user.chatBanUntil.toLocaleTimeString('fa-IR')} از چت بن شده‌اید.`);
    }

    // 2. AI Moderation
    const moderation = moderateMessage(message);
    if (!moderation.isAllowed) {
      const newStrikes = (user.chatStrikes || 0) + 1;
      
      if (newStrikes >= 3) {
        // 3rd strike: Ban for 10 minutes
        const banUntil = new Date(Date.now() + 10 * 60 * 1000);
        await db.update(users)
          .set({ chatStrikes: 0, chatBanUntil: banUntil })
          .where(eq(users.id, senderId));
        throw new Error("به دلیل تکرار خطاهای رفتاری، شما ۱۰ دقیقه از چت بن شدید.");
      } else {
        // 1st or 2nd strike: Just warn
        await db.update(users)
          .set({ chatStrikes: newStrikes })
          .where(eq(users.id, senderId));
        throw new Error(`پیام شما حاوی کلمات نامناسب است. اخطار ${newStrikes} از ۳.`);
      }
    }

    // 3. Reset strikes on clean message (optional, for fairness)
    if (user.chatStrikes > 0) {
      await db.update(users).set({ chatStrikes: 0 }).where(eq(users.id, senderId));
    }

    // 4. Save message and Cleanup (Keep only last 50)
    return await db.transaction(async (tx) => {
      await tx.insert(globalChat).values({ senderId, message });
      
      // Delete old messages if count > 50
      const oldMessages = await tx.select({ id: globalChat.id })
        .from(globalChat)
        .orderBy(desc(globalChat.createdAt))
        .offset(50);
      
      if (oldMessages.length > 0) {
        const idsToDelete = oldMessages.map(m => m.id);
        await tx.delete(globalChat).where(sql`${globalChat.id} IN (${sql.join(idsToDelete, sql`, `)})`);
      }
    });
  },

  /**
   * Get latest 50 messages
   */
  async getMessages() {
    return await db.select()
      .from(globalChat)
      .orderBy(asc(globalChat.createdAt))
      .limit(50);
  }
};
