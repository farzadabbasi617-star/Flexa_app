import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { validateAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ROLES = ["player", "judge", "moderator", "admin", "super_admin"] as const;

type Role = (typeof ROLES)[number];

export async function GET(request: NextRequest) {
  try {
    const { error, status } = await validateAdmin(request);
    if (error) return NextResponse.json({ error }, { status });

    const allUsers = await db
      .select({
        id: users.id,
        phoneNumber: users.phoneNumber,
        email: users.email,
        username: users.username,
        displayName: users.displayName,
        role: users.role,
        isVerified: users.isVerified,
        clashRoyaleId: users.clashRoyaleId,
        codMobileId: users.codMobileId,
        fortniteId: users.fortniteId,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    return NextResponse.json(allUsers);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user: currentUser, error, status } = await validateAdmin(request);
    if (error || !currentUser) return NextResponse.json({ error }, { status });

    const body = await request.json();
    const { id, role, isVerified } = body;

    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const updateData: Record<string, unknown> = {};

    if (role !== undefined) {
      if (!ROLES.includes(role as Role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }

      // Only the main manager can choose admins or change super-admin roles.
      if ((role === "admin" || role === "super_admin") && currentUser.role !== "super_admin") {
        return NextResponse.json({ error: "Only super admin can assign admin roles" }, { status: 403 });
      }

      updateData.role = role;
    }

    if (isVerified !== undefined) updateData.isVerified = Boolean(isVerified);

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning({ id: users.id, role: users.role, isVerified: users.isVerified });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
