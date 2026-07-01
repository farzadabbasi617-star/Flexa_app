import Link from "next/link";

/**
 * Server-rendered brand footer present on every page.
 *
 * Purpose (brand SEO): put a clear, keyword-disambiguating description of the
 * brand «گیمنت / Gament» in the INITIAL HTML of every page, with an internal
 * link whose anchor text is exactly «گیمنت» pointing to the homepage. This
 * strongly reinforces to Google that this site is the official home of the
 * entity «گیمنت» (a platform/brand), separating it from the generic term
 * «گیم‌نت» (gaming café).
 *
 * It sits above the fixed bottom navigation, so it uses the same bottom spacing.
 */
export default function BrandFooter() {
  return (
    <footer
      dir="rtl"
      className="relative z-10 border-t border-white/10 bg-[#050508] text-gray-400"
      style={{ paddingBottom: "var(--bottom-nav-space)" }}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xl">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/gament-icon-192.png" alt="گیمنت" className="h-8 w-8 object-contain" />
              <Link href="/" className="text-lg font-black text-white hover:text-purple-300">
                گیمنت
              </Link>
            </div>
            <p className="mt-3 text-xs leading-7">
              <Link href="/" className="font-bold text-gray-300 hover:text-white">گیمنت</Link>{" "}
              (Gament) یک برند و پلتفرم ایرانی برای برگزاری و شرکت در تورنومنت‌های آنلاین بازی و
              ورزش‌های الکترونیک است. در گیمنت می‌توانید در مسابقات کالاف دیوتی موبایل، فورتنایت و
              کلش رویال شرکت کنید، اکانت و ارز بازی را به‌صورت امن خرید و فروش کنید و رتبه‌ی خود را
              در جدول بازیکنان بالا ببرید. وب‌سایت رسمی گیمنت: www.gament1.ir
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs sm:text-right">
            <Link href="/tournaments" className="hover:text-white">تورنومنت‌های گیمنت</Link>
            <Link href="/store" className="hover:text-white">فروشگاه گیمنت</Link>
            <Link href="/leaderboard" className="hover:text-white">جدول رتبه‌بندی</Link>
            <Link href="/honors" className="hover:text-white">تالار افتخارات</Link>
            <Link href="/about" className="hover:text-white">درباره گیمنت</Link>
            <Link href="/contact" className="hover:text-white">تماس با گیمنت</Link>
            <Link href="/faq" className="hover:text-white">سوالات متداول</Link>
            <Link href="/rules" className="hover:text-white">قوانین مسابقات</Link>
          </nav>
        </div>

        <div className="mt-6 border-t border-white/5 pt-4 text-[11px] text-gray-500">
          © {new Date().getFullYear()} گیمنت | Gament — پلتفرم تورنومنت‌های گیمینگ. تمامی حقوق محفوظ است.
        </div>
      </div>
    </footer>
  );
}
