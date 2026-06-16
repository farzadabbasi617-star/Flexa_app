import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { amountToman } = await req.json();

  if (!amountToman || amountToman < 10000) {
    return NextResponse.json({ error: "حداقل مبلغ ۱۰٬۰۰۰ تومان است" }, { status: 400 });
  }

  // TODO: اینجا بعداً درخواست به درگاه واقعی می‌زنیم
  // فعلاً فقط تراکنش pending ثبت می‌کنیم و یک ref موقت برمی‌گردانیم

  const [tx] = await db
    .insert(transactions)
    .values({
      userId: user.id,
      type: "deposit",
      amountToman: Number(amountToman),
      status: "pending",
      referenceId: `TEMP_${Date.now()}`,
      metadata: { gateway: "pending" },
    })
    .returning();

  return NextResponse.json({
    success: true,
    transactionId: tx.id,
    message: "درخواست ثبت شد (درگاه واقعی بعداً متصل می‌شود)",
  });
}
