import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { fetchAIResponse, isUsableAISecret, normalizeAIEnvValue } from "@/lib/ai-provider-manager";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdminPermission(request, "ai");
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const openrouterKey = normalizeAIEnvValue(process.env.OPENROUTER_API_KEY);
  const groqKey = normalizeAIEnvValue(process.env.GROQ_API_KEY);
  const test = await fetchAIResponse("در یک جمله بگو Flexa AI فعال است.", "فقط فارسی و خیلی کوتاه پاسخ بده.");

  return NextResponse.json({
    configured: {
      openrouter: isUsableAISecret(openrouterKey),
      groq: isUsableAISecret(groqKey),
    },
    // Helps diagnose pasted quotes without exposing the secret.
    normalized: {
      openrouterHadWrappingQuotes: Boolean(process.env.OPENROUTER_API_KEY?.trim().startsWith('"')),
      groqHadWrappingQuotes: Boolean(process.env.GROQ_API_KEY?.trim().startsWith('"')),
    },
    connected: Boolean(test),
    provider: test?.provider || "local",
    cachedProvider: test?.cachedProvider || null,
    model: test?.model || null,
    sample: test?.content || null,
  });
}
