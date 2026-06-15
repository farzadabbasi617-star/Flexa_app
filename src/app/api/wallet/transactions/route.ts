import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, wallets } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import { bigIntFromText, parseTomanToRial, rialToTomanNumber } from "@/lib/money";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

async function getOrCreateWallet(userId: string) {
  const [existing] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(wallets).values({ userId, balance: "0", currency: "RIAL" }).returning();
  return created;
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

    const body = await request.json();
    const amountRial = parseTomanToRial(String(body.amountToman || ""));
    if (amountRial <= BigInt(0)) return NextResponse.json({ error: "مبلغ شارژ معتبر نیست" }, { status: 400 });

    const wallet = await getOrCreateWallet(user.id);
    const [tx] = await db
      .insert(transactions)
      .values({
        walletId: wallet.id,
        amount: amountRial.toString(),
        type: "deposit",
        status: "pending",
        referenceId: `deposit-request-${Date.now()}`,
        metadata: {
          kind: "manual_deposit_request",
          userId: user.id,
          displayName: user.displayName,
          note: body.note ? String(body.note).slice(0, 300) : null,
        },
      })
      .returning();

    return NextResponse.json({
      success: true,
      message: "درخواست شارژ ثبت شد. پس از تأیید مدیریت، موجودی کیف پول افزایش می‌یابد.",
      transaction: tx,
    }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "Wallet deposit request failed");
    return NextResponse.json({ error: "ثبت درخواست شارژ انجام نشد" }, { status: 500 });
  }
}
