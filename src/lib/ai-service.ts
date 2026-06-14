import { fetchAIResponse } from "./ai-provider-manager";
import { analyzeMatch, generateAssistantResponse, AIJudgmentResult } from "./ai-engine";

export interface AssistantAIResponse {
  response: string;
  suggestions: string[];
  provider: "openrouter" | "groq" | "cache" | "local";
  cachedProvider?: "openrouter" | "groq";
}

/**
 * Real AI Chat Assistant Response using Multi-Provider Auto-Switch
 */
export async function generateRealAssistantResponse(
  query: string,
  context: { lang: "en" | "fa"; userName?: string }
): Promise<AssistantAIResponse> {
  const isFA = context.lang === "fa";
  const name = context.userName || (isFA ? "کاربر" : "User");

  const systemPrompt = isFA
    ? `شما «فلکسا» هستید؛ دستیار هوشمند پلتفرم تورنمنت گیمینگ Flexa. نام کاربر: ${name}. فقط فارسی، کوتاه، کاربردی و صمیمی پاسخ بده. اگر سؤال مربوط به تورنمنت، ثبت‌نام، داوری، کیف پول یا پروفایل بود دقیق راهنمایی کن.`
    : `You are "Flexa", an AI assistant for a mobile gaming tournament platform. User name: ${name}. Keep responses friendly and brief in English.`;

  const aiResult = await fetchAIResponse(query, systemPrompt);

  const suggestions = isFA
    ? ["قوانین تورنومنت", "نحوه ثبت امتیاز", "تورنومنت‌های فعال"]
    : ["Tournament Rules", "How to report score", "Active Tournaments"];

  if (!aiResult) {
    const fallback = generateAssistantResponse(query, context);
    return {
      response: fallback.response,
      suggestions: fallback.suggestions,
      provider: "local",
    };
  }

  return {
    response: aiResult.content,
    suggestions,
    provider: aiResult.provider,
    cachedProvider: aiResult.cachedProvider,
  };
}

/**
 * Real AI Judging System using Multi-Provider Auto-Switch
 */
export async function analyzeMatchWithAI(
  player1Score: number,
  player2Score: number,
  player1Rating: number,
  player2Rating: number,
  player1History: { wins: number; losses: number },
  player2History: { wins: number; losses: number },
  hasEvidence: boolean = false
): Promise<AIJudgmentResult> {
  const prompt = `Analyze this match result and provide a verdict:
    Game: Mobile Gaming Tournament
    Player 1: Score ${player1Score}, Rating ${player1Rating}, History ${player1History.wins}W/${player1History.losses}L
    Player 2: Score ${player2Score}, Rating ${player2Rating}, History ${player2History.wins}W/${player2History.losses}L
    Evidence Provided: ${hasEvidence ? "Yes" : "No"}

    Return ONLY a JSON object:
    {
      "verdict": "player1_wins" | "player2_wins" | "draw" | "rematch" | "needs_review",
      "confidence": number,
      "reasoning": "Explanation in Persian",
      "suspicionLevel": number,
      "recommendations": ["string"]
    }`;

  const systemPrompt = "You are the Flexa AI Head Judge. Analyze scores for fair play. Respond ONLY with valid JSON.";

  const aiResult = await fetchAIResponse(prompt, systemPrompt);

  if (!aiResult) {
    return analyzeMatch(player1Score, player2Score, player1Rating, player2Rating, player1History, player2History, hasEvidence);
  }

  try {
    const jsonStr = aiResult.content.includes("```json")
      ? aiResult.content.split("```json")[1].split("```")[0].trim()
      : aiResult.content.trim();

    const parsed = JSON.parse(jsonStr);

    return {
      ...parsed,
      factors: analyzeMatch(player1Score, player2Score, player1Rating, player2Rating, player1History, player2History, hasEvidence).factors,
    };
  } catch {
    return analyzeMatch(player1Score, player2Score, player1Rating, player2Rating, player1History, player2History, hasEvidence);
  }
}
