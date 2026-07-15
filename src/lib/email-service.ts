import { db } from "@/db";
import { verificationTokens, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import logger from "@/lib/logger";
import { EMAIL_OTP_RESEND_COOLDOWN_SECONDS, EMAIL_OTP_TTL_MINUTES } from "@/lib/email-policy";

const OTP_TTL_MS = EMAIL_OTP_TTL_MINUTES * 60 * 1000;
const RESEND_COOLDOWN_MS = EMAIL_OTP_RESEND_COOLDOWN_SECONDS * 1000;

export class InvalidOtpError extends Error {}

function normalizedEmail(email: string) {
  return email.trim().toLowerCase();
}

function emailIdentifier(email: string) {
  return `email:${normalizedEmail(email)}`;
}

function passwordResetIdentifier(email: string) {
  return `password-reset:${normalizedEmail(email)}`;
}

function hashOtpToken(identifier: string, token: string) {
  const pepper = process.env.OTP_TOKEN_PEPPER || process.env.ADMIN_SETUP_SECRET || "gament-otp-v1";
  return crypto.createHmac("sha256", pepper).update(`${identifier}:${token}`).digest("hex");
}

function otpEmailHtml(input: {
  code: string;
  heading: string;
  description: string;
  warning: string;
}) {
  return `
  <div dir="rtl" style="font-family:Tahoma,'Segoe UI',sans-serif;background:#050508;padding:32px;color:#fff;">
    <div style="max-width:420px;margin:0 auto;background:#111114;border-radius:20px;padding:32px;border:1px solid rgba(168,85,247,.25);">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:22px;font-weight:900;color:#c084fc;">GAMENT</div>
      </div>
      <h1 style="font-size:18px;color:#fff;margin:0 0 12px;">${input.heading}</h1>
      <p style="font-size:14px;line-height:1.9;color:#d1d5db;margin:0 0 20px;">${input.description}</p>
      <div style="text-align:center;margin-bottom:20px;direction:ltr;">
        <span style="display:inline-block;font-size:32px;font-weight:900;letter-spacing:8px;color:#c084fc;background:rgba(168,85,247,.12);border:1px solid rgba(168,85,247,.3);border-radius:14px;padding:14px 24px;">${input.code}</span>
      </div>
      <p style="font-size:12px;color:#9ca3af;line-height:1.8;margin:0;">${input.warning}</p>
    </div>
  </div>`;
}

function resendFromAddress() {
  return process.env.RESEND_FROM_EMAIL || (
    process.env.NODE_ENV === "production"
      ? "Gament <noreply@gament1.ir>"
      : "Gament <onboarding@resend.dev>"
  );
}

export function getEmailDeliveryConfiguration() {
  const from = resendFromAddress();
  return {
    configured: Boolean(process.env.RESEND_API_KEY),
    from,
    sandboxSender: from.toLowerCase().includes("@resend.dev"),
  };
}

async function sendViaResend(to: string, subject: string, html: string, idempotencyKey?: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = resendFromAddress();
  if (!apiKey) {
    logger.warn("RESEND_API_KEY missing. Email not sent.");
    return false;
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: JSON.stringify({ from, to, subject, html }),
        signal: AbortSignal.timeout(12_000),
      });
      if (response.ok) return true;

      const data = await response.json().catch(() => ({}));
      const retryable = response.status === 429 || response.status >= 500;
      logger.error({ status: response.status, data, attempt, from }, "Resend email send failed");
      if (!retryable || attempt === 3) return false;
    } catch (error) {
      logger.error({ error, attempt }, "Resend connection error");
      if (attempt === 3) return false;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  return false;
}

