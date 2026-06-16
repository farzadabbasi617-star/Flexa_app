"use client";

import { useState, useEffect } from "react";
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
  highlight?: boolean;
}

const FILTERS: { id: HonorType; label: string; icon: string }[] = [
  { id: "all", label: "همه", icon: "🌟" },
  { id: "winner", label: "برندگان", icon: "🏆" },
  { id: "levelup", label: "لول‌آپ", icon: "⚡" },
  { id: "news", label: "اخبار", icon: "📰" },
];

export default function HonorsPage() {
  const [activeFilter, setActiveFilter] = useState<HonorType>("all");
  const [honors, setHonors] = useState<Honor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/honors")
      .then((res) => res.json())
      .then((data) => {
        setHonors(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filteredHonors =
    activeFilter === "all"
      ? honors
      : honors.filter((h) => h.type === activeFilter);

  const featured = honors.filter((h) => h.highlight);

  const stats = {
    totalWinners: honors.filter((h) => h.type === "winner").length,
    totalLevelUps: honors.filter((h) => h.type === "levelup").length,
    totalNews: honors.filter((h) => h.type === "news").length,
  };

  return (
    <div className="min-h-screen bg-[#050508] text-white pb-24">
      {/* Hero Header */}
      <div className="relative pt-8 pb-6 px-6 bg-gradient-to-b from-[#1a0033]/40 to-transparent">
        <div className="max-w-[480px] mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/5 px-4 py-1.5 rounded-full text-xs tracking-widest mb-4 border border-white/10">
            FLEXA COMMUNITY
          </div>
          <h1 className="text-5xl font-black tracking-[-2px]">تالار افتخارات</h1>
          <p className="text-white/60 mt-2 text-sm">دستاوردها، قهرمانان و اخبار جامعه</p>
        </div>
      </div>

      <div className="max-w-[480px] mx-auto px-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 -mt-4 mb-8">
          <div className="glass-panel p-4 rounded-3xl text-center border border-white/10">
            <div className="text-3xl font-black text-yellow-400">{stats.totalWinners}</div>
            <div className="text-xs text-gray-400 mt-1 tracking-wider">قهرمان</div>
          </div>
          <div className="glass-panel p-4 rounded-3xl text-center border border-white/10">
            <div className="text-3xl font-black text-cyan-400">{stats.totalLevelUps}</div>
            <div className="text-xs text-gray-400 mt-1 tracking-wider">لول‌آپ</div>
          </div>
          <div className="glass-panel p-4 rounded-3xl text-center border border-white/10">
            <div className="text-3xl font-black text-purple-400">{stats.totalNews}</div>
            <div className="text-xs text-gray-400 mt-1 tracking-wider">خبر</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide mb-6">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`flex-shrink-0 px-6 py-2.5 rounded-2xl text-sm font-black border transition-all active:scale-[0.985] whitespace-nowrap ${
                activeFilter === filter.id
                  ? "bg-purple-600 border-purple-500 text-white shadow-[0_0_20px_rgba(168,85,247,.3)]"
                  : "bg-[#111114] border-white/10 text-gray-400 hover:border-white/30"
              }`}
            >
              {filter.icon} {filter.label}
            </button>
          ))}
        </div>

        {/* Featured News Section */}
        {activeFilter === "all" && featured.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="text-sm font-black text-purple-400 tracking-wider">اخبار ویژه</div>
            </div>
            <div className="space-y-3">
              {featured.slice(0, 2).map((item) => (
                <div key={item.id} className="glass-panel p-6 rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-900/10 to-transparent">
                  <div className="flex gap-4">
                    <div className="text-4xl flex-shrink-0">{item.icon}</div>
                    <div>
                      <div className="font-black text-lg leading-tight mb-2">{item.title}</div>
                      <p className="text-sm text-white/80 leading-relaxed mb-3">{item.description}</p>
                      <div className="text-xs text-purple-400">{item.time}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main List */}
        <div className="mb-4 px-1">
          <div className="text-sm font-black text-gray-400 tracking-wider">
            {activeFilter === "all" ? "آخرین افتخارات" : "نتایج فیلتر"}
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12 text-gray-500">در حال بارگذاری...</div>
          ) : filteredHonors.length > 0 ? (
            filteredHonors.map((honor) => (
              <div
                key={honor.id}
                className={`glass-panel p-5 rounded-3xl border transition-all active:scale-[0.985] ${
                  honor.highlight 
                    ? "border-purple-500/40 bg-purple-900/5" 
                    : "border-white/10"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="text-4xl flex-shrink-0 mt-0.5 opacity-90">{honor.icon}</div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <div className="font-black text-[17px] leading-tight pr-2">{honor.title}</div>
                      {honor.prize && (
                        <div className="text-xs whitespace-nowrap bg-yellow-500/10 text-yellow-400 px-3 py-1 rounded-full font-bold border border-yellow-500/20 flex-shrink-0">
                          {honor.prize}
                        </div>
                      )}
                    </div>

                    <p className="text-sm text-white/75 leading-relaxed mb-4">{honor.description}</p>

                    <div className="flex items-center justify-between text-xs">
                      <div className="text-gray-400">
                        {honor.username && <span>@{honor.username}</span>}
                        {honor.level && <span className="ml-2">• سطح {honor.level}</span>}
                      </div>
                      <div className="text-gray-500 font-medium">{honor.time}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-gray-500">موردی برای نمایش وجود ندارد</div>
          )}
        </div>

        <div className="mt-14 text-center text-xs text-white/40 pb-6">
          این بخش به‌زودی با داده‌های واقعی و زنده به‌روزرسانی می‌شود
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
