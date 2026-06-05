export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { chatMessages, users } from "@/db/schema";
import { eq, or, and, desc } from "drizzle-orm";
import { validateSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const ua = request.headers.get('user-agent') || 'unknown';

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await validateSession(token, ip, ua, request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const recipientId = searchParams.get("recipientId");
    const tournamentId = searchParams.get("tournamentId");

    let messages;

    if (recipientId) {
      // Direct messages
      messages = await db
        .select({
          id: chatMessages.id,
          senderId: chatMessages.senderId,
          receiverId: chatMessages.receiverId,
          message: chatMessages.message,
          isRead: chatMessages.isRead,
          createdAt: chatMessages.createdAt,
        })
        .from(chatMessages)
        .where(
          or(
            and(
              eq(chatMessages.senderId, user.id),
              eq(chatMessages.receiverId, recipientId)
            ),
            and(
              eq(chatMessages.senderId, recipientId),
              eq(chatMessages.receiverId, user.id)
            )
          )
        )
        .orderBy(desc(chatMessages.createdAt))
        .limit(100);
    } else if (tournamentId) {
      // Tournament chat
      messages = await db
        .select({
          id: chatMessages.id,
          senderId: chatMessages.senderId,
          message: chatMessages.message,
          createdAt: chatMessages.createdAt,
        })
        .from(chatMessages)
        .where(eq(chatMessages.tournamentId, tournamentId))
        .orderBy(desc(chatMessages.createdAt))
        .limit(100);
    } else {
      // Get all conversations
      messages = await db
        .select({
          id: chatMessages.id,
          senderId: chatMessages.senderId,
          receiverId: chatMessages.receiverId,
          message: chatMessages.message,
          isRead: chatMessages.isRead,
          createdAt: chatMessages.createdAt,
        })
        .from(chatMessages)
        .where(
          or(
            eq(chatMessages.senderId, user.id),
            eq(chatMessages.receiverId, user.id)
          )
        )
        .orderBy(desc(chatMessages.createdAt))
        .limit(100);
    }

    return NextResponse.json(messages.reverse());
  } catch {
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const ua = request.headers.get('user-agent') || 'unknown';

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await validateSession(token, ip, ua, request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { receiverId, tournamentId, matchId, message } = body;

    if (!message || message.trim() === "") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // AI Moderation
    const { moderateMessage } = await import("@/lib/ai-engine");
    const moderation = moderateMessage(message.trim());
    
    if (!moderation.isAllowed) {
      return NextResponse.json({
        error: "Message blocked by AI moderation",
        reason: moderation.suggestion,
        toxicityScore: moderation.toxicityScore,
      }, { status: 400 });
    }

    const [chatMessage] = await db
      .insert(chatMessages)
      .values({
        senderId: user.id,
        receiverId: receiverId || null,
        tournamentId: tournamentId || null,
        matchId: matchId || null,
        message: message.trim(),
      })
      .returning();

    return NextResponse.json(chatMessage, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
