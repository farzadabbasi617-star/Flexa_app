import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Strict list of allowed exclusive Gament avatars to protect exclusivity (and future purchases/sales)
const ALLOWED_AVATARS = [
  "/avatars/avatar_1.jpg",
  "/avatars/avatar_2.jpg",
  "/avatars/avatar_3.jpg",
  "/avatars/avatar_4.jpg",
  "/icons/profile_icon.png",
  "/icons/arena_icon.png",
];

export async function PATCH(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const ua = request.headers.get('user-agent') || 'unknown';

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await validateSession(token, ip, ua, request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      displayName,
      avatarUrl,
      clashRoyaleId,
      clashRoyaleUsername,
      codMobileId,
      codMobileUsername,
      fortniteId,
      fortniteUsername,
    } = body;

    const updateData: Record<string, string | null> = {};

    if (displayName !== undefined) updateData.displayName = String(displayName).trim().slice(0, 100);
    
    // Strict backend enforcement of premium avatars
    if (avatarUrl !== undefined) {
      const url = String(avatarUrl || "").trim();
      updateData.avatarUrl = ALLOWED_AVATARS.includes(url) ? url : "/icons/profile_icon.png";
    }
    
    if (clashRoyaleId !== undefined) updateData.clashRoyaleId = clashRoyaleId || null;
    if (clashRoyaleUsername !== undefined) updateData.clashRoyaleUsername = clashRoyaleUsername || null;
    if (codMobileId !== undefined) updateData.codMobileId = codMobileId || null;
    if (codMobileUsername !== undefined) updateData.codMobileUsername = codMobileUsername || null;
    if (fortniteId !== undefined) updateData.fortniteId = fortniteId || null;
    if (fortniteUsername !== undefined) updateData.fortniteUsername = fortniteUsername || null;

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, user.id))
      .returning();

    return NextResponse.json({
      user: {
        id: updated.id,
        email: updated.email,
        phoneNumber: updated.phoneNumber,
        phoneVerifiedAt: updated.phoneVerifiedAt,
        username: updated.username,
        displayName: updated.displayName,
        gamentId: updated.gamentId,
        role: updated.role,
        avatarUrl: updated.avatarUrl,
        isVerified: updated.isVerified,
        level: updated.level,
        rankPoints: updated.rankPoints,
        xp: updated.xp,
        clashRoyaleId: updated.clashRoyaleId,
        clashRoyaleUsername: updated.clashRoyaleUsername,
        codMobileId: updated.codMobileId,
        codMobileUsername: updated.codMobileUsername,
        fortniteId: updated.fortniteId,
        fortniteUsername: updated.fortniteUsername,
        metadata: updated.metadata,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
