import { NextRequest, NextResponse } from "next/server";
import { generateAssistantResponse } from "@/lib/ai-engine";
import { validateSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, lang = "en" } = body;

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // Get user info if logged in
    let userName: string | undefined;
    const token = request.cookies.get("session")?.value;
    if (token) {
      const user = await validateSession(token);
      userName = user?.displayName;
    }

    const result = generateAssistantResponse(query, {
      lang: lang as "en" | "fa",
      userName,
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "AI assistant error" }, { status: 500 });
  }
}
