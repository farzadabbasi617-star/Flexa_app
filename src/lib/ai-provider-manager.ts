import { aiCache } from "./ai-cache";
import logger from "@/lib/logger";

type AIProvider = "openrouter" | "groq";

export interface AIProviderResult {
  content: string;
  provider: AIProvider | "cache";
  cachedProvider?: AIProvider;
}

const PROVIDERS: Array<{
  id: AIProvider;
  url: string;
  apiKeyEnv: "OPENROUTER_API_KEY" | "GROQ_API_KEY";
  modelEnv: "OPENROUTER_MODEL" | "GROQ_MODEL";
  defaultModel: string;
}> = [
  {
    id: "openrouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    apiKeyEnv: "OPENROUTER_API_KEY",
    modelEnv: "OPENROUTER_MODEL",
    defaultModel: "google/gemini-2.0-flash-exp:free",
  },
  {
    id: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    apiKeyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    defaultModel: "llama-3.3-70b-versatile",
  },
];

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timeout) };
}

async function callProvider(
  provider: (typeof PROVIDERS)[number],
  prompt: string,
  systemPrompt: string
): Promise<AIProviderResult | null> {
  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) return null;

  const model = process.env[provider.modelEnv] || provider.defaultModel;
  const { signal, cancel } = timeoutSignal(18_000);

  try {
    const response = await fetch(provider.url, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(provider.id === "openrouter"
          ? {
              "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://flexa-app.com",
              "X-Title": "Flexa App",
            }
          : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.55,
        max_tokens: 800,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      logger.warn(
        { provider: provider.id, status: response.status, body: errorText.slice(0, 500) },
        "AI provider returned an error"
      );
      return null;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (typeof content === "string" && content.trim()) {
      return { content: content.trim(), provider: provider.id };
    }

    logger.warn({ provider: provider.id }, "AI provider returned an empty response");
    return null;
  } catch (err) {
    logger.warn({ provider: provider.id, err }, "AI provider connection failed");
    return null;
  } finally {
    cancel();
  }
}

/**
 * Multi-provider AI call with OpenRouter as primary and Groq as failover.
 */
export async function fetchAIResponse(prompt: string, systemPrompt: string): Promise<AIProviderResult | null> {
  const cacheKey = `ai_${Buffer.from(`${systemPrompt}\n${prompt}`).toString("base64url")}`;
  const cached = aiCache.get(cacheKey) as { content: string; provider: AIProvider } | null;
  if (cached?.content) {
    return { content: cached.content, provider: "cache", cachedProvider: cached.provider };
  }

  for (const provider of PROVIDERS) {
    const result = await callProvider(provider, prompt, systemPrompt);
    if (result) {
      aiCache.set(cacheKey, { content: result.content, provider: result.provider }, 3600);
      return result;
    }
  }

  return null;
}
