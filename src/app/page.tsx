"use client";

/*
 * These images come from admin-managed, arbitrary remote URLs (hero / game /
 * tournament banners stored in the DB), so next/image's domain allow-listing
 * isn't a good fit here. Using a plain <img> on purpose.
 */
/* eslint-disable @next/next/no-img-element */

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
  { id: "clash_royale", icon: "👑", bgGradient: "from-blue-600 to-cyan-500", imgCat: "clash_royale", color: "text-blue-400" },
  { id: "cod_mobile", icon: "🎯", bgGradient: "from-orange-600 to-red-500", imgCat: "cod_mobile", color: "text-orange-400" },
  { id: "fortnite", icon: "🏗️", bgGradient: "from-purple-600 to-pink-500", imgCat: "fortnite", color: "text-purple-400" },
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
    <div className="min-h-screen bg-dark-950 text-white font-gaming overflow-x-hidden">
      <Navbar />

      {/* HERO SECTION */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden py-20">
        {/* Background Effects */}
        <div className="absolute inset-0 z-0">
          {heroImg && (
            <img src={heroImg} alt="Gaming Hero" className="w-full h-full object-cover opacity-30 scale-105 animate-pulse" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-dark-950/60 via-dark-950/80 to-dark-950" />
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-neon-purple/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-neon-blue/10 rounded-full blur-[120px]" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-dark-800/50 border border-gaming-border backdrop-blur-md mb-8 animate-slide-up">
            <span className="w-2 h-2 bg-neon-green rounded-full animate-neon-pulse" />
            <span className="text-sm font-bold text-gray-300 tracking-wide">{t.home.badge}</span>
          </div>

          <h1 className="text-6xl sm:text-8xl font-black mb-8 leading-tight animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <span className="block text-white mb-2">فلکسا</span>
            <span className="block bg-gradient-to-r from-neon-purple via-purple-400 to-neon-blue bg-clip-text text-transparent">
              گیمینگ
            </span>
          </h1>

          <p className="text-lg sm:text-2xl text-gray-400 max-w-3xl mx-auto mb-12 leading-relaxed animate-slide-up" style={{ animationDelay: '0.2s' }}>
            {t.home.subtitle}{" "}
            <span className="text-neon-blue font-bold">{t.games.clash_royale}</span>،{" "}
            <span className="text-neon-orange font-bold">{t.games.cod_mobile}</span> {t.home.and}{" "}
            <span className="text-neon-purple font-bold">{t.games.fortnite}</span> {t.home.withAI}
          </p>

          <div className="flex flex-wrap gap-6 justify-center animate-slide-up" style={{ animationDelay: '0.3s' }}>
            <Link href="/register" className="gaming-btn text-lg px-10 py-4 rounded-full shadow-xl shadow-neon-purple/30 hover:scale-105 transition-transform">
              {lang === "fa" ? "🚀 شروع کنید" : "🚀 Get Started"}
            </Link>
            <Link href="/tournaments" className="px-10 py-4 rounded-full border-2 border-gaming-border bg-dark-800/30 backdrop-blur-md text-white font-bold text-lg hover:border-neon-purple hover:bg-neon-purple/10 transition-all group">
              <span className="flex items-center gap-2">
                {t.home.browseTournaments}
                <span className="group-hover:translate-x-1 transition-transform">←</span>
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-24 relative z-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { icon: "🛡️", title: "امن و قابل اعتماد", desc: "سیستم ضد تقلب و داوری هوش مصنوعی پیشرفته", color: "text-blue-400" },
            { icon: "🏆", title: "جوایز واقعی", desc: "جوایز نقدی و گیفت کارت برای برترین بازیکنان", color: "text-yellow-400" },
            { icon: "⚡", title: "سریع و حرفه‌ای", desc: "برگزاری تورنومنت‌ها در کمترین زمان با بهترین کیفیت", color: "text-purple-400" },
            { icon: "👥", title: "جامعه گیمرها", desc: "هزاران بازیکن فعال در تورنومنت‌های روزانه", color: "text-green-400" },
          ].map((f, i) => (
            <div key={i} className="gaming-card p-8 text-center group hover:bg-dark-800/50 transition-all border-b-4 border-b-transparent hover:border-b-neon-purple">
              <div className="text-5xl mb-6 group-hover:scale-125 transition-transform duration-300">{f.icon}</div>
              <h3 className={`text-xl font-black mb-3 ${f.color}`}>{f.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SUPPORTED GAMES */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-24 text-center relative z-10">
        <h2 className="text-4xl font-black mb-16 tracking-tight">
          بازی‌های <span className="text-neon-purple">پشتیبانی شده</span>
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {gamesArray.map((game) => (
            <Link key={game.id} href={`/tournaments?game=${game.id}`} className="gaming-card p-4 rounded-3xl group hover:scale-105 transition-all">
              <div className="relative h-32 mb-4 overflow-hidden rounded-2xl bg-dark-800">
                {game.image ? (
                  <img src={game.image} alt={game.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                ) : (
                  <div className={`w-full h-full bg-gradient-to-br ${game.bgGradient} flex items-center justify-center text-5xl`}>
                    {game.icon}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-dark-950 via-transparent to-transparent" />
              </div>
              <h3 className="text-lg font-black group-hover:text-neon-purple transition-colors">{game.name}</h3>
            </Link>
          ))}
          <Link href="/tournaments" className="gaming-card p-4 rounded-3xl flex flex-col items-center justify-center group hover:scale-105 transition-all border-dashed border-2 border-gaming-border">
             <div className="text-5xl mb-2">🏆</div>
             <span className="font-black text-gray-500 group-hover:text-white transition-colors">سایر بازی‌ها</span>
          </Link>
        </div>
      </section>

      {/* FEATURED TOURNAMENTS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-24 relative z-10">
        <div className="flex items-center justify-between mb-12">
          <h2 className="text-4xl font-black flex items-center gap-3">
            <span className="text-neon-purple">🏆</span> تورنومنت‌های ویژه
          </h2>
          <Link href="/tournaments" className="px-6 py-2 rounded-full bg-dark-800 text-sm font-bold hover:bg-dark-700 transition-all border border-gaming-border">
            مشاهده همه ←
          </Link>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { game: "Fortnite", prize: "20,000,000", players: "3,512", date: "جمعه - 19:00", img: "https://images.unsplash.com/photo-1589241062272-c0a057c76671?q=80&w=400", color: "from-purple-600" },
            { game: "COD Mobile", prize: "15,000,000", players: "2,048", date: "پس فردا - 21:00", img: "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=400", color: "from-orange-600" },
            { game: "Clash Royale", prize: "10,000,000", players: "1,256", date: "فردا - 20:00", img: "https://images.unsplash.com/photo-1511512578047-dfb36704//q=80&w=400", color: "from-blue-600" },
          ].map((t, i) => (
            <div key={i} className="relative h-[450px] rounded-3xl overflow-hidden group border border-gaming-border">
              <img src={t.img} alt={t.game} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-dark-950 via-dark-950/40 to-transparent" />
              
              <div className="absolute top-4 start-4">
                <span className={`px-3 py-1 rounded-full bg-gradient-to-r ${t.color} to-transparent text-white text-xs font-black shadow-lg`}>
                  {t.game}
                </span>
              </div>

              <div className="absolute bottom-0 inset-x-0 p-6">
                <div className="mb-4">
                  <span className="text-xs text-gray-400 block mb-1 font-bold">جایزه نقدی</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-white">{t.prize}</span>
                    <span className="text-sm text-gray-400">تومان</span>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2 text-sm text-gray-300 font-bold">
                    <span className="text-neon-purple">👤</span> {t.players} شرکت‌کننده
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-300 font-bold">
                    <span className="text-neon-purple">📅</span> {t.date}
                  </div>
                </div>

                <Link href="/tournaments" className="w-full py-4 rounded-2xl bg-neon-purple text-white font-black text-center block hover:bg-neon-purple/80 transition-all shadow-lg shadow-neon-purple/30 group-hover:scale-[1.02]">
                  ثبت نام ←
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* AI BANNER */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-24 relative z-10">
        <div className="gaming-card p-8 rounded-[40px] bg-gradient-to-r from-dark-900 to-dark-800 border-neon-purple/30 flex flex-col md:flex-row items-center justify-between gap-8 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-full bg-neon-purple/5 pointer-events-none" />
          <div className="flex items-center gap-6 z-10">
            <div className="w-20 h-20 bg-neon-purple/20 rounded-3xl flex items-center justify-center text-4xl border border-neon-purple/50 animate-glow">
              🤖
            </div>
            <div className="text-right">
              <h3 className="text-2xl font-black mb-2">داوری هوش مصنوعی پیشرفته</h3>
              <p className="text-gray-400 text-sm max-w-md leading-relaxed">
                سیستم ضد تقلب هوشمند برای تجربه‌ای عادلانه و حرفه‌ای در تمام مسابقات
              </p>
            </div>
          </div>
          <Link href="/about" className="z-10 px-8 py-3 rounded-full border-2 border-neon-purple text-neon-purple font-bold hover:bg-neon-purple hover:text-white transition-all">
            بیشتر بدانید ←
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gaming-border mt-12 bg-dark-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-3 group">
              <div className="w-10 h-10 bg-neon-purple rounded-xl flex items-center justify-center text-xl shadow-lg shadow-neon-purple/20 group-hover:rotate-12 transition-transform">⚡</div>
              <span className="text-2xl font-black tracking-tighter text-white">
                فلکسا<span className="text-neon-purple"> گیمینگ</span>
              </span>
            </div>
            <div className="flex items-center gap-8">
              {['قوانین', 'تورنومنت‌ها', 'رتبه‌بندی'].map((item) => (
                <Link key={item} href="#" className="text-gray-500 text-sm font-bold hover:text-neon-purple transition-colors">
                  {item}
                </Link>
              ))}
            </div>
            <div className="flex flex-col items-end gap-1">
              <p className="text-gray-600 text-xs font-medium">© 2026 Flexa Gaming. All rights reserved.</p>
              <span className="text-[10px] text-neon-purple/50 font-mono">v1.0.5 - Debug Mode</span>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
