import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/db";
import { players, users, wallets } from "@/db/schema";
import { eq, or, ilike } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";
import { RegisterSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { EmailService } from "@/lib/email-service";
import logger from "@/lib/logger";
import { TERMS_VERSION } from "@/lib/terms";

export const dynamic = "force-dynamic";

async function generateUniqueGamentId() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `FLX-${crypto.randomInt(1000, 10000)}`;
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.gamentId, candidate))
      .limit(1);

    if (!existing) return candidate;
  }

  return `FLX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";

    // Mobile number is still required (used as an identifier/contact and for
    // login), but the account is confirmed via an emailed OTP instead of SMS
    // — no SMS panel/provider needed.

    // 1. Rate limit — protect against signup spam / abuse.
    const limit = await rateLimit(`register:${ip}`, 5, 60 * 60 * 1000); // 5 / hour / IP
    if (!limit.success) {
      return NextResponse.json(
        { error: "تعداد تلاش‌ها بیش از حد مجاز است. لطفاً بعداً دوباره امتحان کنید." },
        { status: 429 }
      );
    }

    // 2. Input validation.
    const body = await request.json();
    const validation = RegisterSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { email, username, password, firstName, lastName, phoneNumber, birthDate, nationalId } = validation.data;
    const displayName = `${firstName} ${lastName}`.trim();

    // 3. Uniqueness check using ilike for case-insensitive checks.
    // National ID is also checked here — each real person may only have one
    // paid-eligible account. We look it up separately (not in the OR above)
    // to give a specific error message.
    const existing = await db
      .select({ id: users.id, email: users.email, username: users.username, phoneNumber: users.phoneNumber, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(or(ilike(users.email, email), ilike(users.username, username), eq(users.phoneNumber, phoneNumber)));

    const [existingByNationalId] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.nationalId, nationalId))
      .limit(1);

    const existingByEmail = existing.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    const reclaimingStaleAccount = Boolean(existingByEmail && !existingByEmail.emailVerifiedAt);

    if (existingByEmail && !reclaimingStaleAccount) {
      return NextResponse.json({ error: "ایمیل قبلاً ثبت شده است" }, { status: 409 });
    }
    if (existing.some((u) => u.username === username && u.id !== existingByEmail?.id)) {
      return NextResponse.json({ error: "نام کاربری قبلاً انتخاب شده است" }, { status: 409 });
    }
    if (existing.some((u) => u.phoneNumber === phoneNumber && u.id !== existingByEmail?.id)) {
      return NextResponse.json({ error: "شماره موبایل قبلاً ثبت شده است" }, { status: 409 });
    }
    // National-ID must be unique across the site, EXCEPT when it belongs to
    // the same abandoned-unverified row we're about to reclaim (same email).
    if (existingByNationalId && existingByNationalId.id !== existingByEmail?.id) {
      return NextResponse.json(
        { error: "این کد ملی قبلاً برای حساب دیگری ثبت شده است." },
        { status: 409 }
      );
    }

    // 4. Hash password.
    const hashedPassword = await hashPassword(password);

    // 5. Create (or reclaim an abandoned, never-verified) user + player
    // profile + empty wallet atomically. No session cookie yet — the
    // account only becomes usable after the email OTP is confirmed via
    // /api/auth/verify-email.
    const user = await db.transaction(async (tx) => {
      let created;

      if (reclaimingStaleAccount && existingByEmail) {
        // A previous signup attempt with this email never completed OTP
        // verification. Rather than leaving an orphaned, permanently
        // unverified row (or failing the FK-referenced delete of its
        // players/wallets rows), overwrite it in place with the new
        // registration details.
        [created] = await tx
          .update(users)
          .set({
            phoneNumber,
            username,
            passwordHash: hashedPassword,
            firstName,
            lastName,
            displayName,
            email,
            birthDate,
            nationalId,
            phoneVerifiedAt: null,
            emailVerifiedAt: null,
            isVerified: false,
            termsAcceptedAt: new Date(),
            termsVersion: TERMS_VERSION,
          })
          .where(eq(users.id, existingByEmail.id))
          .returning();

        await tx
          .update(players)
          .set({
            username: created.username!,
            displayName: created.displayName,
            email: created.email,
          })
          .where(eq(players.visibleUserId, created.id));
      } else {
        const gamentId = await generateUniqueGamentId();
        [created] = await tx
          .insert(users)
          .values({
            phoneNumber,
            gamentId,
            username,
            passwordHash: hashedPassword,
            firstName,
            lastName,
            displayName,
            email,
            birthDate,
            nationalId,
            phoneVerifiedAt: null,
            emailVerifiedAt: null,
            isVerified: false,
            termsAcceptedAt: new Date(),
            termsVersion: TERMS_VERSION,
          })
          .returning();

        await tx.insert(players).values({
          visibleUserId: created.id,
          username: created.username!,
          displayName: created.displayName,
          email: created.email,
        });

        await tx.insert(wallets).values({
          userId: created.id,
          balance: "0",
          currency: "RIAL",
        });
      }

      return created;
    });

    // 6. Send the email OTP. If email delivery is not configured, the OTP
    // is still generated (see EmailService) so the account can be verified
    // manually in development.
    await EmailService.sendVerificationCode(user.email!);

    logger.info({ userId: user.id, authMode: "email_otp_pending" }, "User registered, awaiting email verification");

    return NextResponse.json(
      {
        pendingVerification: true,
        email: user.email,
      },
      { status: 201 }
    );
  } catch (err) {
    // Log full detail server-side for debugging, but never leak secrets to the client.
    logger.error({ err }, "Registration error");
    return NextResponse.json(
      {
        error:
          "ثبت‌نام با خطا مواجه شد. اگر /api/health وضعیت دیتابیس را false نشان می‌دهد، DATABASE_URL در Render درست تنظیم نشده است.",
      },
      { status: 500 }
    );
  }
}
