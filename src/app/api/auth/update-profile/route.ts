import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateSession } from "@/lib/auth";

export async function PATCH(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await validateSession(token);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      displayName,
      clashRoyaleId,
      clashRoyaleUsername,
      codMobileId,
      codMobileUsername,
      fortniteId,
      fortniteUsername,
    } = body;

    const updateData: Record<string, string | null> = {};

    if (displayName !== undefined) updateData.displayName = displayName;
    if (clashRoyaleId !== undefined) updateData.clashRoyaleId = clashRoyaleId || null;
    if (clashRoyaleUsername !== undefined) updateData.clashRoyaleUsername = clashRoyaleUsername || null;
    if (codMobileId !== undefined) updateData.codMobileId = codMobileId || null;
    if (codMobileUsername !== undefined) updateData.codMobileUsername = codMobileUsername || null;
    if (fortniteId !== undefined) updateData.fortniteId = fortniteId || null;
    if (fortniteUsername !== undefined) updateData.fortniteUsername = fortniteUsername || null;

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, user.id))
      .returning();

    return NextResponse.json({
      user: {
        id: updated.id,
        email: updated.email,
        username: updated.username,
        displayName: updated.displayName,
        role: updated.role,
        avatarUrl: updated.avatarUrl,
        clashRoyaleId: updated.clashRoyaleId,
        clashRoyaleUsername: updated.clashRoyaleUsername,
        codMobileId: updated.codMobileId,
        codMobileUsername: updated.codMobileUsername,
        fortniteId: updated.fortniteId,
        fortniteUsername: updated.fortniteUsername,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
