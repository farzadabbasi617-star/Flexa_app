import { NextRequest, NextResponse } from "next/server";
import { ChatService } from "@/lib/chat-service";
import { requireUser, validateSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

function getClientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
}

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const token = request.cookies.get("session")?.value;
    const user = token
      ? await validateSession(token, ip, request.headers.get("user-agent") || "unknown", request)
      : null;

    if (token) {
      await ChatService.touchSession(token).catch(() => undefined);
    }

    const [messages, stats, userState] = await Promise.all([
      ChatService.getMessages(),
      ChatService.getStats(),
      ChatService.getUserChatState(user?.id ?? null),
    ]);

    return NextResponse.json({
      messages,
      stats,
      user: user
        ? {
            id: user.id,
            displayName: user.displayName,
            username: user.username,
            role: user.role,
          }
        : null,
      ...userState,
    });
  } catch (err) {
    logger.error({ err }, "Chat GET error");
    return NextResponse.json({ error: "چت بارگذاری نشد" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const auth = await requireUser(request);
    if (!auth.user) {
      return NextResponse.json({ error: "برای ارسال پیام باید وارد حساب شوی." }, { status: auth.status });
    }

    const limit = await rateLimit(`chat:${auth.user.id}:${ip}`, 12, 60 * 1000);
    if (!limit.success) {
      return NextResponse.json({ error: "تعداد پیام‌ها زیاد است. کمی صبر کن." }, { status: 429 });
    }

    const body = await request.json();
    const message = typeof body.message === "string" ? body.message : "";
    const created = await ChatService.sendMessage(auth.user.id, message);
    const [stats, userState] = await Promise.all([
      ChatService.getStats(),
      ChatService.getUserChatState(auth.user.id),
    ]);

    return NextResponse.json({ message: created, stats, ...userState }, { status: 201 });
  } catch (err) {
    logger.warn({ err }, "Chat POST rejected");
    const message = err instanceof Error ? err.message : "پیام ارسال نشد";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