async function createAndSendOtp(input: {
  identifier: string;
  email: string;
  subject: string;
  heading: string;
  description: string;
  warning: string;
}): Promise<{ sent: boolean; delivered: boolean; code?: string; cooldownMs?: number; reason?: "cooldown" | "delivery_failed" }> {
  const [existing] = await db
    .select()
    .from(verificationTokens)
    .where(eq(verificationTokens.identifier, input.identifier))
    .limit(1);

  if (existing) {
    const age = Date.now() - existing.createdAt.getTime();
    if (age < RESEND_COOLDOWN_MS) {
      return { sent: false, delivered: false, cooldownMs: RESEND_COOLDOWN_MS - age, reason: "cooldown" };
    }
  }

  const code = crypto.randomInt(100000, 1_000_000).toString();
  const tokenHash = hashOtpToken(input.identifier, code);
  await db.transaction(async (tx) => {
    await tx.delete(verificationTokens).where(eq(verificationTokens.identifier, input.identifier));
    await tx.insert(verificationTokens).values({
      identifier: input.identifier,
      token: tokenHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });
  });

  const idempotencyKey = `otp/${crypto.createHash("sha256").update(`${input.identifier}:${tokenHash}`).digest("hex")}`;
  const delivered = await sendViaResend(input.email, input.subject, otpEmailHtml({
    code,
    heading: input.heading,
    description: input.description,
    warning: input.warning,
  }), idempotencyKey);
  if (!delivered) logger.warn({ purpose: input.identifier.split(":")[0] }, "OTP email not delivered");

  const exposeCode = process.env.NODE_ENV !== "production" || !process.env.RESEND_API_KEY;
  return {
    sent: delivered || exposeCode,
    delivered,
    code: exposeCode ? code : undefined,
    reason: delivered || exposeCode ? undefined : "delivery_failed",
  };
}

async function consumeOtp(client: any, identifier: string, code: string) {
  const tokenHash = hashOtpToken(identifier, code);
  const [record] = await client
    .select()
    .from(verificationTokens)
    .where(and(
      eq(verificationTokens.identifier, identifier),
      eq(verificationTokens.token, tokenHash)
    ))
    .limit(1);

  if (!record || record.expiresAt < new Date()) {
    throw new InvalidOtpError("کد تایید نامعتبر یا منقضی شده است");
  }

  // Delete while the caller's transaction is still open. Concurrent reset
  // attempts cannot both commit because only one can consume the same row.
  const deleted = await client
    .delete(verificationTokens)
    .where(and(eq(verificationTokens.id, record.id), eq(verificationTokens.token, tokenHash)))
    .returning({ id: verificationTokens.id });
  if (!deleted.length) throw new InvalidOtpError("این کد قبلاً استفاده شده است");
}

export const EmailService = {
  sendVerificationCode(email: string) {
    const normalized = normalizedEmail(email);
    return createAndSendOtp({
      identifier: emailIdentifier(normalized),
      email: normalized,
      subject: "کد تایید حساب گیمنت | Gament",
      heading: "تایید حساب گیمنت",
      description: "کد تایید حساب شما:",
      warning: "این کد تا ۱۵ دقیقه معتبر است. اگر این درخواست را شما نداده‌اید، ایمیل را نادیده بگیرید.",
    });
  },

  sendPasswordResetCode(email: string) {
    const normalized = normalizedEmail(email);
    return createAndSendOtp({
      identifier: passwordResetIdentifier(normalized),
      email: normalized,
      subject: "بازیابی رمز عبور گیمنت | Gament",
      heading: "بازیابی رمز عبور",
      description: "برای انتخاب رمز عبور جدید، این کد ۶ رقمی را در گیمنت وارد کنید:",
      warning: "این کد ۱۵ دقیقه و فقط برای یک‌بار معتبر است. اگر این درخواست را شما نداده‌اید، رمز فعلی شما تغییری نمی‌کند.",
    });
  },

  async verifyCode(email: string, code: string): Promise<boolean> {
    const normalized = normalizedEmail(email);
    await db.transaction(async (tx) => {
      await consumeOtp(tx, emailIdentifier(normalized), code);
      await tx
        .update(users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(users.email, normalized));
    });
    return true;
  },

  consumePasswordResetCode(email: string, code: string, client: any = db) {
    return consumeOtp(client, passwordResetIdentifier(email), code);
  },

  async sendPasswordChangedNotice(email: string) {
    const html = `
      <div dir="rtl" style="font-family:Tahoma,sans-serif;background:#050508;padding:32px;color:#fff;">
        <div style="max-width:420px;margin:auto;background:#111114;border-radius:20px;padding:32px;border:1px solid #35204d;">
          <h1 style="color:#c084fc;font-size:20px;">رمز عبور تغییر کرد</h1>
          <p style="color:#d1d5db;line-height:1.9;">رمز عبور حساب گیمنت شما با موفقیت تغییر کرد و همه نشست‌های قبلی بسته شدند.</p>
          <p style="color:#fca5a5;font-size:12px;line-height:1.8;">اگر این کار را شما انجام نداده‌اید، فوراً با پشتیبانی گیمنت تماس بگیرید.</p>
        </div>
      </div>`;
    return sendViaResend(normalizedEmail(email), "رمز عبور گیمنت تغییر کرد", html);
  },
};
