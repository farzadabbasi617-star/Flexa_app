import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, wallets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { parseTomanToRial, rialToTomanNumber } from "@/lib/money";
import { paypingCallbackUrl, createPayPingPayment } from "@/lib/payping";
import { sanitizeWalletNote, validateDepositAmountRial } from "@/lib/wallet-security";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

async function getOrCreateWallet(userId: string) {
  const [existing] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(wallets)
    .values({ userId, balance: "0", currency: "RIAL" })
    .onConflictDoNothing({ target: wallets.userId })
    .returning();

  if (created) return created;
  const [afterConflict] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (!afterConflict) throw new Error("WALLET_CREATE_FAILED");
  return afterConflict;
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.user) return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status || 401 });

  try {
    if (!process.env.PAYPING_TOKEN?.trim()) {
      return NextResponse.json({ error: "درگاه پی‌پینگ هنوز روی سرور تنظیم نشده است." }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    if (body.acceptTerms !== true) {
      return NextResponse.json({ error: "برای شارژ کیف پول باید قوانین کیف پول را تأیید کنید." }, { status: 400 });
    }

    const amountRial = parseTomanToRial(String(body.amountToman || ""));
    const amountValidation = validateDepositAmountRial(amountRial);
    if (!amountValidation.ok) return NextResponse.json({ error: amountValidation.error }, { status: 400 });

    const amountToman = rialToTomanNumber(amountRial);
    const note = sanitizeWalletNote(body.note);
    const user = auth.user;
    const wallet = await getOrCreateWallet(user.id);

    const [tx] = await db
      .insert(transactions)
      .values({
        walletId: wallet.id,
        amount: amountRial.toString(),
        type: "deposit",
        status: "pending",
        referenceId: null,
        metadata: {
          kind: "payping_deposit",
          provider: "payping",
          withdrawable: false,
          userId: user.id,
          displayName: user.displayName,
          phoneNumber: user.phoneNumber,
          amountToman,
          note,
          createdFrom: "wallet_page",
        },
      })
      .returning();

    const referenceId = `payping-${tx.id}`;
    await db.update(transactions).set({ referenceId }).where(eq(transactions.id, tx.id));

    try {
      const payment = await createPayPingPayment({
        amountToman,
        payerName: user.displayName,
        payerIdentity: user.phoneNumber,
        description: `شارژ کیف پول Gament - ${user.displayName}`,
        returnUrl: paypingCallbackUrl(),
        clientRefId: tx.id,
      });

      await db
        .update(transactions)
        .set({
          metadata: {
            kind: "payping_deposit",
            provider: "payping",
            withdrawable: false,
            userId: user.id,
            displayName: user.displayName,
            phoneNumber: user.phoneNumber,
            amountToman,
            note,
            paypingCode: payment.code,
            paymentUrl: payment.paymentUrl,
            createdFrom: "wallet_page",
          },
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, tx.id));

      return NextResponse.json({
        success: true,
        transactionId: tx.id,
        referenceId,
        paymentUrl: payment.paymentUrl,
      }, { status: 201 });
    } catch (err) {
      await db
        .update(transactions)
        .set({ status: "failed", metadata: { kind: "payping_deposit", provider: "payping", error: err instanceof Error ? err.message : "PAYPING_CREATE_FAILED" }, updatedAt: new Date() })
        .where(eq(transactions.id, tx.id));
      throw err;
    }
  } catch (err) {
    logger.error({ err }, "PayPing create route failed");
    return NextResponse.json({ error: err instanceof Error ? err.message : "شروع پرداخت انجام نشد." }, { status: 500 });
  }
}
