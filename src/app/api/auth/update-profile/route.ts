import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import { ClashRoyaleApiError, createClashRoyaleApiClient, normalizeClashRoyaleTag } from "@/lib/clash-royale-api";
import logger from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Strict list of allowed exclusive Gament avatars to protect exclusivity (and future purchases/sales)
const ALLOWED_AVATARS = [
  "/avatars/avatar_1.jpg",
  "/avatars/avatar_2.jpg",
  "/avatars/avatar_3.jpg",
  "/avatars/avatar_4.jpg",
  "/icons/profile_icon.png",
  "/icons/gament-icon-192.png",
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
    const limit = await rateLimit(`profile:update:${user.id}:${ip}`, 20, 60_000);
    if (!limit.success) return NextResponse.json({ error: "تعداد درخواست‌ها زیاد است؛ کمی صبر کن." }, { status: 429 });

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
    
    if (clashRoyaleId !== undefined) {
      const rawTag = String(clashRoyaleId || "").trim();
      if (!rawTag) {
        updateData.clashRoyaleId = null;
        updateData.clashRoyaleUsername = null;
        updateData.clashRoyaleStatus = "unlinked";
      } else {
        const normalizedTag = normalizeClashRoyaleTag(rawTag);
        if (!normalizedTag) {
          return NextResponse.json({ error: "Player Tag کلش رویال معتبر نیست." }, { status: 400 });
        }
        const [duplicate] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.clashRoyaleId, normalizedTag), ne(users.id, user.id)))
          .limit(1);
        if (duplicate) {
          return NextResponse.json({ error: "این Player Tag قبلاً به حساب دیگری متصل شده است." }, { status: 409 });
        }

        const clashPlayer = await createClashRoyaleApiClient().getPlayer(normalizedTag);
        updateData.clashRoyaleId = normalizeClashRoyaleTag(clashPlayer.tag) || normalizedTag;
        updateData.clashRoyaleUsername = String(clashPlayer.name || "").trim().slice(0, 100);
        updateData.clashRoyaleStatus = "verified";
      }
    }
    // Clash Royale username is authoritative from Supercell and cannot be
    // overwritten manually. Keep the old request field only for compatibility.
    void clashRoyaleUsername;
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
        emailVerifiedAt: updated.emailVerifiedAt,
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
        clashRoyaleStatus: updated.clashRoyaleStatus,
        codMobileId: updated.codMobileId,
        codMobileUsername: updated.codMobileUsername,
        fortniteId: updated.fortniteId,
        fortniteUsername: updated.fortniteUsername,
        metadata: updated.metadata,
      },
    });
  } catch (error) {
    if (error instanceof ClashRoyaleApiError) {
      if (error.status === 404) return NextResponse.json({ error: "Player Tag در Clash Royale پیدا نشد." }, { status: 404 });
      if (error.status === 403) return NextResponse.json({ error: "کلید API یا IP مجاز Clash Royale مشکل دارد." }, { status: 502 });
      if (error.status === 503) return NextResponse.json({ error: "Clash Royale API هنوز تنظیم نشده است." }, { status: 503 });
      return NextResponse.json({ error: "استعلام Player Tag از Clash Royale انجام نشد." }, { status: 502 });
    }
    logger.error({ error, userId: request.cookies.has("session") ? "authenticated" : "unknown" }, "Profile update failed");
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
