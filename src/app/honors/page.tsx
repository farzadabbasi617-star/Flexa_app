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

  const featured = honors.filter((h) => h.highlight && h.type === "news");

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white pb-24">
      {/* Magazine Header */}
      <div className="border-b border-white/10">
        <div className="max-w-[680px] mx-auto px-6 pt-10 pb-8">
          <div className="text-[10px] tracking-[3px] text-white/40 mb-1">FLEXA MAGAZINE</div>
          <h1 className="text-6xl font-black tracking-[-3.5px]">تالار افتخارات</h1>
          <p className="text-lg text-white/60 mt-2">قهرمانان، دستاوردها و اخبار جامعه</p>
        </div>
      </div>

      <div className="max-w-[680px] mx-auto px-6 pt-8">
        {/* Filters */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`px-5 py-2 rounded-full text-sm font-medium border transition-all whitespace-nowrap ${
                activeFilter === f.id
                  ? "bg-white text-black border-white"
                  : "border-white/20 text-white/70 hover:border-white/40"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Featured News - Very Prominent */}
        {activeFilter === "all" && featured.length > 0 && (
          <div className="mb-10">
            <div className="text-xs tracking-widest text-white/50 mb-3 px-1">FEATURED STORY</div>
            {featured.slice(0, 1).map((item) => (
              <div key={item.id} className="bg-[#111115] rounded-3xl overflow-hidden border border-white/10">
                {item.image && (
                  <img src={item.image} alt="" className="w-full h-64 object-cover" />
                )}
                <div className="p-7">
                  <div className="font-black text-3xl leading-tight mb-4">{item.title}</div>
                  <p className="text-white/80 text-[15px] leading-relaxed mb-5">{item.description}</p>
                  <div className="text-xs text-white/50">{item.time}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Main Content */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-16 text-white/50">در حال بارگذاری...</div>
          ) : filteredHonors.length > 0 ? (
            filteredHonors.map((honor) => {
              const isCompact = honor.type === "winner" || honor.type === "levelup";

              return (
                <div
                  key={honor.id}
                  className={`rounded-3xl border border-white/10 bg-[#0f0f13] overflow-hidden ${
                    isCompact ? "p-4" : "p-6"
                  }`}
                >
                  <div className="flex gap-4">
                    {/* Image */}
                    {honor.image && (
                      <div className="flex-shrink-0">
                        <img
                          src={honor.image}
                          alt=""
                          className={`${isCompact ? "w-14 h-14" : "w-20 h-20"} rounded-2xl object-cover`}
                        />
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-lg leading-tight mb-1.5">{honor.title}</div>
                      <p className="text-sm text-white/70 leading-relaxed mb-3 line-clamp-2">
                        {honor.description}
                      </p>

                      <div className="flex items-center justify-between text-xs text-white/50">
                        <div>
                          {honor.username && `@${honor.username}`}
                          {honor.level && ` • سطح ${honor.level}`}
                          {honor.prize && ` • ${honor.prize}`}
                        </div>
                        <div>{honor.time}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-12 text-white/50">موردی برای نمایش وجود ندارد</div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
