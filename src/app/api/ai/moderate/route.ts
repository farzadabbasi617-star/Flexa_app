import { NextRequest, NextResponse } from "next/server";
import { moderateMessage } from "@/lib/ai-engine";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message } = body;

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const result = moderateMessage(message);

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Moderation error" }, { status: 500 });
  }
}
