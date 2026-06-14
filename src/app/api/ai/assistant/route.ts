import { NextRequest, NextResponse } from "next/server";
import { generateRealAssistantResponse } from "@/lib/ai-service";
import { validateSession } from "@/lib/auth";
import { AIAssistantSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { aiCache } from "@/lib/ai-cache";
import logger from "@/lib/logger";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";

    const rateLimitResult = await rateLimit(`ai-assistant:${ip}`, 10, 60 * 1000);
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: "محدودیت درخواست دستیار هوشمند. لطفاً کمی آرام‌تر." }, { status: 429 });
    }

    const body = await request.json();
    const validation = AIAssistantSchema.safeParse({ message: body.query ?? body.message });
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "پیام معتبر نیست",
          details: validation.error.issues,
        },
        { status: 400 }
      );
    }

    const query = validation.data.message;
    const lang = "fa" as const;

    const queryHash = crypto.createHash("sha256").update(`${lang}:${query}`).digest("hex");
    const cachedResponse = aiCache.get(`assistant_${queryHash}`);
    if (cachedResponse) {
      return NextResponse.json({ ...cachedResponse, cached: true });
    }

    let userName: string | undefined;
    const token = request.cookies.get("session")?.value;
    if (token) {
      const user = await validateSession(token, ip, request.headers.get("user-agent") || "unknown", request);
      userName = user?.displayName;
    }

    const result = await generateRealAssistantResponse(query, {
      lang,
      userName,
    });

    aiCache.set(`assistant_${queryHash}`, result, 1800);

    return NextResponse.json({ ...result, cached: false });
  } catch (err) {
    logger.error({ err }, "AI Assistant error");
    return NextResponse.json({ error: "خطا در دستیار هوشمند" }, { status: 500 });
  }
}
