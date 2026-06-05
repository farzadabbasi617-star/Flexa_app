import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { verifyPassword, createSession } from "@/lib/auth";
import { LoginSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const ip = request.ip || 'unknown';
    const rateLimitResult = await rateLimit(ip, 5, 60 * 1000);
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: "Too many login attempts. Please try again later." }, { status: 429 });
    }

    const body = await request.json();
    const validation = LoginSchema.safeParse({
      identifier: body.emailOrUsername,
      password: body.password
    });

    if (!validation.success) {
      return NextResponse.json({ 
        error: "Validation failed", 
        details: validation.error.errors 
      }, { status: 400 });
    }

    const { identifier, password } = validation.data;

    const [user] = await db
      .select()
      .from(users)
      .where(
        or(
          eq(users.email, identifier),
          eq(users.username, identifier)
        )
      );

    if (!user) {
      logger.warn({ identifier }, 'Login attempt failed: User not found');
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      logger.warn({ userId: user.id }, 'Login attempt failed: Wrong password');
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    const token = await createSession(user.id);

    const response = NextResponse.json({
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

    response.cookies.set("session", token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });

    logger.info({ userId: user.id }, 'User logged in successfully');
    return response;
  } catch (err) {
    logger.error({ err }, 'Login error');
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
