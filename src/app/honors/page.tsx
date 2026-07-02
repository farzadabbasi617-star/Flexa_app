"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import TiltCard from "@/components/fx/TiltCard";
import Reveal from "@/components/fx/Reveal";
import ParticleField from "@/components/fx/ParticleField";

type HonorType = "all" | "winner" | "levelup" | "news";
type HonorFilterIcon = "all" | "winner" | "levelup" | "news";

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
  likesCount?: number;
  viewsCount?: number;
}

const FILTERS: { id: HonorType; label: string; icon: HonorFilterIcon }[] = [
  { id: "all", label: "همه", icon: "all" },
  { id: "winner", label: "برندگان", icon: "winner" },
  { id: "levelup", label: "لول‌آپ", icon: "levelup" },
  { id: "news", label: "اخبار", icon: "news" },
];


function HonorFilterSvgIcon({ name, className = "w-4 h-4" }: { name: HonorFilterIcon; className?: string }) {
  if (name === "all") return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M12 3.5 14.2 8l4.9.7-3.6 3.5.9 4.9-4.4-2.3-4.4 2.3.9-4.9L4.9 8.7 9.8 8 12 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M5 19.5h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
  if (name === "winner") return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M8 4h8v3.4c0 3.7-1.6 6.1-4 7.1-2.4-1-4-3.4-4-7.1V4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8 6H5c.2 3.1 1.4 4.7 3.8 5.2M16 6h3c-.2 3.1-1.4 4.7-3.8 5.2M12 14.5V18M8.8 20h6.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
  if (name === "levelup") return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M12 20V5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m7 10 5-5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 17h14M7 21h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M6 4.5h9.5L19 8v11.5H6V4.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M15.5 4.5V8H19M8.7 11h6.6M8.7 14h6.6M8.7 17h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

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
  const [featuredIndex, setFeaturedIndex] = useState(0);

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
  const activeFeatured = featured.length ? featured[featuredIndex % featured.length] : null;

  useEffect(() => {
    if (featured.length <= 1 || activeFilter !== "all" || query.trim()) return;
    const timer = window.setInterval(() => {
      setFeaturedIndex((index) => (index + 1) % featured.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [featured.length, activeFilter, query]);

  useEffect(() => {
    if (featuredIndex >= featured.length) setFeaturedIndex(0);
  }, [featured.length, featuredIndex]);

  return (
    <div className="min-h-screen bg-[#050508] text-white">
      {/* Luxurious Header */}
      <div className="relative pt-8 pb-10 px-6 bg-gradient-to-b from-purple-950/40 via-[#050508] to-[#050508] overflow-hidden">
        <ParticleField count={30} className="opacity-60" />
        <div className="max-w-[480px] mx-auto text-center relative">
          <div className="inline-block px-5 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs tracking-[2px] mb-4 animate-slide-up">
            GAMENT ELITE
          </div>
          <h1 className="text-6xl font-black tracking-[-3px] mb-2 animate-slide-up [animation-delay:80ms] [animation-fill-mode:backwards]">تالار افتخارات</h1>
          <p className="text-white/60 animate-slide-up [animation-delay:160ms] [animation-fill-mode:backwards]">قهرمانان، قهرمانی‌ها و درخشش‌ها</p>
        </div>
      </div>

      <div className="max-w-[480px] mx-auto px-5" style={{ paddingBottom: "var(--bottom-nav-space)" }}>
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
                <span className="inline-flex items-center gap-2"><HonorFilterSvgIcon name={f.icon} className="w-4 h-4" /><span>{f.label}</span></span>
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

        {/* Featured News Slider */}
        {activeFilter === "all" && !query.trim() && activeFeatured && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="text-[11px] font-black text-purple-300 tracking-[0.28em]">FEATURED</div>
              {featured.length > 1 && (
                <div className="flex items-center gap-1.5" dir="ltr">
                  {featured.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setFeaturedIndex(index)}
                      aria-label={`نمایش خبر ویژه ${index + 1}`}
                      className={`h-2 rounded-full transition-all ${index === featuredIndex % featured.length ? "w-7 bg-purple-400 shadow-[0_0_12px_rgba(192,132,252,.55)]" : "w-2 bg-white/25"}`}
                    />
                  ))}
                </div>
              )}
            </div>

            <TiltCard maxTilt={5} liftZ={16} className="rounded-[32px]">
              <Link
                key={activeFeatured.id}
                href={`/honors/${activeFeatured.id}`}
                className="group relative block overflow-hidden rounded-[32px] border border-white/10 h-[300px] active:scale-[0.985] transition-all hover:border-purple-400/40 shadow-[0_0_45px_rgba(168,85,247,.14)]"
              >
                {activeFeatured.image ? (
                  <img src={activeFeatured.image} alt={activeFeatured.imageAlt || activeFeatured.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" decoding="async" />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-900 via-[#12081f] to-cyan-950" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-black/10" />
                <div className="absolute top-4 right-4 flex items-center gap-2" style={{ transform: "translateZ(26px)" }}>
                  <span className="text-[10px] font-black px-3 py-1 rounded-full bg-purple-600/35 border border-purple-300/25 backdrop-blur-md">خبر ویژه</span>
                  {activeFeatured.game && (
                    <span className="text-[10px] font-black px-3 py-1 rounded-full bg-black/40 border border-white/10 backdrop-blur-md">
                      {GAME_FILTERS.find((g) => g.id === activeFeatured.game)?.label || activeFeatured.game}
                    </span>
                  )}
                </div>
                <div className="absolute bottom-0 inset-x-0 p-6 text-white" dir="rtl" style={{ transform: "translateZ(20px)" }}>
                  <div className="text-[10px] text-cyan-300 font-black mb-2">{activeFeatured.readTimeMinutes ? `${activeFeatured.readTimeMinutes} دقیقه مطالعه • ` : ""}{activeFeatured.time}</div>
                  <h2 className="font-black text-2xl sm:text-3xl leading-tight mb-3 line-clamp-2">{activeFeatured.title}</h2>
                  <p className="text-sm text-white/75 leading-6 line-clamp-2">{activeFeatured.summary || activeFeatured.description}</p>
                  <div className="mt-4 inline-flex text-xs font-black text-purple-100 bg-white/10 border border-white/10 rounded-full px-4 py-2 backdrop-blur-md">
                    مشاهده خبر ←
                  </div>
                </div>
              </Link>
            </TiltCard>
          </section>
        )}

        {/* Compact Visual Cards */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12 text-white/50">در حال بارگذاری...</div>
          ) : filteredHonors.length > 0 ? (
            filteredHonors.map((honor, i) => (
              <Reveal key={honor.id} delay={Math.min(i, 6) * 0.05} distance={20}>
                <TiltCard maxTilt={5} liftZ={10}>
                  <Link
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
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <div className="text-purple-400 truncate">
                          {honor.username && `@${honor.username}`}
                          {honor.level && ` • سطح ${honor.level}`}
                          {honor.prize && ` • ${honor.prize}`}
                        </div>
                        <div className="flex items-center gap-2 text-white/45 shrink-0">
                          {honor.type === "news" && (
                            <>
                              <span className="inline-flex items-center gap-1">♡ {(honor.likesCount || 0).toLocaleString("fa-IR")}</span>
                              <span className="inline-flex items-center gap-1">👁 {(honor.viewsCount || 0).toLocaleString("fa-IR")}</span>
                            </>
                          )}
                          <span>ادامه خبر ←</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </TiltCard>
              </Reveal>
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
