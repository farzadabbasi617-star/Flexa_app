import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, players } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, createSession } from "@/lib/auth";
import { RegisterSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const ip = request.ip || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    const rateLimitResult = await rateLimit(ip, 10, 60 * 1000);
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const body = await request.json();
    const validation = RegisterSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ 
        error: "Validation failed", 
        details: validation.error.errors 
      }, { status: 400 });
    }

    const { email, username, password, fullName } = validation.data;

    const [existingEmail] = await db.select().from(users).where(eq(users.email, email));
    if (existingEmail) {
      return NextResponse.json({ error: "Email already registered" }, { status: 400 });
    }

    const [existingUsername] = await db.select().from(users).where(eq(users.username, username));
    if (existingUsername) {
      return NextResponse.json({ error: "Username already taken" }, { status: 400 });
    }

    const hashedPassword = await hashPassword(password);

    const [user] = await db
      .insert(users)
      .values({
        email,
        username,
        passwordHash: hashedPassword,
        displayName: fullName,
      })
      .returning();

    await db.insert(players).values({
      visibleUserId: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
    });

    const token = await createSession(user.id, ip, userAgent);

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
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });

    logger.info({ userId: user.id, email }, 'User registered successfully');
    return response;
  } catch (err) {
    logger.error({ err }, 'Registration error');
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
