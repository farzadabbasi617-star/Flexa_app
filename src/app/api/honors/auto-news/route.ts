import { NextRequest, NextResponse } from "next/server";
import { generateDailyGamingNews } from "@/lib/gaming-news-generator";
import { normalizeAIEnvValue } from "@/lib/ai-provider-manager";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const secret = normalizeAIEnvValue(process.env.HONORS_AI_SECRET || process.env.TELEGRAM_CRON_SECRET || process.env.CRON_SECRET);
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const querySecret = request.nextUrl.searchParams.get("secret") || "";
  const headerSecret = request.headers.get("x-gament-ai-secret") || "";
  return auth === secret || querySecret === secret || headerSecret === secret;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const force = request.nextUrl.searchParams.get("force") === "true";
    const result = await generateDailyGamingNews({ force });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, "Auto honors news endpoint failed");
    return NextResponse.json({ error: "Auto news generation failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
