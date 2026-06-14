import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { wallets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

function parseRialBalance(value: string | null | undefined) {
  try {
    return BigInt(value || "0");
  } catch {
    return BigInt(0);
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const ua = request.headers.get("user-agent") || "unknown";

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await validateSession(token, ip, ua, request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [wallet] = await db
      .select({ balance: wallets.balance, currency: wallets.currency })
      .from(wallets)
      .where(eq(wallets.userId, user.id))
      .limit(1);

    const balanceRial = parseRialBalance(wallet?.balance);
    const balanceToman = balanceRial / BigInt(10);

    return NextResponse.json({
      balanceRial: balanceRial.toString(),
      balanceToman: Number(balanceToman),
      currency: wallet?.currency || "RIAL",
    });
  } catch (err) {
    logger.error({ err }, "Wallet balance error");
    return NextResponse.json({ error: "Failed to load wallet balance" }, { status: 500 });
  }
}
