"use client";

import { useState, useEffect } from "react";
import BottomNav from "@/components/BottomNav";

type HonorType = "all" | "winner" | "levelup" | "news";

interface Honor {
  id: string;
  type: "winner" | "levelup" | "news" | string;
  icon: string;
  title: string;
  description: string;
  time: string;
  prize?: string;
  username?: string;
  level?: number;
  highlight?: boolean;
  image?: string;
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

  return (
    <div className="min-h-screen bg-[#050508] text-white pb-24">
      {/* Luxurious Header */}
      <div className="relative pt-8 pb-10 px-6 bg-gradient-to-b from-purple-950/40 via-[#050508] to-[#050508]">
        <div className="max-w-[480px] mx-auto text-center">
          <div className="inline-block px-5 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs tracking-[2px] mb-4">
            FLEXA ELITE
          </div>
          <h1 className="text-6xl font-black tracking-[-3px] mb-2">تالار افتخارات</h1>
          <p className="text-white/60">قهرمانان، قهرمانی‌ها و درخشش‌ها</p>
        </div>
      </div>

      <div className="max-w-[480px] mx-auto px-5">
        {/* Filters */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-3">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`px-6 py-2.5 rounded-2xl text-sm font-black border transition-all active:scale-95 whitespace-nowrap ${
                activeFilter === f.id
                  ? "bg-purple-600 border-purple-500 text-white shadow-[0_0_25px_rgba(168,85,247,.4)]"
                  : "bg-[#111114] border-white/10 text-white/70"
              }`}
            >
              {f.icon} {f.label}
            </button>
          ))}
        </div>

        {/* Featured Big Visual Cards */}
        {activeFilter === "all" && featured.length > 0 && (
          <div className="mb-10 space-y-4">
            {featured.slice(0, 2).map((item) => (
              <div key={item.id} className="relative overflow-hidden rounded-3xl border border-white/10 h-[280px] flex items-end">
                {item.image ? (
                  <img src={item.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-900 to-black" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent" />
                <div className="relative p-6 text-white">
                  <div className="text-xs text-purple-400 mb-1 tracking-widest">FEATURED</div>
                  <div className="font-black text-3xl leading-tight mb-2">{item.title}</div>
                  <div className="text-sm text-white/80 line-clamp-2">{item.description}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Compact Visual Cards */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12 text-white/50">در حال بارگذاری...</div>
          ) : filteredHonors.length > 0 ? (
            filteredHonors.map((honor) => (
              <div
                key={honor.id}
                className="glass-panel rounded-3xl overflow-hidden border border-white/10 active:scale-[0.985] transition-all"
              >
                <div className="flex">
                  {/* Image Side */}
                  <div className="w-24 h-24 flex-shrink-0 relative">
                    {honor.image ? (
                      <img src={honor.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-purple-700 to-cyan-600 flex items-center justify-center text-5xl">
                        {honor.icon}
                      </div>
                    )}
                  </div>

                  {/* Content Side */}
                  <div className="flex-1 p-4 pr-5 flex flex-col justify-center">
                    <div className="font-black text-lg leading-tight mb-1 pr-2">{honor.title}</div>
                    
                    <div className="text-xs text-white/60 mb-2 line-clamp-1">
                      {honor.description}
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <div className="text-purple-400">
                        {honor.username && `@${honor.username}`}
                        {honor.level && ` • سطح ${honor.level}`}
                        {honor.prize && ` • ${honor.prize}`}
                      </div>
                      <div className="text-white/40">{honor.time}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-10 text-white/50">موردی برای نمایش وجود ندارد</div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
