import { fetchAIResponse } from './ai-provider-manager';
import { db } from '@/db';
import { aiProposals } from '@/db/schema';
import { safeParseAIJson } from './ai-utils';

export const AIManager = {
  async proposeMatchResult(matchId: string, resultData: any) {
    const prompt = `Review match ${matchId}. Scores: ${JSON.stringify(resultData)}.`;
    const res = await fetchAIResponse(prompt, "You are an AI Manager. Propose action in JSON.");
    if (res) {
      const suggestion = safeParseAIJson<{ action: string, confidence: number, reasoning: string }>(res.content);
      if (suggestion) {
        await db.insert(aiProposals).values({
          type: 'match_result',
          targetId: matchId,
          suggestedAction: suggestion.action,
          confidence: suggestion.confidence,
          reasoning: suggestion.reasoning
        });
      }
    }
  }
};
