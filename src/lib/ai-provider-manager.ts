import { aiCache } from "./ai-cache";
import logger from "@/lib/logger";

type AIProvider = "openrouter" | "groq";

export interface AIProviderResult {
  content: string;
  provider: AIProvider | "cache";
  cachedProvider?: AIProvider;
  model?: string;
}

export function normalizeAIEnvValue(value: string | undefined) {
  if (!value) return "";
  let secret = value.trim();

  // Render values are sometimes pasted with wrapping quotes. If kept, providers
  // receive `Bearer "sk-..."` and reject with 401, making the assistant fall
  // back to local mode.
  if ((secret.startsWith('"') && secret.endsWith('"')) || (secret.startsWith("'") && secret.endsWith("'"))) {
    secret = secret.slice(1, -1).trim();
  }

  if (secret.toLowerCase().startsWith("bearer ")) {
    secret = secret.slice(7).trim();
  }

  return secret;
}

export function isUsableAISecret(value: string) {
  return Boolean(value && !value.includes("your_") && value.length > 12);
}

const PROVIDERS: Array<{
  id: AIProvider;
  url: string;
  apiKeyEnv: "OPENROUTER_API_KEY" | "GROQ_API_KEY";
  modelEnv: "OPENROUTER_MODEL" | "GROQ_MODEL";
  defaultModels: string[];
}> = [
  {
    id: "openrouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    apiKeyEnv: "OPENROUTER_API_KEY",
    modelEnv: "OPENROUTER_MODEL",
    defaultModels: [
      "google/gemini-2.0-flash-exp:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "google/gemini-2.0-flash-001",
      "google/gemini-flash-1.5",
    ],
  },
  {
    id: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    apiKeyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    defaultModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"],
  },
];

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timeout) };
}

function modelsFor(provider: (typeof PROVIDERS)[number]) {
  const envModel = normalizeAIEnvValue(process.env[provider.modelEnv]);
  return [...new Set([...(envModel ? [envModel] : []), ...provider.defaultModels])];
}

async function callProviderModel(
  provider: (typeof PROVIDERS)[number],
  model: string,
  prompt: string,
  systemPrompt: string
): Promise<AIProviderResult | null> {
  const apiKey = normalizeAIEnvValue(process.env[provider.apiKeyEnv]);
  if (!isUsableAISecret(apiKey)) return null;

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
              "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://flexa-app-1.onrender.com",
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
        { provider: provider.id, model, status: response.status, body: errorText.slice(0, 500) },
        "AI provider returned an error"
      );
      return null;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (typeof content === "string" && content.trim()) {
      return { content: content.trim(), provider: provider.id, model };
    }

    logger.warn({ provider: provider.id, model }, "AI provider returned an empty response");
    return null;
  } catch (err) {
    logger.warn({ provider: provider.id, model, err }, "AI provider connection failed");
    return null;
  } finally {
    cancel();
  }
}

async function callProvider(
  provider: (typeof PROVIDERS)[number],
  prompt: string,
  systemPrompt: string
): Promise<AIProviderResult | null> {
  if (!isUsableAISecret(normalizeAIEnvValue(process.env[provider.apiKeyEnv]))) return null;
  for (const model of modelsFor(provider)) {
    const result = await callProviderModel(provider, model, prompt, systemPrompt);
    if (result) return result;
  }
  return null;
}

/**
 * Multi-provider AI call with OpenRouter as primary and Groq as failover.
 */
export async function fetchAIResponse(prompt: string, systemPrompt: string): Promise<AIProviderResult | null> {
  const cacheKey = `ai_${Buffer.from(`${systemPrompt}\n${prompt}`).toString("base64url")}`;
  const cached = aiCache.get(cacheKey) as { content: string; provider: AIProvider; model?: string } | null;
  if (cached?.content) {
    return { content: cached.content, provider: "cache", cachedProvider: cached.provider, model: cached.model };
  }

  for (const provider of PROVIDERS) {
    const result = await callProvider(provider, prompt, systemPrompt);
    if (result) {
      aiCache.set(cacheKey, { content: result.content, provider: result.provider, model: result.model }, 3600);
      return result;
    }
  }

  return null;
}
