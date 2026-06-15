"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";

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
    icon: "🎯",
    accent: "#ff8c00",
    bg: "radial-gradient(circle at 72% 35%, rgba(255,140,0,.46), transparent 18%), radial-gradient(circle at 18% 18%, rgba(255,255,255,.10), transparent 20%), linear-gradient(135deg, #090a10 0%, #151720 48%, #3a220d 100%)",
  },
  {
    id: "fortnite",
    name: "FORTNITE",
    faName: "فورتنایت",
    icon: "🏗️",
    accent: "#bc00ff",
    bg: "radial-gradient(circle at 75% 25%, rgba(188,0,255,.42), transparent 18%), radial-gradient(circle at 22% 70%, rgba(0,210,255,.18), transparent 24%), linear-gradient(135deg, #090a10 0%, #151022 52%, #28103a 100%)",
  },
  {
    id: "clash_royale",
    name: "CLASH ROYALE",
    faName: "کلش رویال",
    icon: "👑",
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
  const appBackground = imageMap.bySlug["app-background"] || imageMap.byCategory.background;

  return (
    <main className="min-h-screen bg-[#050508] text-white relative overflow-x-hidden selection:bg-purple-500/30">
      {/* Ambient background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        {appBackground && (
          <img src={appBackground.url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25 scale-105" />
        )}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,_rgba(92,0,160,.65)_0%,_rgba(32,0,56,.55)_30%,_transparent_70%)]" />
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-purple-700/20 blur-[80px] animate-pulse" />
        <div className="absolute top-72 -right-28 w-64 h-64 rounded-full bg-cyan-500/10 blur-[85px]" />
        <div className="absolute inset-0 opacity-[.055] bg-[linear-gradient(rgba(255,255,255,.9)_1px,_transparent_1px),linear-gradient(90deg,rgba(255,255,255,.9)_1px,_transparent_1px)] bg-[size:42px_42px]" />
      </div>

      <div className="relative z-10 max-w-[480px] mx-auto px-6 pb-28">
        {/* Header - same mobile structure as the reference: brand on right, wallet on left */}
        <header className="pt-12 pb-8 flex justify-between items-center">
          <div className="text-right">
            <h1 className="text-4xl font-black italic tracking-tighter en-font leading-none">FLEXA</h1>
            <p className="mt-2 text-[10px] font-black text-purple-300/90 tracking-[0.28em] uppercase">
              Elite Esports Hub
            </p>
          </div>

          <Link
            href="/profile"
            className="glass-panel px-4 py-3 rounded-[28px] flex items-center gap-3 border border-white/10 shadow-[0_18px_45px_rgba(0,0,0,.35)] active:scale-95 transition-transform"
          >
            <span className="grid place-items-center w-9 h-9 rounded-2xl bg-gradient-to-br from-purple-500 to-fuchsia-700 text-lg shadow-[0_0_22px_rgba(188,0,255,.45)]">
              +
            </span>
            <span className="text-sm font-black num-en tracking-wide">2,450,000</span>
          </Link>
        </header>

        {/* Hero Banner */}
        <section className="mb-10">
          <Link href="/tournaments" className="block active:scale-[.99] transition-transform">
            <div className="glass-panel rounded-[42px] overflow-hidden relative h-56 border border-purple-400/20 shadow-[0_28px_80px_rgba(0,0,0,.55)]">
              <div className="absolute inset-0 hero-art" />
              {heroImage && <img src={heroImage.url} alt={heroImage.altText || heroImage.title} className="absolute inset-0 w-full h-full object-cover opacity-45 scale-105" />}
              <div className="absolute inset-0 bg-gradient-to-t from-[#050508] via-[#050508]/25 to-transparent" />
              <div className="absolute top-5 left-5 w-9 h-9 rounded-full border border-white/10 bg-white/5 backdrop-blur-xl" />
              <div className="absolute -top-6 -right-10 w-40 h-40 rounded-full bg-purple-500/15 blur-3xl" />

              <div className="absolute bottom-7 right-8 left-7 text-right">
                <span className="bg-gradient-to-r from-purple-600 to-fuchsia-600 px-4 py-2 rounded-full text-[9px] font-black tracking-wider mb-3 inline-flex shadow-[0_0_25px_rgba(188,0,255,.45)]">
                  رویداد ویژه
                </span>
                <h2 className="text-[32px] leading-8 font-black italic en-font tracking-tight">
                  GRAND CHAMPIONSHIP
                </h2>
                <p className="mt-3 text-[10px] font-bold text-gray-400 tracking-widest">
                  تورنومنت‌های منتخب، جوایز ویژه و داوری هوشمند
                </p>
              </div>
            </div>
          </Link>
        </section>

        {/* Game Selection */}
        <section className="mb-12">
          <div className="flex items-center justify-between mr-2 mb-6">
            <h3 className="text-[11px] font-black text-gray-500 tracking-[0.28em]">
              انتخاب بازی و مسابقات
            </h3>
            <Link href="/tournaments" className="text-[10px] font-black text-purple-300">
              همه روم‌ها
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {GAMES.map((game) => {
              const gameImage = imageMap.bySlug[`game-card-${game.id}`] || imageMap.byCategory[game.id];
              return (
              <Link key={game.id} href={`/tournaments?game=${game.id}`} className="block group active:scale-[.98] transition-transform">
                <article className="game-card glass-panel fx-card rounded-[36px] overflow-hidden relative h-40 border border-white/5 transition-all group-hover:border-purple-400/30">
                  <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-110" style={{ background: game.bg }} />
                  {gameImage && <img src={gameImage.url} alt={gameImage.altText || gameImage.title} className="absolute inset-0 w-full h-full object-cover opacity-50 transition-transform duration-700 group-hover:scale-110" />}
                  <div className="absolute inset-0 bg-gradient-to-l from-black/85 via-black/40 to-black/5" />
                  <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />
                  <div className="absolute top-5 left-6 text-[10px] font-black text-white/30 en-font tracking-[0.24em]">
                    FLEXA ROOM
                  </div>
                  <div
                    className="absolute left-6 bottom-6 w-12 h-12 rounded-2xl opacity-90 blur-[1px]"
                    style={{ background: `radial-gradient(circle, ${game.accent}, transparent 68%)` }}
                  />

                  <div className="absolute inset-y-0 right-8 flex flex-col justify-center text-right">
                    <div className="text-4xl mb-2 drop-shadow-[0_0_18px_rgba(255,255,255,.15)]">{game.icon}</div>
                    <h4 className="text-2xl font-black en-font italic tracking-tight">{game.name}</h4>
                    <p className="mt-1 text-[10px] font-black text-gray-400 tracking-wider">
                      مشاهده روم‌های فعال • {game.faName}
                    </p>
                  </div>
                </article>
              </Link>
              );
            })}
          </div>
        </section>

        {/* AI Monitoring Banner */}
        <section className="glass-panel p-6 rounded-[36px] border border-purple-500/20 bg-gradient-to-r from-purple-900/10 to-transparent flex items-center justify-between shadow-[0_20px_55px_rgba(0,0,0,.35)]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 min-w-12 glass-panel rounded-3xl flex items-center justify-center text-2xl border border-purple-500/30 shadow-[0_0_22px_rgba(188,0,255,.22)]">
              🤖
            </div>
            <div className="text-right">
              <h5 className="text-sm font-black mb-1">داوری هوشمند آماده است</h5>
              <p className="text-[10px] text-gray-500 font-bold leading-5">
                بررسی نتایج و گزارش‌ها با موتور AI فلکسا
              </p>
            </div>
          </div>
          <span className="text-xs opacity-25">❮</span>
        </section>
      </div>

      <BottomNav />

      <style jsx global>{`
        .glass-panel {
          background: rgba(20, 20, 25, 0.72);
          backdrop-filter: blur(26px);
          -webkit-backdrop-filter: blur(26px);
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
      `}</style>
    </main>
  );
}
