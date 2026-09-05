"use client";

import Navbar from "@/components/Navbar";
import { PRIVACY_LAST_UPDATED_FA, PRIVACY_SECTIONS, PRIVACY_VERSION } from "@/lib/privacy";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">🔐</div>
          <h1 className="text-3xl sm:text-4xl font-black mb-3">
            <span className="neon-text-purple">سیاست حریم خصوصی گیمنت</span>
          </h1>
          <p className="text-gray-400 leading-8 max-w-2xl mx-auto">
            در گیمنت می‌دانیم اطلاعات شما اعتمادِ ماست. این سند به‌صورت شفاف توضیح می‌دهد چه داده‌هایی جمع‌آوری می‌شود، چرا لازم هستند و چگونه از آن‌ها محافظت می‌کنیم. استفاده از گیمنت به‌منزله پذیرش این سیاست است.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3 text-xs text-gray-500">
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">نسخه: {PRIVACY_VERSION}</span>
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">آخرین بروزرسانی: {PRIVACY_LAST_UPDATED_FA}</span>
          </div>
        </div>

        <div className="grid gap-4 mb-8">
          <div className="bg-cyan-500/10 border border-cyan-500/25 rounded-2xl p-5 text-cyan-50 leading-8 text-sm">
            <strong className="text-cyan-300">خلاصه کاربردی:</strong> شماره کارت شما هرگز روی گیمنت ذخیره نمی‌شود (پرداخت روی درگاه بانکی زرین‌پال انجام می‌شود)، اطلاعات‌تان به هیچ‌کس فروخته نمی‌شود، کوکی فقط برای ورود و سرعت استفاده می‌شود، و هر وقت خواستید می‌توانید از «پشتیبانی» درخواست حذف حساب بدهید.
          </div>
        </div>

        <div className="space-y-6">
          {PRIVACY_SECTIONS.map((section, idx) => (
            <section key={section.title} className="gaming-card p-6 animate-slide-up" style={{ animationDelay: `${idx * 0.05}s` }}>
              <div className="flex items-center gap-3 mb-5">
                <span className="text-2xl">{section.icon}</span>
                <h2 className="text-lg sm:text-xl font-black text-neon-blue">{section.title}</h2>
              </div>
              <ol className="space-y-4 list-decimal list-inside">
                {section.items.map((item, i) => (
                  <li key={i} className="text-gray-300 text-sm leading-8 marker:text-neon-purple marker:font-black">
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>

        <div className="mt-8 bg-neon-pink/10 border border-neon-pink/30 rounded-xl p-5 text-center">
          <span className="text-3xl">🤝</span>
          <p className="font-bold text-neon-pink mt-3 leading-8">
            سؤالی درباره حریم خصوصی دارید؟ از صفحه «پشتیبانی» با ما در میان بگذارید — پاسخ‌گویی سریع بخشی از تعهد ماست.
          </p>
        </div>
      </div>
    </div>
  );
}
