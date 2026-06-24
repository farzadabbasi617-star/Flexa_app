"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import DailyQuests from "@/components/DailyQuests";

interface SiteImage {
  slug: string;
  title: string;
  url: string;
  category: string;
  altText?: string | null;
}

const GAMES = [
  {
    id: "cod_mobile",
    name: "COD MOBILE",
    faName: "کالاف موبایل",
    icon: "/icons/icon-cod_mobile.png",
    accent: "#ff8c00",
    bg: "radial-gradient(circle at 72% 35%, rgba(255,140,0,.46), transparent 18%), radial-gradient(circle at 18% 18%, rgba(255,255,255,.10), transparent 20%), linear-gradient(135deg, #090a10 0%, #151720 48%, #3a220d 100%)",
  },
  {
    id: "fortnite",
    name: "FORTNITE",
    faName: "فورتنایت",
    icon: "/icons/icon-fortnite.png",
    accent: "#bc00ff",
    bg: "radial-gradient(circle at 75% 25%, rgba(188,0,255,.42), transparent 18%), radial-gradient(circle at 22% 70%, rgba(0,210,255,.18), transparent 24%), linear-gradient(135deg, #090a10 0%, #151022 52%, #28103a 100%)",
  },
  {
    id: "clash_royale",
    name: "CLASH ROYALE",
    faName: "کلش رویال",
    icon: "/icons/icon-clash_royale.png",
    accent: "#00d2ff",
    bg: "radial-gradient(circle at 74% 32%, rgba(0,210,255,.38), transparent 18%), radial-gradient(circle at 24% 68%, rgba(255,230,0,.14), transparent 22%), linear-gradient(135deg, #080a12 0%, #101827 52%, #09283a 100%)",
  },
];

