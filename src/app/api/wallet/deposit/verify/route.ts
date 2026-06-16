import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { transactionId, status } = await req.json();

  // TODO: در آینده اینجا وب‌هوک درگاه واقعی را بررسی می‌کنیم

  const [tx] = await db
    .update(transactions)
    .set({
      status: status === "success" ? "completed" : "failed",
      metadata: { gateway: "mock", verifiedAt: new Date().toISOString() },
    })
    .where(eq(transactions.id, transactionId))
    .returning();

  if (!tx) {
    return NextResponse.json({ error: "تراکنش یافت نشد" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    status: tx.status,
    message: status === "success" ? "پرداخت با موفقیت انجام شد" : "پرداخت ناموفق بود",
  });
}
