import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/db";
import { telegramAccounts, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession } from "@/lib/auth";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

// Verify the Telegram initData signature using HMAC-SHA256 and the Bot Token
function verifyTelegramWebAppData(initData: string, botToken: string): { isValid: boolean; user: any } {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return { isValid: false, user: null };

    // Extract user details
    const userStr = params.get("user");
    const user = userStr ? JSON.parse(userStr) : null;

    // Collect all parameters except 'hash' and sort them
    const keys = Array.from(params.keys()).filter((k) => k !== "hash").sort();
    const dataCheckString = keys.map((k) => `${k}=${params.get(k)}`).join("\n");

    // HMAC verification
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    return { isValid: calculatedHash === hash, user };
  } catch (err) {
    logger.error({ err }, "Telegram initData verification error");
    return { isValid: false, user: null };
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    const body = await request.json();
    const { initData } = body;

    if (!initData) {
      return NextResponse.json({ error: "Missing initData" }, { status: 400 });
    }

    // BOT_TOKEN is loaded from env variables
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      logger.error("BOT_TOKEN environment variable is not defined in Gament settings");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    const { isValid, user: tgUser } = verifyTelegramWebAppData(initData, botToken);
    if (!isValid || !tgUser || !tgUser.id) {
      return NextResponse.json({ error: "Invalid Telegram authentication" }, { status: 401 });
    }

    const tgId = String(tgUser.id);

    // Look up linked account in Gament database
    const [linked] = await db
      .select({ userId: telegramAccounts.userId })
      .from(telegramAccounts)
      .where(eq(telegramAccounts.telegramId, tgId))
      .limit(1);

    if (!linked) {
      return NextResponse.json({
        success: false,
        linked: false,
        telegramUser: tgUser,
        message: "No linked Gament account found. Link account first inside profile."
      });
    }

    // Load full Gament user record
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, linked.userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "Linked user not found" }, { status: 404 });
    }

    // Log the user login time
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    // Create session in database
    const token = await createSession(user.id, ip, userAgent);

    const response = NextResponse.json({
      success: true,
      linked: true,
      user: {
        id: user.id,
        email: user.email,
        phoneNumber: user.phoneNumber,
        phoneVerifiedAt: user.phoneVerifiedAt,
        username: user.username,
        displayName: user.displayName,
        gamentId: user.gamentId,
        role: user.role,
        avatarUrl: user.avatarUrl,
        isVerified: user.isVerified,
        level: user.level,
        rankPoints: user.rankPoints,
        clashRoyaleId: user.clashRoyaleId,
        clashRoyaleUsername: user.clashRoyaleUsername,
        codMobileId: user.codMobileId,
        codMobileUsername: user.codMobileUsername,
        fortniteId: user.fortniteId,
        fortniteUsername: user.fortniteUsername,
        metadata: user.metadata,
      },
    });

    // Write HTTPOnly cookie session
    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days session persistence
      path: "/",
    });

    logger.info({ userId: user.id, tgId, authMode: "telegram_mini_app" }, "User logged in automatically via Telegram Mini App");
    return response;
  } catch (err) {
    logger.error({ err }, "Telegram login route error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
