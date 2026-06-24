import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, wallets } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import { bigIntFromText, parseTomanToRial, rialToTomanNumber } from "@/lib/money";
import { createWalletReference, sanitizeWalletNote, validateDepositAmountRial } from "@/lib/wallet-security";
import { isValidIranIban, sanitizeIban, sanitizeNationalId, sanitizeShortText, walletBreakdown } from "@/lib/wallet-accounting";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const MIN_WITHDRAWAL_RIAL = BigInt(500_000); // 50,000 تومان

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

function requireTermsAccepted(body: Record<string, unknown>) {
  if (body.acceptTerms !== true) {
    return "برای ثبت درخواست شارژ یا برداشت باید قوانین کیف پول را مطالعه و تأیید کنید.";
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const ua = request.headers.get("user-agent") || "unknown";
    const user = await validateSession(token || "", ip, ua, request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const wallet = await getOrCreateWallet(user.id);
    const allRows = await db.select().from(transactions).where(eq(transactions.walletId, wallet.id));
    const recentRows = [...allRows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 100);

    const balanceRial = bigIntFromText(wallet.balance);
    const breakdown = walletBreakdown(balanceRial, allRows);

    return NextResponse.json({
      wallet: {
        id: wallet.id,
        balanceRial: breakdown.totalRial,
        balanceToman: breakdown.totalToman,
        usableRial: breakdown.usableRial,
        usableToman: breakdown.usableToman,
        withdrawableRial: breakdown.withdrawableRial,
        withdrawableToman: breakdown.withdrawableToman,
        nonWithdrawableRial: breakdown.nonWithdrawableRial,
        nonWithdrawableToman: breakdown.nonWithdrawableToman,
        currency: wallet.currency,
      },
      transactions: recentRows.map((tx) => {
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

    const body = await request.json();
    const termsError = requireTermsAccepted(body);
    if (termsError) return NextResponse.json({ error: termsError }, { status: 400 });

    const action = body.action === "withdrawal" ? "withdrawal" : "deposit";

    if (action === "deposit") {
      const limit = await rateLimit(`wallet:deposit:${user.id}`, 3, 10 * 60 * 1000);
      if (!limit.success) {
        return NextResponse.json(
          { error: "تعداد درخواست‌های شارژ زیاد است. لطفاً چند دقیقه بعد دوباره امتحان کنید." },
          { status: 429 }
        );
      }

      const amountRial = parseTomanToRial(String(body.amountToman || ""));
      const amountValidation = validateDepositAmountRial(amountRial);
      if (!amountValidation.ok) return NextResponse.json({ error: amountValidation.error }, { status: 400 });

      const wallet = await getOrCreateWallet(user.id);

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
            withdrawable: false,
            userId: user.id,
            displayName: user.displayName,
            note: sanitizeWalletNote(body.note),
            trackingNumber: sanitizeShortText(body.trackingNumber, 80) || null,
            requestedIp: ip,
            userAgent: ua.slice(0, 300),
          },
        })
        .returning();

      return NextResponse.json({
        success: true,
        message: "درخواست شارژ ثبت شد و پس از تأیید مدیریت به موجودی قابل استفاده داخل سایت اضافه می‌شود.",
        transaction: tx,
      }, { status: 201 });
    }

    const limit = await rateLimit(`wallet:withdrawal:${user.id}`, 2, 10 * 60 * 1000);
    if (!limit.success) {
      return NextResponse.json(
        { error: "تعداد درخواست‌های برداشت زیاد است. لطفاً چند دقیقه بعد دوباره امتحان کنید." },
        { status: 429 }
      );
    }

    const amountRial = parseTomanToRial(String(body.amountToman || ""));
    if (amountRial < MIN_WITHDRAWAL_RIAL) {
      return NextResponse.json({ error: "حداقل مبلغ برداشت ۵۰٬۰۰۰ تومان است." }, { status: 400 });
    }

    const iban = sanitizeIban(body.iban);
    const nationalId = sanitizeNationalId(body.nationalId);
    const accountOwner = sanitizeShortText(body.accountOwner, 120);

    if (!accountOwner) return NextResponse.json({ error: "نام صاحب حساب را وارد کنید." }, { status: 400 });
    if (nationalId.length !== 10) return NextResponse.json({ error: "کد ملی معتبر نیست." }, { status: 400 });
    if (!isValidIranIban(iban)) return NextResponse.json({ error: "شماره شبا باید با فرمت IR و ۲۴ رقم وارد شود." }, { status: 400 });

    const tx = await db.transaction(async (dbTx) => {
      await dbTx
        .insert(wallets)
        .values({ userId: user.id, balance: "0", currency: "RIAL" })
        .onConflictDoNothing({ target: wallets.userId });

      // Lock this wallet while we calculate withdrawable balance and create the
      // pending withdrawal. Without the lock, two concurrent requests could both
      // pass the same availability check before either pending row is visible.
      await dbTx.execute(sql`SELECT id FROM wallets WHERE user_id = ${user.id} FOR UPDATE`);

      const [wallet] = await dbTx.select().from(wallets).where(eq(wallets.userId, user.id)).limit(1);
      if (!wallet) throw new Error("WALLET_CREATE_FAILED");

      const allRows = await dbTx.select().from(transactions).where(eq(transactions.walletId, wallet.id));
      const breakdown = walletBreakdown(bigIntFromText(wallet.balance), allRows);
      const withdrawableRial = bigIntFromText(breakdown.withdrawableRial);

      if (withdrawableRial < amountRial) {
        throw new Error("INSUFFICIENT_WITHDRAWABLE_BALANCE");
      }

      const [created] = await dbTx
        .insert(transactions)
        .values({
          walletId: wallet.id,
          amount: amountRial.toString(),
          type: "withdrawal",
          status: "pending",
          referenceId: createWalletReference("withdrawal"),
          metadata: {
            kind: "manual_withdrawal_request",
            userId: user.id,
            displayName: user.displayName,
            accountOwner,
            nationalId,
            iban,
            note: sanitizeWalletNote(body.note),
            requestedIp: ip,
            userAgent: ua.slice(0, 300),
          },
        })
        .returning();

      return created;
    });

    return NextResponse.json({
      success: true,
      message: "درخواست برداشت ثبت شد و پس از بررسی، طی ۲۴ تا ۷۲ ساعت کاری پرداخت می‌شود.",
      transaction: tx,
    }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_WITHDRAWABLE_BALANCE") {
      return NextResponse.json({ error: "موجودی قابل برداشت کافی نیست." }, { status: 400 });
    }

    logger.error({ err }, "Wallet transaction request failed");
    return NextResponse.json({ error: "ثبت درخواست انجام نشد" }, { status: 500 });
  }
}
