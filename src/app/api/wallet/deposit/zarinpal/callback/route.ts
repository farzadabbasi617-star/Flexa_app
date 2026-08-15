/**
 * ZarinPal return URL. This is the only place a gateway deposit is credited.
 *
 * Threat model, since this endpoint is reachable by anyone:
 *
 *  - The amount is read from our own pending row, never from the query string.
 *  - The row is claimed with a conditional UPDATE (status pending -> completed)
 *    before the balance moves, so two concurrent callbacks cannot both credit.
 *  - The authority in the query string must match the one we stored for that
 *    reference, so a valid authority from one user cannot settle another's row.
 *  - Verification happens against ZarinPal before any credit is applied.
 *
 * The user is redirected to /payment/success or /payment/failed either way;
 * errors are never rendered as raw JSON to someone coming back from a bank.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, wallets, notifications } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { verifyPayment, getZarinpalConfiguration } from "@/lib/zarinpal";
import { rialToTomanNumber } from "@/lib/money";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

function siteUrl(path: string) {
  const base = getZarinpalConfiguration().callbackBaseUrl;
  return `${base}${path}`;
}

function fail(reason: string) {
  return NextResponse.redirect(siteUrl(`/payment/failed?reason=${encodeURIComponent(reason)}`), 303);
}

function succeed(refId: string) {
  return NextResponse.redirect(siteUrl(`/payment/success?ref=${encodeURIComponent(refId)}`), 303);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const reference = params.get("ref") || "";
  const authority = params.get("Authority") || params.get("authority") || "";
  const status = (params.get("Status") || params.get("status") || "").toUpperCase();

  try {
    if (!reference || !authority) {
      return fail("پارامترهای بازگشت از درگاه ناقص است.");
    }

    const [pending] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.referenceId, reference))
      .limit(1);

    if (!pending) {
      logger.warn({ reference }, "ZarinPal callback for unknown reference");
      return fail("تراکنش یافت نشد.");
    }

    const meta = (pending.metadata || {}) as Record<string, unknown>;

    // Bind the authority to the row we issued it for.
    if (meta.authority && meta.authority !== authority) {
      logger.error({ reference }, "ZarinPal callback authority mismatch");
      return fail("اطلاعات تراکنش معتبر نیست.");
    }

    if (pending.status === "completed") {
      // User refreshed the return page, or ZarinPal called back twice.
      return succeed(String(meta.refId || ""));
    }

    if (pending.status !== "pending") {
      return fail("این تراکنش قبلاً بسته شده است.");
    }

    // User cancelled at the bank page.
    if (status !== "OK") {
      await db
        .update(transactions)
        .set({
          status: "cancelled",
          metadata: { ...meta, cancelledAt: new Date().toISOString(), gatewayStatus: status || "NOK" },
          updatedAt: new Date(),
        })
        .where(and(eq(transactions.id, pending.id), eq(transactions.status, "pending")));

      return fail("پرداخت توسط شما لغو شد.");
    }

    const amountRial = BigInt(pending.amount);

    const verification = await verifyPayment({ authority, amountRial });

    if (!verification.ok) {
      await db
        .update(transactions)
        .set({
          status: "failed",
          metadata: {
            ...meta,
            failedAt: new Date().toISOString(),
            failureReason: verification.error,
            gatewayCode: verification.code ?? null,
          },
          updatedAt: new Date(),
        })
        .where(and(eq(transactions.id, pending.id), eq(transactions.status, "pending")));

      return fail(verification.error);
    }

    // Claim the row. Only the request that flips pending -> completed may credit
    // the wallet; a concurrent duplicate sees rowCount 0 and skips the credit.
    const claimed = await db
      .update(transactions)
      .set({
        status: "completed",
        metadata: {
          ...meta,
          refId: verification.refId,
          cardPan: verification.cardPan ?? null,
          feeRial: verification.feeRial,
          verifiedAt: new Date().toISOString(),
          alreadyVerified: verification.alreadyVerified,
        },
        updatedAt: new Date(),
      })
      .where(and(eq(transactions.id, pending.id), eq(transactions.status, "pending")))
      .returning({ id: transactions.id });

    if (claimed.length === 0) {
      // Someone else already settled it. The payment is still valid.
      return succeed(verification.refId);
    }

    await db
      .update(wallets)
      .set({
        balance: sql`(${wallets.balance})::numeric + ${amountRial.toString()}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, pending.walletId));

    const [wallet] = await db.select().from(wallets).where(eq(wallets.id, pending.walletId)).limit(1);

    if (wallet) {
      await db.insert(notifications).values({
        userId: wallet.userId,
        type: "wallet",
        title: "شارژ کیف پول انجام شد",
        message: `مبلغ ${rialToTomanNumber(amountRial).toLocaleString("fa-IR")} تومان به کیف پول شما اضافه شد. شماره پیگیری: ${verification.refId}`,
        link: "/wallet",
      });
    }

    logger.info(
      { reference, refId: verification.refId, amountToman: rialToTomanNumber(amountRial) },
      "ZarinPal deposit credited"
    );

    return succeed(verification.refId);
  } catch (error) {
    logger.error({ error, reference }, "ZarinPal callback failed");
    return fail("خطای غیرمنتظره در تأیید پرداخت.");
  }
}