export default function LuxuryHomePage() {
  const [images, setImages] = useState<SiteImage[]>([]);

  useEffect(() => {
    fetch("/api/public/images", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setImages(Array.isArray(data) ? data : []))
      .catch(() => setImages([]));
  }, []);

  const imageMap = useMemo(() => {
    const byCategory: Record<string, SiteImage> = {};
    const bySlug: Record<string, SiteImage> = {};
    for (const image of images) {
      bySlug[image.slug] = image;
      if (!byCategory[image.category]) byCategory[image.category] = image;
    }
    return { byCategory, bySlug };
  }, [images]);

  const heroImage = imageMap.bySlug["home-hero"] || imageMap.byCategory.hero;

  return (
    <main className="min-h-screen text-white relative overflow-x-hidden selection:bg-purple-500/30">
      {/* Page content - responsive width */}
      <div className="relative z-10 w-full">
        
        {/* Header */}
        <header className="pt-8 pb-6 px-4 sm:px-6 max-w-7xl mx-auto">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3 text-right">
              <img 
                src="/icons/arena_icon.png" 
                alt="Gament Logo" 
                className="w-10 h-10 sm:w-12 sm:h-12 object-contain drop-shadow-[0_0_15px_rgba(188,0,255,0.5)]" 
              />
              <div>
                <h1 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight glitch-text">
                  گیمنت؛ تورنومنت گیمینگ آنلاین
                </h1>
                <p className="mt-2 text-xs font-black text-purple-300/90 tracking-[0.18em] uppercase en-font">
                  GAMENT • Elite Esports Hub
                </p>
              </div>
            </div>

            <Link
              href="/wallet"
              aria-label="رفتن به کیف پول"
              title="کیف پول"
              className="glass-panel px-4 py-3 rounded-2xl sm:rounded-[28px] flex items-center gap-3 border border-white/10 active:scale-95 transition-transform hover:border-purple-400/30"
            >
              <span className="grid place-items-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl sm:rounded-2xl bg-gradient-to-br from-purple-500 to-fuchsia-700 text-lg shadow-[0_0_22px_rgba(188,0,255,.45)] overflow-hidden">
                <img src="/icons/wallet_icon.png" alt="کیف پول" className="w-full h-full object-contain p-1" />
              </span>
              <span className="text-sm font-black tracking-wide hidden sm:inline">کیف پول</span>
            </Link>
          </div>
        </header>

        {/* Main content */}
        <div className="px-4 sm:px-6 max-w-7xl mx-auto">
          
          {/* Hero Banner */}
          <section className="mb-8 sm:mb-10">
            <Link href="/tournaments" className="block active:scale-[.99] transition-transform">
              <div className="glass-panel rounded-3xl sm:rounded-[42px] overflow-hidden relative h-44 sm:h-56 border border-purple-400/20">
                <div className="absolute inset-0 hero-art" />
                {heroImage && <img src={heroImage.url} alt={heroImage.altText || heroImage.title} className="absolute inset-0 w-full h-full object-cover opacity-95 scale-105 brightness-110 contrast-110" />}
                <div className="absolute inset-0 bg-gradient-to-t from-[#050508]/60 via-transparent to-transparent" />
                <div className="absolute top-4 left-4 sm:top-5 sm:left-5 w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-white/10 bg-white/5 backdrop-blur-xl" />
                <div className="absolute -top-6 -right-10 w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-purple-500/15 blur-3xl" />

                <div className="absolute bottom-5 right-5 left-5 sm:bottom-7 sm:right-8 sm:left-8 text-right">
                  <span className="bg-gradient-to-r from-purple-600 to-fuchsia-600 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-[9px] sm:text-xs font-black tracking-wider mb-2 sm:mb-3 inline-flex shadow-[0_0_25px_rgba(188,0,255,.45)]">
                    رویداد ویژه
                  </span>
                  <h2 className="text-2xl sm:text-[32px] leading-7 sm:leading-8 font-black italic en-font tracking-tight">
                    GRAND CHAMPIONSHIP
                  </h2>
                  <p className="mt-2 sm:mt-3 text-[9px] sm:text-xs font-bold text-gray-400 tracking-widest">
                    تورنومنت‌های منتخب، جوایز ویژه و داوری هوشمند
                  </p>
                </div>
              </div>
            </Link>
          </section>

          {/* Game Selection */}
          <section className="mb-10 sm:mb-12">
            <div className="flex items-center justify-between mr-2 mb-4 sm:mb-6">
              <h3 className="text-xs sm:text-sm font-black text-gray-500 tracking-[0.2em] sm:tracking-[0.28em]">
                انتخاب بازی و مسابقات
              </h3>
              <Link href="/tournaments" className="text-xs font-black text-purple-300">
                همه روم‌ها
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {GAMES.map((game) => {
                const gameImage = imageMap.bySlug[`game-card-${game.id}`] || imageMap.byCategory[game.id];
                return (
                <Link key={game.id} href={`/tournaments?game=${game.id}`} className="block group active:scale-[.98] transition-transform">
                  <article className="game-card glass-panel rounded-3xl sm:rounded-[36px] overflow-hidden relative h-32 sm:h-40 border border-white/5 transition-all group-hover:border-purple-400/30 flex items-center justify-between px-6 sm:px-8">
                    <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-110" style={{ background: game.bg }} />
                    {gameImage && <img src={gameImage.url} alt={gameImage.altText || gameImage.title} className="absolute inset-0 w-full h-full object-cover opacity-30 brightness-110 contrast-110 transition-transform duration-700 group-hover:scale-110" />}
                    <div className="absolute inset-0 bg-gradient-to-l from-black/75 via-black/30 to-black/5" />
                    
                    {/* Left Side: Game Logo Container (Fully uniform, centered, and glowing!) */}
                    <div className="relative z-10 w-16 h-16 sm:w-20 sm:h-20 bg-white/5 border border-white/10 rounded-2xl sm:rounded-3xl p-2.5 flex items-center justify-center shadow-2xl transition-all group-hover:border-purple-500/30 group-hover:shadow-[0_0_20px_rgba(168,85,247,0.2)] shrink-0">
                      {imageMap.bySlug[`icon-${game.id}`] ? (
                        <img 
                          src={imageMap.bySlug[`icon-${game.id}`].url} 
                          alt={game.name} 
                          className="w-full h-full object-contain" 
                        />
                      ) : (
                        <img 
                          src={game.icon} 
                          alt={game.name} 
                          className="w-full h-full object-contain" 
                        />
                      )}
                    </div>

                    {/* Right Side: Game Title & Details */}
                    <div className="relative z-10 flex flex-col justify-center text-right">
                      <span className="text-[9px] sm:text-xs font-black text-white/30 en-font tracking-[0.2em] sm:tracking-[0.24em] mb-1 sm:mb-1.5 block">
                        GAMENT ROOM
                      </span>
                      <h4 className="text-2xl sm:text-3xl font-black en-font italic tracking-tight text-white group-hover:text-purple-300 transition-colors leading-none">
                        {game.name}
                      </h4>
                      <p className="mt-2 text-[9px] sm:text-xs font-black text-gray-400 tracking-wider">
                        مشاهده روم‌های فعال • {game.faName}
                      </p>
                    </div>
                  </article>
                </Link>
                );
              })}
            </div>
          </section>

          {/* AI Banner */}
          <section className="glass-panel p-5 sm:p-6 rounded-3xl sm:rounded-[36px] border border-purple-500/20 bg-gradient-to-r from-purple-900/10 to-transparent flex items-center justify-between mb-10 sm:mb-12">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 min-w-10 sm:min-w-12 glass-panel rounded-2xl sm:rounded-3xl flex items-center justify-center text-xl sm:text-2xl border border-purple-500/30 shadow-[0_0_22px_rgba(188,0,255,.22)]">
                🤖
              </div>
              <div className="text-right">
                <h5 className="text-sm font-black mb-1">داوری هوشمند آماده است</h5>
                <p className="text-xs text-gray-500 font-bold leading-5 hidden sm:block">
                  بررسی نتایج و گزارش‌ها با موتور AI گیمنت
                </p>
              </div>
            </div>
            <span className="text-sm opacity-25">❮</span>
          </section>

          <DailyQuests />

        </div>
      </div>

      <BottomNav />

      <style jsx global>{`
        .glass-panel {
          background: rgba(18, 18, 43, 0.9);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
        }

        .en-font {
          font-family: "Arial Black", Impact, system-ui, sans-serif;
          letter-spacing: -0.045em;
        }

        .num-en {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }

        .hero-art {
          background:
            radial-gradient(circle at 78% 22%, rgba(188, 0, 255, 0.55), transparent 18%),
            radial-gradient(circle at 20% 12%, rgba(0, 210, 255, 0.16), transparent 22%),
            radial-gradient(circle at 50% 108%, rgba(255, 255, 255, 0.10), transparent 34%),
            linear-gradient(135deg, #14101d 0%, #0b0b12 45%, #1c0630 100%);
        }

        .hero-art::before,
        .game-card::before {
          content: "";
          position: absolute;
          inset: 0;
          opacity: 0.12;
          background-image:
            linear-gradient(115deg, transparent 0 42%, rgba(255,255,255,.22) 43%, transparent 46%),
            linear-gradient(rgba(255,255,255,.18) 1px, transparent 1px);
          background-size: 180px 100%, 100% 26px;
          mix-blend-mode: screen;
        }

        /* Cyberpunk Glitch & Lag Effect for GAMENT Text */
        @keyframes glitch {
          0%, 100% {
            text-shadow: 1.5px 0 0 rgba(244, 63, 94, 0.75), -1.5px 0 0 rgba(6, 182, 212, 0.75);
            transform: translate(0);
          }
          10% {
            text-shadow: -1.5px 0.5px 0 rgba(244, 63, 94, 0.75), 1.5px -0.5px 0 rgba(6, 182, 212, 0.75);
            transform: translate(-0.5px, -0.2px);
          }
          20% {
            text-shadow: 2px -1px 0 rgba(244, 63, 94, 0.75), -2px 1px 0 rgba(6, 182, 212, 0.75);
            transform: translate(0.5px, 0.2px);
          }
          30%, 100% {
            text-shadow: none;
            transform: translate(0);
          }
        }

        .glitch-text {
          animation: glitch 2s infinite steps(2);
          position: relative;
        }
      `}</style>
    </main>
  );
}
