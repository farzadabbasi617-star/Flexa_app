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

export async function validateSession(token: string, currentIp: string, currentUserAgent: string, request?: NextRequest) {
  if (!token) return null;

  try {
    // 1. CSRF Protection for mutating requests
    if (request && ['POST', 'PATCH', 'DELETE', 'PUT'].includes(request.method)) {
      const csrfHeader = request.headers.get('x-requested-with');
      if (!csrfHeader) {
        logger.warn({ ip: currentIp }, 'CSRF attempt detected: Missing X-Requested-With header');
        return null;
      }
    }

    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token));

    if (!session) return null;

    // 2. Expiration check
    if (new Date() > session.expiresAt) {
      await deleteSession(token);
      return null;
    }

    // 3. Hijacking Protection: User-Agent Verification
    if (session.userAgent !== currentUserAgent) {
      logger.warn({ userId: session.userId, oldUA: session.userAgent, newUA: currentUserAgent }, 'Session User-Agent mismatch - Possible Hijacking!');
      await deleteSession(token);
      return null;
    }

    // 4. Automatic Session Rotation (every 15 minutes)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (session.createdAt < fifteenMinutesAgo) {
      // We rotate the token in the background
      const newToken = generateToken();
      await db.update(sessions)
        .set({ token: newToken })
        .where(eq(sessions.id, session.id));
      
      // We can't easily set the cookie here because this is a helper, 
      // so we signal that rotation happened via a custom property
      // The API route will then set the new cookie.
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
