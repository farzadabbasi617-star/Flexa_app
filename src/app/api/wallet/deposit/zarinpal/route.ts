/**
 * Start an online wallet top-up through ZarinPal (web).
 *
 * The pending transaction and the gateway request are created by
 * startZarinpalDeposit, shared with the Telegram bot so both entry points
 * produce rows the single callback route can settle identically.
 */
import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { checkAgeGate } from "@/lib/age-gate";
import { parseTomanToRial } from "@/lib/money";
import { startZarinpalDeposit } from "@/lib/zarinpal-deposit";
import { getZarinpalConfiguration } from "@/lib/zarinpal";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    if (!getZarinpalConfiguration().live) {
      return NextResponse.json(
        { error: "شارژ کیف پول موقتاً در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید." },
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
      // Include a code and a destination so the caller can route the user to
      // the fix instead of only showing text they cannot act on. The wallet UI
      // checks this up front too; this covers a stale tab or a direct call.
      return NextResponse.json(
        { error: gate.message, code: gate.code, action: { label: "تکمیل اطلاعات هویتی", href: "/profile/user" } },
        { status: 403 }
      );
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

    const result = await startZarinpalDeposit({
      userId: user.id,
      amountRial: parseTomanToRial(String(body?.amountToman ?? "")),
      mobile: user.phoneNumber ?? null,
      email: user.email ?? null,
      origin: "web",
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ paymentUrl: result.paymentUrl, reference: result.reference });
  } catch (error) {
    logger.error({ error }, "ZarinPal deposit initiation failed");
    return NextResponse.json({ error: "شروع پرداخت با خطا مواجه شد." }, { status: 500 });
  }
}
