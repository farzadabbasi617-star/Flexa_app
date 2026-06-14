"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

const GAMES = [
  { id: "cod_mobile", name: "COD MOBILE", icon: "🎯", color: "#ff8c00", img: "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800" },
  { id: "fortnite", name: "FORTNITE", icon: "🏗️", color: "#bc00ff", img: "https://images.unsplash.com/photo-1589241062272-c0a057c76671?q=80&w=800" },
  { id: "clash_royale", name: "CLASH ROYALE", icon: "👑", color: "#00d2ff", img: "https://images.unsplash.com/photo-1511512578047-dfb36704?q=80&w=800" },
];

export default function LuxuryHomePage() {
  return (
    <div className="min-h-screen bg-[#050508] text-white font-vazir relative overflow-x-hidden">
      {/* Background Particles */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,_#1a0033_0%,_transparent_70%)]"></div>
        <div className="leaf-anim w-32 h-32 bg-purple-600/10 blur-3xl rounded-full absolute top-20 left-10 animate-pulse"></div>
      </div>

      <div className="relative z-10 max-w-[480px] mx-auto px-6 pb-32">
        {/* Header */}
        <header className="pt-12 pb-8 flex justify-between items-center">
            <div>
                <h1 className="text-3xl font-black italic tracking-tighter en-font" style={{ fontFamily: 'Orbitron' }}>FLEXA</h1>
                <p className="text-[10px] font-bold text-purple-400 tracking-widest uppercase">Elite Esports Hub</p>
            </div>
            <div className="glass-panel px-4 py-2 rounded-2xl flex items-center gap-2 border border-white/10 backdrop-blur-xl">
                <span className="text-xs font-bold num-en">2,450,000</span>
                <div className="bg-purple-600 w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-bold cursor-pointer">+</div>
            </div>
        </header>

        {/* Hero Banner */}
        <section className="mb-10">
            <div className="glass-panel rounded-[40px] overflow-hidden relative h-52 border border-purple-500/20 shadow-2xl">
                <img src="https://images.unsplash.com/photo-1511512578047-dfb36704?q=80&w=800" className="w-full h-full object-cover opacity-50" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050508] via-transparent to-transparent"></div>
                <div className="absolute bottom-6 right-8">
                    <span className="bg-purple-600 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest mb-2 inline-block">رویداد ویژه</span>
                    <h2 className="text-2xl font-black italic en-font">GRAND CHAMPIONSHIP</h2>
                </div>
            </div>
        </section>

        {/* Game Selection (Grid) */}
        <section className="mb-12">
            <h3 className="text-[11px] font-black text-gray-500 uppercase tracking-[0.3em] mr-2 mb-6">انتخاب بازی و مسابقات</h3>
            <div className="grid grid-cols-1 gap-6">
                {GAMES.map((game) => (
                    <Link key={game.id} href={`/tournaments?game=${game.id}`}>
                        <div className="glass-panel rounded-[35px] overflow-hidden relative h-36 border border-white/5 group hover:border-purple-500/30 transition-all active:scale-95">
                            <img src={game.img} className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:scale-110 transition-transform duration-700" />
                            <div className="absolute inset-0 bg-gradient-to-l from-black/80 via-black/20 to-transparent"></div>
                            <div className="absolute inset-y-0 right-8 flex flex-col justify-center text-right">
                                <div className="text-3xl mb-1">{game.icon}</div>
                                <h4 className="text-xl font-black en-font italic tracking-tighter">{game.name}</h4>
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">مشاهده روم‌های فعال</p>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </section>

        {/* AI Monitoring Banner */}
        <section className="glass-panel p-6 rounded-[35px] border-purple-500/20 bg-gradient-to-r from-purple-900/10 to-transparent flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 glass-panel rounded-2xl flex items-center justify-center text-2xl border-purple-500/30 shadow-[0_0_15px_rgba(188,0,255,0.2)]">🤖</div>
                <div className="text-right">
                    <h5 className="text-sm font-black mb-0.5">داوری هوشمند فعال است</h5>
                    <p className="text-[9px] text-gray-500 font-bold">تایید نتایج توسط موتور Gemini 2.0</p>
                </div>
            </div>
            <span className="text-xs opacity-20">❮</span>
        </section>
      </div>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 max-w-[480px] w-full p-6 z-50">
          <div className="glass-panel rounded-[40px] py-8 flex justify-around items-center border-white/10 shadow-[0_-20px_50px_rgba(0,0,0,0.8)]">
              <div className="flex flex-col items-center gap-1.5 text-purple-400">
                  <div className="text-2xl drop-shadow-[0_0_10px_#bc00ff]">🔥</div>
                  <span className="text-[8px] font-black uppercase">آرنا</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 opacity-30 cursor-pointer">
                  <div className="text-2xl">👑</div>
                  <span className="text-[9px] font-black uppercase">رتبه‌ها</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 opacity-30 cursor-pointer">
                  <div className="text-2xl">💬</div>
                  <span className="text-[9px] font-black uppercase">چت</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 opacity-30 cursor-pointer">
                  <div className="text-2xl">🚀</div>
                  <span className="text-[9px] font-black uppercase">پروفایل</span>
              </div>
          </div>
      </nav>

      <style jsx global>{`
        @font-face {
          font-family: 'Orbitron';
          src: url('https://fonts.googleapis.com/css2?family=Orbitron:wght@800&display=swap');
        }
        .glass-panel {
            background: rgba(20, 20, 25, 0.7);
            backdrop-filter: blur(25px);
        }
        .en-font { font-family: 'Orbitron', sans-serif; }
        .num-en { font-family: 'Rajdhani', sans-serif; }
      `}</style>
    </div>
  );
}
