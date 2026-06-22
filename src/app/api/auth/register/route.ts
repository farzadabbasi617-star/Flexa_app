import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/db";
import { players, users, wallets } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { hashPassword, createSession } from "@/lib/auth";
import { RegisterSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";
import { TERMS_VERSION } from "@/lib/terms";

export const dynamic = "force-dynamic";

async function generateUniqueGamentId() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `FLX-${crypto.randomInt(1000, 10000)}`;
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.gamentId, candidate))
      .limit(1);

    if (!existing) return candidate;
  }

  return `FLX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // SMS/OTP is intentionally not required yet. We store the mobile number now
    // and can verify it later when the SMS provider is purchased and enabled.

    // 1. Rate limit — protect against signup spam / abuse.
    const limit = await rateLimit(`register:${ip}`, 5, 60 * 60 * 1000); // 5 / hour / IP
    if (!limit.success) {
      return NextResponse.json(
        { error: "تعداد تلاش‌ها بیش از حد مجاز است. لطفاً بعداً دوباره امتحان کنید." },
        { status: 429 }
      );
    }

    // 2. Input validation.
    const body = await request.json();
    const validation = RegisterSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { email, username, password, displayName, phoneNumber } = validation.data;

    // 3. Uniqueness check.
    const existing = await db
      .select({ id: users.id, email: users.email, username: users.username, phoneNumber: users.phoneNumber })
      .from(users)
      .where(
        email
          ? or(eq(users.email, email), eq(users.username, username), eq(users.phoneNumber, phoneNumber))
          : or(eq(users.username, username), eq(users.phoneNumber, phoneNumber))
      );

    if (email && existing.some((u) => u.email === email)) {
      return NextResponse.json({ error: "ایمیل قبلاً ثبت شده است" }, { status: 409 });
    }
    if (existing.some((u) => u.username === username)) {
      return NextResponse.json({ error: "نام کاربری قبلاً انتخاب شده است" }, { status: 409 });
    }
    if (existing.some((u) => u.phoneNumber === phoneNumber)) {
      return NextResponse.json({ error: "شماره موبایل قبلاً ثبت شده است" }, { status: 409 });
    }

    // 4. Hash password.
    const hashedPassword = await hashPassword(password);
    const gamentId = await generateUniqueGamentId();

    // 5. Create user + player profile + empty wallet atomically.
    const user = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          phoneNumber,
          gamentId,
          username,
          passwordHash: hashedPassword,
          displayName,
          email: email || null,
          // The number is saved but not verified until SMS/OTP is enabled.
          phoneVerifiedAt: null,
          isVerified: false,
          termsAcceptedAt: new Date(),
          termsVersion: TERMS_VERSION,
        })
        .returning();

      await tx.insert(players).values({
        visibleUserId: created.id,
        username: created.username!,
        displayName: created.displayName,
        email: created.email,
      });

      await tx.insert(wallets).values({
        userId: created.id,
        balance: "0",
        currency: "RIAL",
      });

      return created;
    });

    // 6. Create session.
    const token = await createSession(user.id, ip, userAgent);

    const response = NextResponse.json(
      {
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
          xp: user.xp,
          clashRoyaleId: user.clashRoyaleId,
          clashRoyaleUsername: user.clashRoyaleUsername,
          codMobileId: user.codMobileId,
          codMobileUsername: user.codMobileUsername,
          fortniteId: user.fortniteId,
          fortniteUsername: user.fortniteUsername,
          metadata: user.metadata,
        },
      },
      { status: 201 }
    );

    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });

    logger.info({ userId: user.id, authMode: "password_without_sms" }, "User registered successfully");
    return response;
  } catch (err) {
    // Log full detail server-side for debugging, but never leak secrets to the client.
    logger.error({ err }, "Registration error");
    return NextResponse.json(
      {
        error:
          "ثبت‌نام با خطا مواجه شد. اگر /api/health وضعیت دیتابیس را false نشان می‌دهد، DATABASE_URL در Render درست تنظیم نشده است.",
      },
      { status: 500 }
    );
  }
}
