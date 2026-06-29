import { NextRequest, NextResponse } from "next/server";
import { generateRealAssistantResponse } from "@/lib/ai-service";
import { AIAssistantSchema } from "@/lib/validations";
import { validateSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

type AvatarEmotion = "neutral" | "happy" | "thinking" | "surprised" | "serious" | "sad";

type AvatarGesture = "idle" | "wave" | "nod" | "think";

function detectEmotion(userMessage: string, aiResponse: string): { emotion: AvatarEmotion; gesture: AvatarGesture; intensity: number } {
  const text = `${userMessage}\n${aiResponse}`.toLowerCase();

  if (/سلام|درود|hello|hi|معرفی|خوش اومدی/.test(text)) {
    return { emotion: "happy", gesture: "wave", intensity: 0.9 };
  }
  if (/خطا|مشکل|نشد|نمی‌شود|ناموفق|اعتراض|اشتباه|باطل|بن|تقلب|ریسک|قانون/.test(text)) {
    return { emotion: "serious", gesture: "nod", intensity: 0.85 };
  }
  if (/متاسف|متأسف|ببخش|ناراحت|از دست رفت|لغو/.test(text)) {
    return { emotion: "sad", gesture: "nod", intensity: 0.75 };
  }
  if (/عجب|واو|فوق‌العاده|فوق العاده|تبریک|بردی|جایزه|قهرمان/.test(text)) {
    return { emotion: "surprised", gesture: "nod", intensity: 0.82 };
  }
  if (/چطور|چگونه|راهنما|کجا|کی|چه|چرا|؟|\?/.test(userMessage)) {
    return { emotion: "thinking", gesture: "think", intensity: 0.72 };
  }

  return { emotion: "happy", gesture: "idle", intensity: 0.72 };
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const ua = request.headers.get("user-agent") || "unknown";
    const token = request.cookies.get("session")?.value || "";
    const user = token ? await validateSession(token, ip, ua, request) : null;

    const limitKey = user ? `ai-avatar:user:${user.id}` : `ai-avatar:ip:${ip}`;
    const limit = await rateLimit(limitKey, user ? 18 : 6, 60 * 1000);
    if (!limit.success) {
      return NextResponse.json(
        { error: "تعداد پیام‌های گیم‌یار زیاد شده. لطفاً کمی بعد دوباره امتحان کن." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const validation = AIAssistantSchema.safeParse({ message: body.message });
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues[0]?.message || "پیام معتبر نیست" }, { status: 400 });
    }

    const ai = await generateRealAssistantResponse(validation.data.message, {
      lang: "fa",
      userName: user?.displayName || undefined,
    });

    const reaction = detectEmotion(validation.data.message, ai.response);

    return NextResponse.json({
      response: ai.response,
      suggestions: ai.suggestions,
      provider: ai.provider,
      cachedProvider: ai.cachedProvider || null,
      emotion: reaction.emotion,
      gesture: reaction.gesture,
      intensity: reaction.intensity,
    });
  } catch (err) {
    logger.error({ err }, "AI avatar chat route failed");
    return NextResponse.json({ error: "گیم‌یار فعلاً در دسترس نیست" }, { status: 500 });
  }
}
