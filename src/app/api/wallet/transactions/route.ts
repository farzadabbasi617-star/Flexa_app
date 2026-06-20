import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, wallets } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import { bigIntFromText, parseTomanToRial, rialToTomanNumber } from "@/lib/money";
import { createWalletReference, sanitizeWalletNote, validateDepositAmountRial } from "@/lib/wallet-security";
import { rateLimit } from "@/lib/rate-limit";
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

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const ua = request.headers.get("user-agent") || "unknown";
    const user = await validateSession(token || "", ip, ua, request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const wallet = await getOrCreateWallet(user.id);
    const rows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.walletId, wallet.id))
      .orderBy(desc(transactions.createdAt))
      .limit(100);

    const balanceRial = bigIntFromText(wallet.balance);
    return NextResponse.json({
      wallet: {
        id: wallet.id,
        balanceRial: balanceRial.toString(),
        balanceToman: rialToTomanNumber(balanceRial),
        currency: wallet.currency,
      },
      transactions: rows.map((tx) => {
        const amountRial = bigIntFromText(tx.amount);
        return {
          ...tx,
          amountRial: amountRial.toString(),
          amountToman: rialToTomanNumber(amountRial),
        };
      }),
    });
  } catch (err) {
    logger.error({ err }, "Wallet transactions GET failed");
    return NextResponse.json({ error: "Failed to load wallet" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const ua = request.headers.get("user-agent") || "unknown";
    const user = await validateSession(token || "", ip, ua, request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const limit = await rateLimit(`wallet:deposit:${user.id}`, 3, 10 * 60 * 1000);
    if (!limit.success) {
      return NextResponse.json(
        { error: "تعداد درخواست‌های شارژ زیاد است. لطفاً چند دقیقه بعد دوباره امتحان کنید." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const amountRial = parseTomanToRial(String(body.amountToman || ""));
    const amountValidation = validateDepositAmountRial(amountRial);
    if (!amountValidation.ok) return NextResponse.json({ error: amountValidation.error }, { status: 400 });

    const wallet = await getOrCreateWallet(user.id);

    // IMPORTANT: Until a real payment gateway is connected, users can only
    // create a pending deposit request. Balance is never increased here.
    // Admin approval/payment gateway verification is the only place that may
    // turn this transaction into "completed" and credit the wallet.
    const [tx] = await db
      .insert(transactions)
      .values({
        walletId: wallet.id,
        amount: amountRial.toString(),
        type: "deposit",
        status: "pending",
        referenceId: createWalletReference("deposit"),
        metadata: {
          kind: "manual_deposit_request",
          provider: "manual_until_gateway_connected",
          userId: user.id,
          displayName: user.displayName,
          note: sanitizeWalletNote(body.note),
          requestedIp: ip,
          userAgent: ua.slice(0, 300),
        },
      })
      .returning();

    return NextResponse.json({
      success: true,
      message: "درخواست شارژ ثبت شد و بعد از تأیید مدیریت/درگاه به موجودی اضافه می‌شود.",
      transaction: tx,
    }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "Wallet deposit request failed");
    return NextResponse.json({ error: "ثبت درخواست شارژ انجام نشد" }, { status: 500 });
  }
}
