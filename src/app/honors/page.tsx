"use client";

import BottomNav from "@/components/BottomNav";

const honors = [
  {
    type: "winner",
    icon: "🏆",
    title: "برنده تورنومنت",
    description: "علی رضایی در تورنومنت کالاف موبایل قهرمان شد و ۵۰۰٬۰۰۰ تومان جایزه گرفت.",
    time: "۲ ساعت پیش",
  },
  {
    type: "levelup",
    icon: "⚡",
    title: "لول‌آپ",
    description: "سارا محمدی به سطح ۴۲ رسید.",
    time: "۵ ساعت پیش",
  },
  {
    type: "winner",
    icon: "🏆",
    title: "برنده تورنومنت",
    description: "امیرحسین کریمی در فورتنایت رتبه اول را کسب کرد.",
    time: "دیروز",
  },
  {
    type: "news",
    icon: "📰",
    title: "خبر جدید",
    description: "سیستم داوری هوش مصنوعی فلکسا به‌روزرسانی شد و دقت آن ۱۸٪ افزایش یافت.",
    time: "۲ روز پیش",
  },
];

export default function HonorsPage() {
  return (
    <div className="min-h-screen bg-[#050508] text-white pb-24">
      <div className="max-w-[480px] mx-auto px-6 pt-12">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl">🏆</span>
            <h1 className="text-3xl font-black">تالار افتخارات</h1>
          </div>
          <p className="text-sm text-white/60">دستاوردها، برندگان و اخبار فلکسا</p>
        </div>

        <div className="space-y-4">
          {honors.map((item, index) => (
            <div key={index} className="glass-panel p-5 rounded-3xl border border-white/10">
              <div className="flex items-start gap-4">
                <div className="text-3xl mt-1">{item.icon}</div>
                <div className="flex-1">
                  <div className="font-black mb-1">{item.title}</div>
                  <p className="text-sm text-white/80 leading-relaxed">{item.description}</p>
                  <div className="text-xs text-gray-500 mt-3">{item.time}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center text-xs text-white/40">
          این بخش به‌زودی با داده‌های واقعی و زنده پر می‌شود
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
