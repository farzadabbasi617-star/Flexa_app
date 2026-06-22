import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, or, ilike } from "drizzle-orm";
import { verifyPassword, createSession } from "@/lib/auth";
import { LoginSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    const rateLimitResult = await rateLimit(`login:${ip}`, 5, 60 * 1000);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "تعداد تلاش‌های ورود زیاد است. لطفاً کمی بعد دوباره امتحان کنید." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const validation = LoginSchema.safeParse({
      identifier: body.emailOrUsername ?? body.identifier,
      password: body.password,
    });

    if (!validation.success) {
      return NextResponse.json(
        {
          error: validation.error.issues[0]?.message || "اطلاعات ورود معتبر نیست",
          details: validation.error.issues,
        },
        { status: 400 }
      );
    }

    const { identifier, password } = validation.data;

    // Use ilike for case-insensitive username and email search
    const [user] = await db
      .select()
      .from(users)
      .where(
        or(
          ilike(users.email, identifier),
          ilike(users.username, identifier),
          eq(users.phoneNumber, identifier)
        )
      );

    if (!user) {
      logger.warn({ identifier }, "Login attempt failed: User not found");
      return NextResponse.json({ error: "شماره موبایل/نام کاربری یا رمز عبور اشتباه است" }, { status: 401 });
    }

    const isValid = await verifyPassword(user.passwordHash, password);
    if (!isValid) {
      logger.warn({ userId: user.id }, "Login attempt failed: Wrong password");
      return NextResponse.json({ error: "شماره موبایل/نام کاربری یا رمز عبور اشتباه است" }, { status: 401 });
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    const token = await createSession(user.id, ip, userAgent);

    const response = NextResponse.json({
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

    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });

    logger.info({ userId: user.id, authMode: "password_without_sms" }, "User logged in successfully");
    return response;
  } catch (err) {
    logger.error({ err }, "Login error");
    return NextResponse.json({ error: "ورود با خطا مواجه شد" }, { status: 500 });
  }
}
