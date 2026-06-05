import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { validateSession } from "@/lib/auth";

export const dynamic = "force-dynamic";


// Makes the current logged-in user an admin (only works if no admin exists yet)
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const ua = request.headers.get('user-agent') || 'unknown';

    if (!token) return NextResponse.json({ error: "Login first" }, { status: 401 });

    const user = await validateSession(token, ip, ua, request);
    if (!user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

    // Check if any admin already exists
    const [adminCount] = await db
      .select({ v: count() })
      .from(users)
      .where(eq(users.role, "admin"));

    if (adminCount.v > 0) {
      return NextResponse.json({ error: "Admin already exists" }, { status: 400 });
    }

    // Make current user admin
    await db
      .update(users)
      .set({ role: "admin" })
      .where(eq(users.id, user.id));

    return NextResponse.json({
      success: true,
      message: `${user.displayName} is now admin`,
    });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
