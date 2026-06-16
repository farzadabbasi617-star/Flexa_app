"use client";

import Link from "next/link";
import BottomNav from "@/components/BottomNav";

export default function PaymentFailedPage() {
  return (
    <div className="min-h-screen bg-[#050508] text-white flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-6">❌</div>
        <h1 className="text-3xl font-black mb-3">پرداخت ناموفق</h1>
        <p className="text-gray-400 mb-8">متأسفانه پرداخت شما انجام نشد. لطفاً دوباره تلاش کنید.</p>

        <div className="flex flex-col gap-3">
          <Link href="/wallet" className="gaming-btn">بازگشت به کیف پول</Link>
          <Link href="/support" className="text-sm text-purple-400">تماس با پشتیبانی</Link>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
