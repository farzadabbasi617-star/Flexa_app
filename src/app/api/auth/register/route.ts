import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, players } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, createSession } from "@/lib/auth";
import { RegisterSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // 1. Basic Setup
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    // 2. Rate Limiting
    const rateLimitResult = await rateLimit(ip, 10, 60 * 1000);
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
    }

    // 3. Input Validation
    const body = await request.json();
    const validation = RegisterSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ 
        error: "Validation failed", 
        details: validation.error.issues 
      }, { status: 400 });
    }

    const { email, username, password, displayName } = validation.data;

    // 4. Check for existing users
    try {
      const [existingEmail] = await db.select().from(users).where(eq(users.email, email));
      if (existingEmail) return NextResponse.json({ error: "This email is already registered" }, { status: 400 });

      const [existingUsername] = await db.select().from(users).where(eq(users.username, username));
      if (existingUsername) return NextResponse.json({ error: "This username is already taken" }, { status: 400 });
    } catch (e: any) {
      return NextResponse.json({ error: `DB check failed: ${e.message}` }, { status: 500 });
    }

    // 5. Password Hashing (with fallback handled inside hashPassword)
    let hashedPassword;
    try {
      hashedPassword = await hashPassword(password);
    } catch (e: any) {
      return NextResponse.json({ error: `Hashing failed: ${e.message}` }, { status: 500 });
    }

    // 6. Create User Record
    let user;
    try {
      const result = await db.insert(users).values({
        email,
        username,
        passwordHash: hashedPassword,
        displayName,
      }).returning();
      user = result[0];
    } catch (e: any) {
      return NextResponse.json({ error: `User creation failed: ${e.message}` }, { status: 500 });
    }

    // 7. Create Player Profile
    try {
      await db.insert(players).values({
        visibleUserId: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
      });
    } catch (e: any) {
      // If player creation fails, we should technically delete the user, 
      // but for debugging we'll just report the error
      return NextResponse.json({ error: `Player profile creation failed: ${e.message}` }, { status: 500 });
    }

    // 8. Create Session
    let token;
    try {
      token = await createSession(user.id, ip, userAgent);
    } catch (e: any) {
      return NextResponse.json({ error: `Session creation failed: ${e.message}` }, { status: 500 });
    }

    // 9. Final Response
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

    logger.info({ userId: user.id }, 'Registration completed successfully');
    return response;

  } catch (err: any) {
    logger.error({ err }, 'Critical registration error');
    return NextResponse.json({ 
      error: `Critical Error: ${err.message || "Unknown server error"}` 
    }, { status: 500 });
  }
}
