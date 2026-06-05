import { db } from "@/db";
import { users, sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { hashPassword as bcryptHash, comparePassword as bcryptCompare } from "@/lib/auth-utils";

export async function hashPassword(password: string): Promise<string> {
  return await bcryptHash(password);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcryptCompare(password, hash);
}

export function generateToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export async function createSession(userId: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

  await db.insert(sessions).values({
    userId,
    token,
    expiresAt,
  });

  return token;
}

export async function validateSession(token: string) {
  if (!token) return null;

  try {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token));

    if (!session) return null;

    if (new Date() > session.expiresAt) {
      await db.delete(sessions).where(eq(sessions.id, session.id));
      return null;
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, session.userId));

    return user || null;
  } catch {
    return null;
  }
}

export async function deleteSession(token: string) {
  if (!token) return;
  try {
    await db.delete(sessions).where(eq(sessions.token, token));
  } catch {
    // ignore
  }
}
