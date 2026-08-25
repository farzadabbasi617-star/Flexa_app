import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "صفحه پیدا نشد",
  description: "آدرس درخواستی در گیمنت پیدا نشد یا دیگر به‌صورت عمومی در دسترس نیست.",
  robots: {
    index: false,
    follow: true,
    noarchive: true,
    googleBot: { index: false, follow: true, noimageindex: true },
  },
};

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#050508] text-white" dir="rtl">
      <Navbar />
      <main className="mx-auto grid min-h-[72vh] max-w-3xl place-items-center px-5 py-16 text-center">
        <section>
          <span className="mx-auto grid h-24 w-24 place-items-center rounded-[2rem] border border-purple-300/15 bg-purple-500/10 text-3xl font-black text-purple-200">۴۰۴</span>
          <h1 className="mt-7 text-3xl font-black sm:text-4xl">این صفحه پیدا نشد</h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-8 text-gray-400">
            ممکن است آدرس تغییر کرده باشد، رکورد از حالت عمومی خارج شده باشد یا صفحه‌ای با این مشخصات وجود نداشته باشد.
          </p>
          <nav className="mt-8 flex flex-wrap justify-center gap-3" aria-label="مسیرهای پیشنهادی">
            <Link href="/" className="gaming-btn">بازگشت به خانه</Link>
            <Link href="/tournaments" className="rounded-xl border border-white/10 bg-white/[.04] px-5 py-3 text-sm font-black hover:bg-white/[.08]">تورنومنت‌ها</Link>
            <Link href="/store" className="rounded-xl border border-white/10 bg-white/[.04] px-5 py-3 text-sm font-black hover:bg-white/[.08]">فروشگاه</Link>
            <Link href="/games" className="rounded-xl border border-white/10 bg-white/[.04] px-5 py-3 text-sm font-black hover:bg-white/[.08]">بازی‌ها</Link>
          </nav>
        </section>
      </main>
    </div>
  );
}
