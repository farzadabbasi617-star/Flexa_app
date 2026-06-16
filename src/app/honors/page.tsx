"use client";

import { useState } from "react";
import BottomNav from "@/components/BottomNav";

type HonorType = "all" | "winner" | "levelup" | "news";

interface Honor {
  id: number;
  type: "winner" | "levelup" | "news";
  icon: string;
  title: string;
  description: string;
  time: string;
  prize?: string;
  username?: string;
  level?: number;
}

const allHonors: Honor[] = [
  {
    id: 1,
    type: "winner",
    icon: "🏆",
    title: "قهرمان تورنومنت",
    description: "علی رضایی در تورنومنت کالاف موبایل قهرمان شد",
    time: "۲ ساعت پیش",
    prize: "۵۰۰٬۰۰۰ تومان",
    username: "alireza_pro",
  },
  {
    id: 2,
    type: "levelup",
    icon: "⚡",
    title: "لول‌آپ",
    description: "سارا محمدی به سطح ۴۲ رسید",
    time: "۵ ساعت پیش",
    username: "sara_gamer",
    level: 42,
  },
  {
    id: 3,
    type: "winner",
    icon: "🏆",
    title: "قهرمان فورتنایت",
    description: "امیرحسین کریمی در فورتنایت رتبه اول را کسب کرد",
    time: "دیروز",
    prize: "۱٬۲۰۰٬۰۰۰ تومان",
    username: "amir_king",
  },
  {
    id: 4,
    type: "news",
    icon: "📰",
    title: "به‌روزرسانی سیستم داوری",
    description: "دقت موتور هوش مصنوعی فلکسا ۱۸٪ افزایش یافت",
    time: "۲ روز پیش",
  },
  {
    id: 5,
    type: "levelup",
    icon: "⚡",
    title: "لول‌آپ",
    description: "محمد حسینی به سطح ۳۸ رسید",
    time: "۳ روز پیش",
    username: "mohammad_h",
    level: 38,
  },
  {
    id: 6,
    type: "winner",
    icon: "🏆",
    title: "قهرمان کلش رویال",
    description: "زهرا کریمی در تورنومنت کلش رویال برنده شد",
    time: "۴ روز پیش",
    prize: "۳۵۰٬۰۰۰ تومان",
    username: "zahra_cr",
  },
];

const FILTERS: { id: HonorType; label: string; icon: string }[] = [
  { id: "all", label: "همه", icon: "🌟" },
  { id: "winner", label: "برندگان", icon: "🏆" },
  { id: "levelup", label: "لول‌آپ", icon: "⚡" },
  { id: "news", label: "اخبار", icon: "📰" },
];

export default function HonorsPage() {
  const [activeFilter, setActiveFilter] = useState<HonorType>("all");

  const filteredHonors =
    activeFilter === "all"
      ? allHonors
      : allHonors.filter((h) => h.type === activeFilter);

  const stats = {
    totalWinners: allHonors.filter((h) => h.type === "winner").length,
    totalLevelUps: allHonors.filter((h) => h.type === "levelup").length,
    totalNews: allHonors.filter((h) => h.type === "news").length,
  };

  return (
    <div className="min-h-screen bg-[#050508] text-white pb-24">
      {/* Header */}
      <div className="max-w-[480px] mx-auto px-6 pt-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-yellow-500 to-amber-600 mb-4">
            <span className="text-4xl">🏆</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight">تالار افتخارات</h1>
          <p className="text-sm text-white/60 mt-2">دستاوردها و اخبار جامعه فلکسا</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="glass-panel p-4 rounded-2xl text-center border border-white/10">
            <div className="text-2xl font-black text-yellow-400">{stats.totalWinners}</div>
            <div className="text-xs text-gray-400 mt-1">برنده</div>
          </div>
          <div className="glass-panel p-4 rounded-2xl text-center border border-white/10">
            <div className="text-2xl font-black text-cyan-400">{stats.totalLevelUps}</div>
            <div className="text-xs text-gray-400 mt-1">لول‌آپ</div>
          </div>
          <div className="glass-panel p-4 rounded-2xl text-center border border-white/10">
            <div className="text-2xl font-black text-purple-400">{stats.totalNews}</div>
            <div className="text-xs text-gray-400 mt-1">خبر</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide mb-6">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`flex-shrink-0 px-5 py-2.5 rounded-2xl text-sm font-black border transition-all active:scale-[0.985] whitespace-nowrap ${
                activeFilter === filter.id
                  ? "bg-purple-600 border-purple-500 text-white"
                  : "bg-[#111114] border-white/10 text-gray-400 hover:border-white/30"
              }`}
            >
              {filter.icon} {filter.label}
            </button>
          ))}
        </div>

        {/* Honors List */}
        <div className="space-y-3">
          {filteredHonors.length > 0 ? (
            filteredHonors.map((honor) => (
              <div
                key={honor.id}
                className="glass-panel p-5 rounded-3xl border border-white/10 active:scale-[0.985] transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="text-4xl flex-shrink-0 mt-0.5">{honor.icon}</div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="font-black text-lg">{honor.title}</div>
                      {honor.prize && (
                        <div className="text-xs bg-yellow-500/10 text-yellow-400 px-3 py-1 rounded-full font-bold border border-yellow-500/20">
                          {honor.prize}
                        </div>
                      )}
                    </div>

                    <p className="text-sm text-white/80 leading-relaxed mb-3">
                      {honor.description}
                    </p>

                    <div className="flex items-center justify-between text-xs">
                      <div className="text-gray-500">
                        {honor.username && `@${honor.username}`}
                        {honor.level && ` • سطح ${honor.level}`}
                      </div>
                      <div className="text-gray-500">{honor.time}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-gray-500">
              موردی برای نمایش وجود ندارد
            </div>
          )}
        </div>

        <div className="mt-12 text-center text-xs text-white/40 pb-6">
          این بخش به‌زودی با داده‌های واقعی و زنده به‌روزرسانی می‌شود
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
