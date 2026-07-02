import { db } from "@/db";
import { verificationTokens, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import logger from "@/lib/logger";

const OTP_TTL_MS = 15 * 60 * 1000; // 15 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute between resend requests

/**
 * Thrown for expected, user-facing verification failures (bad/expired
 * code). API routes should catch specifically this type and show its
 * message directly; any other thrown error (DB connectivity, etc.) should
 * be logged and replaced with a generic message so raw SQL/error internals
 * are never leaked to the client.
 */
export class InvalidOtpError extends Error {}


// Verification tokens are keyed by "email:<address>" so the same table can
// later host other kinds of OTPs (e.g. phone) without colliding on the
// plain identifier.
function emailIdentifier(email: string) {
  return `email:${email.trim().toLowerCase()}`;
}

function hashOtpToken(identifier: string, token: string) {
  const pepper = process.env.OTP_TOKEN_PEPPER || process.env.ADMIN_SETUP_SECRET || "gament-otp-v1";
  return crypto.createHmac("sha256", pepper).update(`${identifier}:${token}`).digest("hex");
}

function otpEmailHtml(code: string) {
  return `
  <div style="font-family: 'Segoe UI', Tahoma, sans-serif; background:#050508; padding:32px; color:#fff;">
    <div style="max-width:420px;margin:0 auto;background:#111114;border-radius:20px;padding:32px;border:1px solid rgba(168,85,247,.25);">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:22px;font-weight:900;background:linear-gradient(90deg,#c084fc,#67e8f9);-webkit-background-clip:text;background-clip:text;color:transparent;">GAMENT</div>
      </div>
      <p style="font-size:14px;line-height:1.9;color:#d1d5db;margin:0 0 20px;">
        کد تایید حساب گیمنت شما:
      </p>
      <div style="text-align:center;margin-bottom:20px;">
        <span style="display:inline-block;font-size:32px;font-weight:900;letter-spacing:8px;color:#c084fc;background:rgba(168,85,247,.12);border:1px solid rgba(168,85,247,.3);border-radius:14px;padding:14px 24px;">${code}</span>
      </div>
      <p style="font-size:12px;color:#9ca3af;line-height:1.8;margin:0;">
        این کد تا ۱۵ دقیقه معتبر است. اگر این درخواست را شما نداده‌اید، این ایمیل را نادیده بگیرید.
      </p>
    </div>
  </div>`;
}

async function sendViaResend(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "Gament <onboarding@resend.dev>";

  if (!apiKey) {
    logger.warn("RESEND_API_KEY missing. Email not sent.");
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      logger.error({ status: res.status, data }, "Resend email send failed");
      return false;
    }
    return true;
  } catch (error) {
    logger.error({ error }, "Resend connection error");
    return false;
  }
}

export const EmailService = {
  /**
   * Generate a 6-digit OTP for the given email and send it via Resend.
   * The plaintext code is never stored — only an HMAC hash, bound to the
   * email so the same numeric code for two addresses never produces the
   * same DB value.
   *
   * Returns { sent, code } — `code` is only populated outside production
   * (or when RESEND_API_KEY is missing) so local/dev testing doesn't
   * require a working email provider.
   */
  async sendVerificationCode(email: string): Promise<{ sent: boolean; code?: string; cooldownMs?: number }> {
    const identifier = emailIdentifier(email);

    const [existing] = await db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.identifier, identifier));

    if (existing) {
      const age = Date.now() - existing.createdAt.getTime();
      if (age < RESEND_COOLDOWN_MS) {
        return { sent: false, cooldownMs: RESEND_COOLDOWN_MS - age };
      }
    }

    const code = crypto.randomInt(100000, 999999).toString();
    const tokenHash = hashOtpToken(identifier, code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    // Keep only the latest live OTP per email.
    await db.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier));
    await db.insert(verificationTokens).values({
      identifier,
      token: tokenHash,
      expiresAt,
    });

    const delivered = await sendViaResend(
      email,
      "کد تایید حساب گیمنت | Gament",
      otpEmailHtml(code)
    );

    if (!delivered) {
      logger.warn({ email }, "Verification email not delivered (missing/failed provider)");
    }

    const exposeCode = process.env.NODE_ENV !== "production" || !process.env.RESEND_API_KEY;
    return { sent: true, code: exposeCode ? code : undefined };
  },

  /**
   * Verify the code for an email, and if valid, mark the matching user's
   * email as verified.
   */
  async verifyCode(email: string, code: string): Promise<boolean> {
    const identifier = emailIdentifier(email);
    const tokenHash = hashOtpToken(identifier, code);

    const [record] = await db
      .select()
      .from(verificationTokens)
      .where(and(eq(verificationTokens.identifier, identifier), eq(verificationTokens.token, tokenHash)));

    if (!record || record.expiresAt < new Date()) {
      throw new InvalidOtpError("کد تایید نامعتبر یا منقضی شده است");
    }

    await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.email, email.trim().toLowerCase()));

    await db.delete(verificationTokens).where(eq(verificationTokens.id, record.id));

    return true;
  },
};
