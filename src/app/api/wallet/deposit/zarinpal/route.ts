/**
 * Start an online wallet top-up through ZarinPal.
 *
 * Creates a pending deposit transaction first, then asks ZarinPal for an
 * authority. The pending row is the source of truth for the amount at verify
 * time, so the callback never trusts a number supplied by the browser.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, wallets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import { checkAgeGate } from "@/lib/age-gate";
import { parseTomanToRial, rialToTomanNumber } from "@/lib/money";
import { createWalletReference, validateDepositAmountRial } from "@/lib/wallet-security";
import { getZarinpalConfiguration, requestPayment } from "@/lib/zarinpal";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const gateway = getZarinpalConfiguration();
    if (!gateway.live) {
      return NextResponse.json(
        { error: "پرداخت آنلاین در حال حاضر فعال نیست. لطفاً از روش کارت‌به‌کارت استفاده کنید." },
        { status: 503 }
      );
    }

    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    const user = await validateSession(token || "", ip, userAgent, request);
    if (!user) {
      return NextResponse.json({ error: "برای شارژ کیف پول ابتدا وارد شوید." }, { status: 401 });
    }

    // Deposits fund paid tournaments, so the same age gate as the manual flow applies.
    const gate = checkAgeGate({ birthDate: user.birthDate, nationalId: user.nationalId });
    if (!gate.ok) {
      return NextResponse.json({ error: gate.message }, { status: 403 });
    }

    const limit = await rateLimit(`wallet:deposit:zarinpal:${user.id}`, 8, 10 * 60 * 1000);
    if (!limit.success) {
      return NextResponse.json(
        { error: "تعداد درخواست‌های شارژ بیش از حد مجاز است. کمی بعد دوباره تلاش کنید." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));

    if (body?.acceptTerms !== true) {
      return NextResponse.json(
        { error: "برای شارژ کیف پول باید قوانین را مطالعه و تأیید کنید." },
        { status: 400 }
      );
    }

    const amountRial = parseTomanToRial(String(body?.amountToman ?? ""));
    const amountCheck = validateDepositAmountRial(amountRial);
    if (!amountCheck.ok) {
      return NextResponse.json({ error: amountCheck.error }, { status: 400 });
    }

    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, user.id)).limit(1);
    const walletRow =
      wallet ||
      (
        await db
          .insert(wallets)
          .values({ userId: user.id, balance: "0", currency: "RIAL" })
          .onConflictDoNothing({ target: wallets.userId })
          .returning()
      )[0] ||
      (await db.select().from(wallets).where(eq(wallets.userId, user.id)).limit(1))[0];

    if (!walletRow) {
      return NextResponse.json({ error: "کیف پول یافت نشد." }, { status: 500 });
    }

    const reference = createWalletReference("deposit");
    const amountToman = rialToTomanNumber(amountRial);

    const [pending] = await db
      .insert(transactions)
      .values({
        walletId: walletRow.id,
        amount: amountRial.toString(),
        type: "deposit",
        status: "pending",
        referenceId: reference,
        metadata: {
          method: "zarinpal",
          gateway: "zarinpal",
          sandbox: gateway.sandbox,
          amountToman,
          requestedAt: new Date().toISOString(),
        },
      })
      .returning();

    const callbackUrl = `${gateway.callbackBaseUrl}/api/wallet/deposit/zarinpal/callback?ref=${encodeURIComponent(reference)}`;

    const result = await requestPayment({
      amountRial,
      description: `شارژ کیف پول گیمنت - ${amountToman.toLocaleString("fa-IR")} تومان`,
      callbackUrl,
      mobile: user.phoneNumber ?? null,
      email: user.email ?? null,
      orderId: reference,
    });

    if (!result.ok) {
      await db
        .update(transactions)
        .set({
          status: "failed",
          metadata: {
            method: "zarinpal",
            gateway: "zarinpal",
            amountToman,
            failedAt: new Date().toISOString(),
            failureReason: result.error,
            gatewayCode: result.code ?? null,
          },
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, pending.id));

      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    await db
      .update(transactions)
      .set({
        metadata: {
          method: "zarinpal",
          gateway: "zarinpal",
          sandbox: gateway.sandbox,
          amountToman,
          authority: result.authority,
          requestedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, pending.id));

    logger.info(
      { userId: user.id, reference, amountToman },
      "ZarinPal deposit initiated"
    );

    return NextResponse.json({ paymentUrl: result.paymentUrl, reference });
  } catch (error) {
    logger.error({ error }, "ZarinPal deposit initiation failed");
    return NextResponse.json({ error: "شروع پرداخت با خطا مواجه شد." }, { status: 500 });
  }
}
