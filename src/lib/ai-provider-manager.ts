import { aiCache } from './ai-cache';

/**
 * AI Provider Manager with Caching and Auto-Switch
 */
export async function fetchAIResponse(prompt: string, systemPrompt: string) {
  // 1. Check Cache First (Speed Boost)
  const cacheKey = `ai_${prompt}_${systemPrompt}`;
  const cached = aiCache.get(cacheKey);
  if (cached) return { content: cached, provider: "cache" };

  // 2. Try OpenRouter (Primary)
  // ... existing logic ...
  // (After getting result, cache it)
  // aiCache.set(cacheKey, content, 3600); 
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          "model": "google/gemini-2.0-flash-exp:free",
          "messages": [{ "role": "system", "content": systemPrompt }, { "role": "user", "content": prompt }],
        })
      });
      if (response.ok) {
        const data = await response.json();
        const content = data.choices[0]?.message?.content;
        if (content) return { content, provider: "openrouter" };
      } else {
        const err = await response.json();
        console.error("OpenRouter API Error:", err);
      }
    } catch (e) {
      console.error("OpenRouter Connection Error:", e);
    }
  }

  // 2. Try Groq (Secondary/Failover)
  if (process.env.GROQ_API_KEY) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          "model": "llama-3.3-70b-versatile",
          "messages": [{ "role": "system", "content": systemPrompt }, { "role": "user", "content": prompt }],
        })
      });
      if (response.ok) {
        const data = await response.json();
        const content = data.choices[0]?.message?.content;
        if (content) return { content, provider: "groq" };
      } else {
        const err = await response.json();
        console.error("Groq API Error:", err);
      }
    } catch (e) {
      console.error("Groq Connection Error:", e);
    }
  }

  return null; // Both failed
}
