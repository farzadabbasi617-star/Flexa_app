"use client";

import { useEffect } from "react";

/**
 * خطای مرز (error boundary) صفحه تورنومنت:
 * اگر هر چیزی در رندر/داده این صفحه کرش کند، کاربر این صفحه فارسی را می‌بیند
 * نه صفحه خطای مرده کروم ("This page couldn't load") را.
 */
export default function TournamentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("tournament page error:", error);
  }, [error]);

  return (
    <main
      dir="rtl"
      className="min-h-[70vh] flex items-center justify-center px-6 text-white bg-[#050508]"
    >
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4">😵‍💫</div>
        <h1 className="text-xl font-black mb-3">این صفحه بالا نیامد</h1>
        <p className="text-sm text-gray-400 leading-7 mb-6">
          مشکلی در نمایش این تورنومنت پیش آمد. یک بار دوباره تلاش کن؛ اگر نشد،
          از لیست تورنومنت‌ها وارد شو.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-2xl bg-gradient-to-l from-purple-600 to-blue-600 px-6 py-3 text-sm font-black shadow-lg shadow-purple-900/40 active:scale-95 transition"
          >
            🔄 تلاش مجدد
          </button>
          <a
            href="/tournaments"
            className="rounded-2xl bg-white/10 border border-white/15 px-6 py-3 text-sm font-black"
          >
            لیست تورنومنت‌ها
          </a>
        </div>
      </div>
    </main>
  );
}
