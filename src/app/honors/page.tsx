"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
  imageAlt?: string;
  summary?: string;
  seoKeywords?: string[];
  readTimeMinutes?: number;
  game?: string;
}

const FILTERS: { id: HonorType; label: string; icon: string }[] = [
  { id: "all", label: "همه", icon: "🌟" },
  { id: "winner", label: "برندگان", icon: "🏆" },
  { id: "levelup", label: "لول‌آپ", icon: "⚡" },
  { id: "news", label: "اخبار", icon: "📰" },
];

const GAME_FILTERS = [
  { id: "all", label: "همه بازی‌ها" },
  { id: "clash_royale", label: "کلش رویال" },
  { id: "cod_mobile", label: "کالاف موبایل" },
  { id: "fortnite", label: "فورتنایت" },
];

export default function HonorsPage() {
  const [activeFilter, setActiveFilter] = useState<HonorType>("all");
  const [activeGame, setActiveGame] = useState("all");
  const [query, setQuery] = useState("");
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

  const filteredHonors = honors.filter((honor) => {
    const byType = activeFilter === "all" || honor.type === activeFilter;
    const byGame = activeGame === "all" || honor.game === activeGame;
    const q = query.trim().toLowerCase();
    const byQuery = !q || `${honor.title} ${honor.description} ${honor.username || ""}`.toLowerCase().includes(q);
    return byType && byGame && byQuery;
  });

  const featured = honors.filter((h) => h.highlight);

  return (
    <div className="min-h-screen bg-[#050508] text-white pb-24">
      {/* Luxurious Header */}
      <div className="relative pt-8 pb-10 px-6 bg-gradient-to-b from-purple-950/40 via-[#050508] to-[#050508]">
        <div className="max-w-[480px] mx-auto text-center">
          <div className="inline-block px-5 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs tracking-[2px] mb-4">
            GAMENT ELITE
          </div>
          <h1 className="text-6xl font-black tracking-[-3px] mb-2">تالار افتخارات</h1>
          <p className="text-white/60">قهرمانان، قهرمانی‌ها و درخشش‌ها</p>
        </div>
      </div>

      <div className="max-w-[480px] mx-auto px-5">
        {/* Filters */}
        <div className="mb-5 space-y-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی بازیکن، عنوان یا توضیحات..."
            className="w-full bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm outline-none focus:border-purple-400"
          />
          <div className="flex gap-2 overflow-x-auto pb-1">
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
          <div className="flex gap-2 overflow-x-auto pb-3">
            {GAME_FILTERS.map((game) => (
              <button
                key={game.id}
                onClick={() => setActiveGame(game.id)}
                className={`px-4 py-2 rounded-2xl text-xs font-black border transition-all active:scale-95 whitespace-nowrap ${
                  activeGame === game.id
                    ? "bg-cyan-600/80 border-cyan-400 text-white"
                    : "bg-[#111114] border-white/10 text-white/60"
                }`}
              >
                {game.label}
              </button>
            ))}
          </div>
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
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12 text-white/50">در حال بارگذاری...</div>
          ) : filteredHonors.length > 0 ? (
            filteredHonors.map((honor) => (
              <Link
                key={honor.id}
                href={`/honors/${honor.id}`}
                className="block glass-panel rounded-[28px] overflow-hidden border border-white/10 active:scale-[0.985] transition-all hover:border-purple-400/30"
              >
                <div className="relative h-36 overflow-hidden">
                  {honor.image ? (
                    <img src={honor.image} alt={honor.imageAlt || honor.title} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-700 to-cyan-600 flex items-center justify-center text-6xl">{honor.icon}</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-black/45 border border-white/10 backdrop-blur-md">
                      {honor.type === "news" ? "خبر گیمنت" : "افتخار"}
                    </span>
                    {honor.game && <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-purple-600/40 border border-purple-300/20 backdrop-blur-md">{GAME_FILTERS.find((g) => g.id === honor.game)?.label || honor.game}</span>}
                  </div>
                  <div className="absolute bottom-3 left-3 text-[10px] text-white/70 bg-black/35 px-2 py-1 rounded-full backdrop-blur-md">
                    {honor.readTimeMinutes ? `${honor.readTimeMinutes} دقیقه مطالعه • ` : ""}{honor.time}
                  </div>
                </div>

                <div className="p-4 text-right" dir="rtl">
                  <h2 className="font-black text-lg leading-7 mb-2 line-clamp-2">{honor.title}</h2>
                  <p className="text-xs text-white/65 leading-6 mb-3 line-clamp-2">{honor.summary || honor.description}</p>
                  {honor.seoKeywords?.length ? (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {honor.seoKeywords.slice(0, 3).map((tag) => <span key={tag} className="text-[9px] px-2 py-1 rounded-full bg-white/5 text-purple-200 border border-white/10">#{tag}</span>)}
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between text-xs">
                    <div className="text-purple-400 truncate">
                      {honor.username && `@${honor.username}`}
                      {honor.level && ` • سطح ${honor.level}`}
                      {honor.prize && ` • ${honor.prize}`}
                    </div>
                    <div className="text-white/40 shrink-0">ادامه خبر ←</div>
                  </div>
                </div>
              </Link>
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
