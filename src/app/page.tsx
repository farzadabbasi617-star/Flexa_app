"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";

interface SiteImage {
  slug: string;
  url: string;
  altText: string | null;
  category: string;
}

const GAMES_DATA = [
  { id: "clash_royale", icon: "⚔️", bgGradient: "from-blue-600 to-cyan-500", imgCat: "clash_royale" },
  { id: "cod_mobile", icon: "🎯", bgGradient: "from-orange-600 to-red-500", imgCat: "cod_mobile" },
  { id: "fortnite", icon: "🏗️", bgGradient: "from-purple-600 to-pink-500", imgCat: "fortnite" },
] as const;

export default function HomePage() {
  const { t, lang } = useLanguage();
  const [images, setImages] = useState<SiteImage[]>([]);

  useEffect(() => {
    fetch("/api/public/images")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setImages(d); })
      .catch(() => {});
  }, []);

  function getImage(category: string, fallback?: string): string | undefined {
    const img = images.find((i) => i.category === category);
    return img?.url || fallback;
  }

  const heroImg = getImage("hero");
  const gamesArray = GAMES_DATA.map((g) => ({
    ...g,
    name: t.games[g.id],
    desc: t.games[`${g.id}_desc` as keyof typeof t.games],
    image: getImage(g.imgCat),
  }));

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        {heroImg && (
          <div className="absolute inset-0">
            <img src={heroImg} alt="" className="w-full h-full object-cover opacity-20" />
            <div className="absolute inset-0 bg-gradient-to-b from-dark-900/50 via-dark-900/80 to-dark-900" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-neon-purple/10 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-neon-purple/5 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neon-purple/10 border border-neon-purple/30 mb-6">
              <span className="w-2 h-2 bg-neon-green rounded-full animate-neon-pulse" />
              <span className="text-sm text-neon-purple font-medium">{t.home.badge}</span>
            </div>

            <h1 className="text-5xl sm:text-7xl font-bold mb-6">
              <span className="bg-gradient-to-r from-neon-blue via-neon-purple to-neon-pink bg-clip-text text-transparent">
                {t.home.title1}
              </span>
              <br />
              <span className="text-white">{t.home.title2}</span>
            </h1>

            <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-8">
              {t.home.subtitle}{" "}
              <span className="text-neon-blue">{t.games.clash_royale}</span>،{" "}
              <span className="text-neon-orange">{t.games.cod_mobile}</span> {t.home.and}{" "}
              <span className="text-neon-purple">{t.games.fortnite}</span> {t.home.withAI}
            </p>

            <div className="flex flex-wrap gap-4 justify-center">
              <Link href="/register" className="gaming-btn text-base px-8 py-3">
                {lang === "fa" ? "🎮 شروع کنید" : "🎮 Get Started"}
              </Link>
              <Link href="/tournaments" className="px-8 py-3 rounded-lg border border-gaming-border text-white font-bold uppercase tracking-wider text-sm hover:border-neon-blue hover:bg-neon-blue/5 transition-all">
                {t.home.browseTournaments}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Games */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">
          <span className="neon-text-purple">{t.home.supportedGames}</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {gamesArray.map((game) => (
            <Link key={game.id} href={`/tournaments?game=${game.id}`} className="gaming-card overflow-hidden group">
              {game.image ? (
                <div className="relative h-44 overflow-hidden">
                  <img src={game.image} alt={game.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-gaming-card via-gaming-card/40 to-transparent" />
                  <div className="absolute top-3 start-3">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r ${game.bgGradient} text-white text-xs font-bold shadow-lg`}>
                      {game.icon} {game.name}
                    </span>
                  </div>
                </div>
              ) : (
                <div className={`h-44 bg-gradient-to-br ${game.bgGradient} flex items-center justify-center`}>
                  <span className="text-7xl">{game.icon}</span>
                </div>
              )}
              <div className="p-5 text-center">
                <h3 className="text-xl font-bold mb-2 group-hover:text-neon-blue transition-colors">{game.name}</h3>
                <p className="text-gray-400 text-sm mb-3">{game.desc}</p>
                <span className="text-xs text-neon-purple font-bold uppercase tracking-wider">{t.home.viewTournaments} →</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">
          <span className="neon-text-blue">{t.home.platformFeatures}</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { icon: "🏆", title: t.home.tournamentBrackets, desc: t.home.tournamentBracketsDesc },
            { icon: "🤖", title: t.home.aiJudging, desc: t.home.aiJudgingDesc },
            { icon: "⚖️", title: t.home.disputeResolution, desc: t.home.disputeResolutionDesc },
            { icon: "📊", title: t.home.liveLeaderboards, desc: t.home.liveLeaderboardsDesc },
          ].map((f) => (
            <div key={f.title} className="gaming-card p-6 text-center">
              <div className="text-4xl mb-3">{f.icon}</div>
              <h3 className="text-lg font-bold mb-2">{f.title}</h3>
              <p className="text-gray-400 text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <div className="gaming-card p-8 sm:p-12 text-center">
          <div className="text-5xl mb-4">⚡</div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            {lang === "fa" ? "آماده‌ای رقابت کنی؟" : "Ready to compete?"}
          </h2>
          <p className="text-gray-400 mb-6">
            {lang === "fa" ? "الان ثبت‌نام کن و توی تورنومنت‌ها شرکت کن" : "Register now and join tournaments"}
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/register" className="gaming-btn text-base px-8 py-3">
              {lang === "fa" ? "ثبت‌نام رایگان" : "Free Registration"}
            </Link>
            <Link href="/rules" className="px-8 py-3 rounded-lg border border-gaming-border text-white font-bold text-sm hover:border-neon-purple transition-all">
              {lang === "fa" ? "📜 قوانین" : "📜 Rules"}
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gaming-border mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚡</span>
              <span className="font-bold bg-gradient-to-r from-neon-blue to-neon-purple bg-clip-text text-transparent">Flexa</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/rules" className="text-gray-500 text-sm hover:text-white transition-colors">{lang === "fa" ? "قوانین" : "Rules"}</Link>
              <Link href="/tournaments" className="text-gray-500 text-sm hover:text-white transition-colors">{lang === "fa" ? "تورنومنت‌ها" : "Tournaments"}</Link>
              <Link href="/leaderboard" className="text-gray-500 text-sm hover:text-white transition-colors">{lang === "fa" ? "رتبه‌بندی" : "Leaderboard"}</Link>
            </div>
            <p className="text-gray-600 text-xs">flexa_app</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
