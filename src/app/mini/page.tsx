import type { Metadata } from "next";
import Link from "next/link";

/**
 * ورودی سبک مینی‌اپ تلگرام (/mini).
 *
 * صفحه اصلی سایت ~۷۵۰KB عکس/فونت دارد؛ روی شبکه پرتأخیر، رویداد load دیر
 * می‌خورد و تلگرام قبل از کامل شدن، صفحه «Failed to load» نشان می‌دهد.
 * این صفحه عمداً بدون هیچ عکسی است (فقط متن + Tailwind) تا در <۱ ثانیه
 * بالا بیاید و تلگرام را نگه دارد؛ بقیه مسیرها از اینجا لینک می‌شوند.
 */
export const metadata: Metadata = {
  title: "گیمنت | منوی سریع",
  robots: { index: false },
};

const ITEMS = [
  { href: "/tournaments", emoji: "🏆", title: "تورنومنت‌ها", desc: "روم‌های باز و ثبت‌نام" },
  { href: "/wallet", emoji: "💰", title: "کیف پول", desc: "موجودی، شارژ و برداشت" },
  { href: "/leaderboard", emoji: "📊", title: "جدول رتبه‌بندی", desc: "برترین بازیکنان" },
  { href: "/profile", emoji: "👤", title: "پروفایل من", desc: "حساب و پروفایل بازیکن" },
  { href: "/support", emoji: "🎧", title: "پشتیبانی", desc: "تیکت و ارتباط با ما" },
] as const;

export default function MiniMenuPage() {
  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#050508] text-white flex flex-col items-center justify-center px-5 py-8"
    >
      <div className="w-full max-w-md">
        <header className="text-center mb-7">
          <div className="text-3xl font-black tracking-tight">
            <span className="bg-gradient-to-l from-purple-400 to-blue-400 bg-clip-text text-transparent">
              گیمنت
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1.5">
            ورود خودکار با تلگرام فعال است — فقط یک بخش را انتخاب کن
          </p>
        </header>

        <nav className="grid gap-3">
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[.04] px-4 py-4 active:scale-[.98] active:bg-white/[.07] transition"
            >
              <span className="text-2xl shrink-0" aria-hidden>
                {item.emoji}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-black text-[15px] leading-6">{item.title}</span>
                <span className="block text-[11px] text-gray-400 mt-0.5">{item.desc}</span>
              </span>
              <span className="text-gray-500 text-lg shrink-0" aria-hidden>
                ←
              </span>
            </Link>
          ))}
        </nav>

        <div className="text-center mt-7">
          <Link href="/" className="text-[11px] text-gray-500 underline underline-offset-4">
            رفتن به صفحه کامل سایت
          </Link>
        </div>
      </div>
    </main>
  );
}
