import { NextRequest, NextResponse } from "next/server";
import { generateAssistantResponse } from "@/lib/ai-engine";
import { validateSession } from "@/lib/auth";
import { AIAssistantSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { aiCache } from "@/lib/ai-cache";
import logger from "@/lib/logger";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const ip = request.ip || 'unknown';
    
    // 1. Rate Limiting
    const rateLimitResult = await rateLimit(ip, 10, 60 * 1000);
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: "AI Assistant rate limit exceeded. Please slow down." }, { status: 429 });
    }

    const body = await request.json();
    
    // 2. Zod Validation
    const validation = AIAssistantSchema.safeParse({ message: body.query });
    if (!validation.success) {
      return NextResponse.json({ 
        error: "Invalid query", 
        details: validation.error.errors 
      }, { status: 400 });
    }

    const query = body.query;
    const lang = (body.lang || "en") as "en" | "fa";

    // 3. Caching (Hash the query for key)
    const queryHash = crypto.createHash('sha256').update(`${lang}:${query}`).digest('hex');
    const cachedResponse = aiCache.get(`assistant_${queryHash}`);
    if (cachedResponse) {
      return NextResponse.json({ ...cachedResponse, cached: true });
    }

    let userName: string | undefined;
    const token = request.cookies.get("session")?.value;
    if (token) {
      const user = await validateSession(token, ip, request.headers.get('user-agent') || 'unknown');
      userName = user?.displayName;
    }

    const result = generateAssistantResponse(query, {
      lang,
      userName,
    });

    // Cache for 30 minutes
    aiCache.set(`assistant_${queryHash}`, result, 1800);

    return NextResponse.json({ ...result, cached: false });
  } catch (err) {
    logger.error({ err }, 'AI Assistant error');
    return NextResponse.json({ error: "AI assistant error" }, { status: 500 });
  }
}
