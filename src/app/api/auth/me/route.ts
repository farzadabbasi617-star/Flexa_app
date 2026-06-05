import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const ua = request.headers.get('user-agent') || 'unknown';

    if (!token) {
      return NextResponse.json({ user: null });
    }

    const user = await validateSession(token, ip, ua, request);

    if (!user) {
      const response = NextResponse.json({ user: null });
      response.cookies.delete("session");
      return response;
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        avatarUrl: user.avatarUrl,
        clashRoyaleId: user.clashRoyaleId,
        clashRoyaleUsername: user.clashRoyaleUsername,
        codMobileId: user.codMobileId,
        codMobileUsername: user.codMobileUsername,
        fortniteId: user.fortniteId,
        fortniteUsername: user.fortniteUsername,
      },
    });
  } catch {
    return NextResponse.json({ user: null });
  }
}
