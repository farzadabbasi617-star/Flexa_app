import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateSession } from "@/lib/auth";

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  if (!token) return null;
  const user = await validateSession(token);
  if (!user || user.role !== "admin") return null;
  return user;
}

export async function GET() {
  try {
    const settings = await db.select().from(siteSettings);
    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.key] = s.value || "";
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({});
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    for (const [key, value] of Object.entries(body)) {
      const [existing] = await db
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.key, key));

      if (existing) {
        await db
          .update(siteSettings)
          .set({ value: String(value), updatedAt: new Date() })
          .where(eq(siteSettings.key, key));
      } else {
        await db
          .insert(siteSettings)
          .values({ key, value: String(value) });
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
