import { db } from "@/db";
import { users, sessions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import logger from "@/lib/logger";
import { NextRequest } from "next/server";

export function generateToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export async function validateAdmin(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  const ip = request.ip || 'unknown';
  const ua = request.headers.get('user-agent') || 'unknown';

  const user = await validateSession(token || '', ip, ua);

  if (!user) {
    return { user: null, error: "Unauthorized", status: 401 };
  }

  if (user.role !== 'admin' && user.role !== 'super_admin') {
    logger.warn({ userId: user.id, role: user.role }, 'Unauthorized admin access attempt');
    return { user: null, error: "Forbidden: Admin access required", status: 403 };
  }

  return { user, error: null };
}

export async function createSession(userId: string, ip: string, userAgent: string): Promise<string> {
// ...
  return crypto.randomBytes(48).toString("hex");
}

export async function createSession(userId: string, ip: string, userAgent: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

  await db.insert(sessions).values({
    userId,
    token,
    expiresAt,
    ipAddress: ip,
    userAgent: userAgent,
  });

  return token;
}

export async function validateSession(token: string, currentIp: string, currentUserAgent: string) {
  if (!token) return null;

  try {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token));

    if (!session) return null;

    // 1. Expiration check
    if (new Date() > session.expiresAt) {
      await deleteSession(token);
      return null;
    }

    // 2. Hijacking Protection: IP & User-Agent Verification
    // We check if the device has changed. In some cases (mobile data), IP might change, 
    // but User-Agent rarely does. We log warnings for IP changes.
    if (session.userAgent !== currentUserAgent) {
      logger.warn({ userId: session.userId, oldUA: session.userAgent, newUA: currentUserAgent }, 'Session User-Agent mismatch - Possible Hijacking!');
      await deleteSession(token);
      return null;
    }

    if (session.ipAddress !== currentIp) {
      logger.info({ userId: session.userId, oldIp: session.ipAddress, newIp: currentIp }, 'Session IP address changed');
      // We don't necessarily kill the session for IP change (due to mobile roaming), 
      // but we could trigger a re-auth or rotation.
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, session.userId));

    return user || null;
  } catch (error) {
    logger.error({ error }, 'Session validation error');
    return null;
  }
}

export async function rotateSession(oldToken: string, currentIp: string, currentUserAgent: string): Promise<string | null> {
  try {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, oldToken));

    if (!session) return null;

    const newToken = generateToken();
    
    await db.update(sessions)
      .set({ 
        token: newToken,
        ipAddress: currentIp,
        userAgent: currentUserAgent 
      })
      .where(eq(sessions.id, session.id));

    return newToken;
  } catch (error) {
    logger.error({ error }, 'Session rotation failed');
    return null;
  }
}

export async function deleteSession(token: string) {
  if (!token) return;
  try {
    await db.delete(sessions).where(eq(sessions.token, token));
  } catch (error) {
    logger.error({ error }, 'Session deletion error');
  }
}
