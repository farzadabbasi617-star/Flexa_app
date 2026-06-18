import logger from "./logger";

/**
 * Extracts and parses JSON from a string that might contain markdown code blocks.
 */
export function safeParseAIJson<T>(text: string): T | null {
  if (!text) return null;

  try {
    // 1. Try to extract content between ```json and ```
    const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
    const match = text.match(jsonRegex);
    const jsonString = match ? match[1] : text;

    // 2. Clean up any trailing/leading non-JSON characters that AI sometimes adds
    const cleanedString = jsonString.trim();

    return JSON.parse(cleanedString) as T;
  } catch (error) {
    logger.error({ 
      error, 
      input: text 
    }, "Failed to parse AI response as JSON");
    return null;
  }
}
