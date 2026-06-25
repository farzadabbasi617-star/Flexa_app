import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, wallets } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { bigIntFromText, rialToTomanNumber } from "@/lib/money";
import { verifyPayPingPayment } from "@/lib/payping";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

function appUrl() {
  return (process.env.APP_URL || "https://www.gament1.ir").replace(/\/$/, "");
}

function readParam(request: NextRequest, names: string[]) {
  for (const name of names) {
    const value = request.nextUrl.searchParams.get(name);
    if (value) return value;
  }
  return "";
}

function metadataObject(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
}

async function handleCallback(request: NextRequest, body?: Record<string, unknown>) {
  const refId = String(body?.refid || body?.refId || readParam(request, ["refid", "refId", "RefId"]) || "").trim();
  const clientRefId = String(body?.clientrefid || body?.clientRefId || body?.clientRefID || readParam(request, ["clientrefid", "clientRefId", "clientRefID"]) || "").trim();
  const code = String(body?.code || readParam(request, ["code", "Code"]) || "").trim();
  const cardNumber = String(body?.cardnumber || body?.cardNumber || readParam(request, ["cardnumber", "cardNumber"]) || "").trim();
  const cardHash = String(body?.cardhash || body?.cardHash || readParam(request, ["cardhash", "cardHash"]) || "").trim();

  if (!refId || !clientRefId) {
    return NextResponse.redirect(`${appUrl()}/payment/failed?reason=missing_payment_data`);
  }

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from transactions where id = ${clientRefId} for update`);

      const [paymentTx] = await tx.select().from(transactions).where(eq(transactions.id, clientRefId)).limit(1);
      if (!paymentTx || paymentTx.type !== "deposit") throw new Error("TRANSACTION_NOT_FOUND");

      const meta = metadataObject(paymentTx.metadata);
      if (meta.provider !== "payping") throw new Error("INVALID_PROVIDER");

      if (paymentTx.status === "completed") {
        return { alreadyCompleted: true, transaction: paymentTx };
      }
      if (paymentTx.status !== "pending") throw new Error("TRANSACTION_NOT_PENDING");

      const amountRial = bigIntFromText(paymentTx.amount);
      const amountToman = rialToTomanNumber(amountRial);
      const verifyPayload = await verifyPayPingPayment({ amountToman, refId });

      const [wallet] = await tx.select().from(wallets).where(eq(wallets.id, paymentTx.walletId)).limit(1);
      if (!wallet) throw new Error("WALLET_NOT_FOUND");

      await tx.execute(sql`select id from wallets where id = ${wallet.id} for update`);
      const [updatedWallet] = await tx
        .update(wallets)
        .set({ balance: sql`${wallets.balance} + ${amountRial.toString()}::numeric`, updatedAt: new Date() })
        .where(eq(wallets.id, wallet.id))
        .returning();
      if (!updatedWallet) throw new Error("WALLET_UPDATE_FAILED");

      const nextMeta = {
        ...meta,
        paypingRefId: refId,
        paypingCode: code || meta.paypingCode || null,
        cardNumber: cardNumber || null,
        cardHash: cardHash || null,
        verifiedAt: new Date().toISOString(),
        verifyPayload,
      };

      const [updatedTx] = await tx
        .update(transactions)
        .set({ status: "completed", metadata: nextMeta, updatedAt: new Date() })
        .where(eq(transactions.id, paymentTx.id))
        .returning();

      return { alreadyCompleted: false, transaction: updatedTx };
    });

    return NextResponse.redirect(`${appUrl()}/payment/success?ref=${encodeURIComponent(refId)}&tx=${encodeURIComponent(result.transaction.id)}`);
  } catch (err) {
    logger.error({ err, refId, clientRefId }, "PayPing callback verification failed");
    if (clientRefId) {
      await db
        .update(transactions)
        .set({ status: "failed", metadata: { provider: "payping", refId, code, error: err instanceof Error ? err.message : "PAYPING_VERIFY_FAILED" }, updatedAt: new Date() })
        .where(eq(transactions.id, clientRefId))
        .catch(() => undefined);
    }
    return NextResponse.redirect(`${appUrl()}/payment/failed?reason=verify_failed`);
  }
}

export async function GET(request: NextRequest) {
  return handleCallback(request);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return handleCallback(request, body as Record<string, unknown>);
}
