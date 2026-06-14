import { db } from "@/db";
import { globalChat, sessions, users } from "@/db/schema";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { moderateMessage } from "./ai-engine";

export interface ChatMessageDTO {
  id: string;
  message: string;
  createdAt: Date;
  sender: {
    id: string;
    username: string | null;
    displayName: string;
    role: string;
  };
}

export const ChatService = {
  /**
   * Send a message with AI Moderation and Strike System
   */
  async sendMessage(senderId: string, message: string) {
    const cleanMessage = message.trim();
    if (!cleanMessage) {
      throw new Error("پیام نمی‌تواند خالی باشد.");
    }
    if (cleanMessage.length > 500) {
      throw new Error("پیام بیش از حد طولانی است.");
    }

    // 1. Check if user is currently banned
    const [user] = await db.select().from(users).where(eq(users.id, senderId));
    if (!user) {
      throw new Error("کاربر پیدا نشد.");
    }

    if (user.chatBanUntil && user.chatBanUntil > new Date()) {
      throw new Error(`شما تا ${user.chatBanUntil.toLocaleTimeString("fa-IR")} از چت بن شده‌اید.`);
    }

    // 2. AI Moderation
    const moderation = moderateMessage(cleanMessage);
    if (!moderation.isAllowed) {
      const currentStrikes = user.chatStrikes ?? 0;
      const newStrikes = currentStrikes + 1;

      if (newStrikes >= 3) {
        const banUntil = new Date(Date.now() + 10 * 60 * 1000);
        await db.update(users).set({ chatStrikes: 0, chatBanUntil: banUntil }).where(eq(users.id, senderId));
        throw new Error("به دلیل تکرار خطاهای رفتاری، شما ۱۰ دقیقه از چت بن شدید.");
      }

      await db.update(users).set({ chatStrikes: newStrikes }).where(eq(users.id, senderId));
      throw new Error(`پیام شما حاوی کلمات نامناسب است. اخطار ${newStrikes} از ۳.`);
    }

    // 3. Reset strikes on clean message
    if ((user.chatStrikes ?? 0) > 0) {
      await db.update(users).set({ chatStrikes: 0 }).where(eq(users.id, senderId));
    }

    // 4. Save message and cleanup (keep last 50)
    const inserted = await db.transaction(async (tx) => {
      const [created] = await tx.insert(globalChat).values({ senderId, message: cleanMessage }).returning();

      const oldMessages = await tx
        .select({ id: globalChat.id })
        .from(globalChat)
        .orderBy(desc(globalChat.createdAt))
        .offset(50);

      if (oldMessages.length > 0) {
        await tx.delete(globalChat).where(sql`${globalChat.id} IN (${sql.join(oldMessages.map((m) => m.id), sql`, `)})`);
      }

      return created;
    });

    return {
      id: inserted.id,
      message: inserted.message,
      createdAt: inserted.createdAt,
      sender: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    } satisfies ChatMessageDTO;
  },

  /**
   * Get latest 50 messages with sender info
   */
  async getMessages(): Promise<ChatMessageDTO[]> {
    const rows = await db
      .select({
        id: globalChat.id,
        message: globalChat.message,
        createdAt: globalChat.createdAt,
        senderId: users.id,
        username: users.username,
        displayName: users.displayName,
        role: users.role,
      })
      .from(globalChat)
      .innerJoin(users, eq(globalChat.senderId, users.id))
      .orderBy(asc(globalChat.createdAt))
      .limit(50);

    return rows.map((row) => ({
      id: row.id,
      message: row.message,
      createdAt: row.createdAt,
      sender: {
        id: row.senderId,
        username: row.username,
        displayName: row.displayName,
        role: row.role,
      },
    }));
  },

  async getStats() {
    const [totalMembersRow] = await db.select({ value: sql<number>`count(*)` }).from(users);
    const [onlineMembersRow] = await db
      .select({ value: sql<number>`count(distinct ${sessions.userId})` })
      .from(sessions)
      .where(gt(sessions.expiresAt, new Date()));

    return {
      totalMembers: Number(totalMembersRow?.value ?? 0),
      onlineMembers: Number(onlineMembersRow?.value ?? 0),
    };
  },

  async getUserChatState(userId: string | null) {
    if (!userId) return { strikes: 0, chatBanUntil: null as Date | null };

    const [user] = await db
      .select({ chatStrikes: users.chatStrikes, chatBanUntil: users.chatBanUntil })
      .from(users)
      .where(eq(users.id, userId));

    return {
      strikes: user?.chatStrikes ?? 0,
      chatBanUntil: user?.chatBanUntil ?? null,
    };
  },

  async touchSession(token: string | undefined) {
    if (!token) return;
    // Keep the online number more realistic by extending active sessions on chat polling.
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.update(sessions).set({ expiresAt }).where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())));
  },
};
