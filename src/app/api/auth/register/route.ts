import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, players } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { hashPassword, createSession } from "@/lib/auth";
import { RegisterSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

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

    const { email, username, password, displayName } = validation.data;

    // 3. Uniqueness check (single query for both email & username).
    const existing = await db
      .select({ id: users.id, email: users.email, username: users.username })
      .from(users)
      .where(or(eq(users.email, email), eq(users.username, username)));

    if (existing.some((u) => u.email === email)) {
      return NextResponse.json({ error: "ایمیل قبلاً ثبت شده است" }, { status: 409 });
    }
    if (existing.some((u) => u.username === username)) {
      return NextResponse.json({ error: "نام کاربری قبلاً انتخاب شده است" }, { status: 409 });
    }

    // 4. Hash password.
    const hashedPassword = await hashPassword(password);

    // 5. Create user + player profile atomically.
    const user = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({ email, username, passwordHash: hashedPassword, displayName })
        .returning();

      await tx.insert(players).values({
        visibleUserId: created.id,
        username: created.username,
        displayName: created.displayName,
        email: created.email,
      });

      return created;
    });

    // 6. Create session.
    const token = await createSession(user.id, ip, userAgent);

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    });

    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });

    logger.info({ userId: user.id }, "User registered successfully");
    return response;
  } catch (err) {
    // Log full detail server-side for debugging, but never leak it to the client.
    logger.error({ err }, "Registration error");
    return NextResponse.json(
      { error: "ثبت‌نام با خطا مواجه شد. لطفاً بعداً دوباره امتحان کنید." },
      { status: 500 }
    );
  }
}
