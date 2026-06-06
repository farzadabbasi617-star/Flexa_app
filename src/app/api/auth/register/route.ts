import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, players } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, createSession } from "@/lib/auth";
import { RegisterSchema } from "@/lib/validations";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    // 1. Input Validation
    const body = await request.json();
    const validation = RegisterSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ 
        error: "Validation failed: " + validation.error.issues[0].message 
      }, { status: 400 });
    }

    const { email, username, password, displayName } = validation.data;

    // 2. DB Connection Check & Existing User Check
    try {
      const [existingEmail] = await db.select().from(users).where(eq(users.email, email));
      if (existingEmail) return NextResponse.json({ error: "ایمیل قبلاً ثبت شده است" }, { status: 400 });

      const [existingUsername] = await db.select().from(users).where(eq(users.username, username));
      if (existingUsername) return NextResponse.json({ error: "نام کاربری قبلاً انتخاب شده است" }, { status: 400 });
    } catch (e: any) {
      return NextResponse.json({ error: `Database connection error: ${e.message}` }, { status: 500 });
    }

    // 3. Password Hashing
    let hashedPassword;
    try {
      hashedPassword = await hashPassword(password);
    } catch (e: any) {
      return NextResponse.json({ error: `Encryption error: ${e.message}` }, { status: 500 });
    }

    // 4. User Creation
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
      return NextResponse.json({ error: `User table error: ${e.message}` }, { status: 500 });
    }

    // 5. Player Profile Creation
    try {
      await db.insert(players).values({
        visibleUserId: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
      });
    } catch (e: any) {
      return NextResponse.json({ error: `Player profile error: ${e.message}` }, { status: 500 });
    }

    // 6. Session Creation
    let token;
    try {
      token = await createSession(user.id, ip, userAgent);
    } catch (e: any) {
      return NextResponse.json({ error: `Session error: ${e.message}` }, { status: 500 });
    }

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

    return response;

  } catch (err: any) {
    return NextResponse.json({ 
      error: `Critical Server Error: ${err.message || "Unknown error"}` 
    }, { status: 500 });
  }
}
