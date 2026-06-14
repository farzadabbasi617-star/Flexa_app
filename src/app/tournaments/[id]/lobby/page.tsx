"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function TournamentLobby() {
  const params = useParams();
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#050508] text-white font-vazir relative overflow-x-hidden">
      {/* Background Glow */}
      <div className="fixed inset-0 z-0">
        <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_100%_0%,_#2a004f_0%,_transparent_50%)]"></div>
      </div>

      <div className="relative z-10 max-w-[480px] mx-auto px-6 pb-40">
        {/* Header */}
        <header className="pt-12 pb-8 flex items-center justify-between">
            <Link href="/tournaments" className="w-10 h-10 glass-panel rounded-full flex items-center justify-center text-xs opacity-60">❯</Link>
            <div className="text-center">
                <h1 className="text-xl font-black en-font italic tracking-tighter" style={{ fontFamily: 'Orbitron' }}>MATCH LOBBY</h1>
                <p className="text-[8px] font-bold text-purple-400 uppercase tracking-[0.3em]">Official Tournament</p>
            </div>
            <div className="w-10"></div>
        </header>

        {/* Tournament Info Summary */}
        <section className="mb-8">
            <div className="glass-panel p-6 rounded-[35px] border-purple-500/20 flex items-center gap-5">
                <div className="w-16 h-16 glass-panel rounded-2xl flex items-center justify-center text-3xl border-purple-500/30 shadow-[0_0_15px_rgba(188,0,255,0.2)]">🎯</div>
                <div className="text-right">
                    <h2 className="text-lg font-black leading-none mb-1 en-font">iso-Double-579</h2>
                    <p className="text-[10px] text-gray-500 font-bold uppercase">COD Mobile • 100 Players</p>
                </div>
            </div>
        </section>

        {/* TIMER & LIVE STATUS */}
        <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-red-500/10 px-4 py-1.5 rounded-full border border-red-500/20 mb-3">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></span>
                <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">Starts in: 00:14:52</span>
            </div>
        </div>

        {/* ROOM CREDENTIALS (THE GOLDEN BOX) */}
        <section className="mb-10">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mr-4 mb-4">اطلاعات ورود به بازی</h3>
            <div className="glass-panel p-8 rounded-[45px] border-white/10 relative overflow-hidden bg-gradient-to-br from-[#1a1a20] to-transparent">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-50"></div>
                
                <div className="space-y-8">
                    {/* Room ID */}
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-[9px] font-black text-gray-500 uppercase mb-1">Room ID</p>
                            <p className="text-2xl en-font font-black num-en tracking-widest">9284102</p>
                        </div>
                        <button 
                          onClick={() => copyToClipboard("9284102", "id")}
                          className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${copied === 'id' ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-gray-400 hover:text-white'}`}>
                            {copied === 'id' ? 'کپی شد!' : 'کپی آیدی'}
                        </button>
                    </div>

                    <div className="h-px bg-white/5 w-full"></div>

                    {/* Password */}
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-[9px] font-black text-gray-500 uppercase mb-1">Password</p>
                            <p className="text-2xl en-font font-black num-en tracking-widest">flexa77</p>
                        </div>
                        <button 
                          onClick={() => copyToClipboard("flexa77", "pass")}
                          className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${copied === 'pass' ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-gray-400 hover:text-white'}`}>
                            {copied === 'pass' ? 'کپی شد!' : 'کپی رمز'}
                        </button>
                    </div>
                </div>
            </div>
            <p className="text-[9px] text-center text-red-400/60 font-bold mt-4">⚠️ اخطار: اشتراک‌گذاری اطلاعات لابی باعث محرومیت دائم می‌شود.</p>
        </section>

        {/* SPECIAL RULES */}
        <section className="mb-10 px-2">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mr-2 mb-4">قوانین اختصاصی این مسابقه</h3>
            <div className="glass-panel p-6 rounded-[30px] border-white/5 space-y-3">
                <div className="flex items-center gap-3 text-xs font-bold text-gray-300">
                    <span className="text-purple-500">●</span> استفاده از شبیه‌ساز (Emulator) ممنوع است.
                </div>
                <div className="flex items-center gap-3 text-xs font-bold text-gray-300">
                    <span className="text-purple-500">●</span> ضبط ویدیو از لحظه ورود الزامی است.
                </div>
                <div className="flex items-center gap-3 text-xs font-bold text-gray-300">
                    <span className="text-purple-500">●</span> آیدی بازی باید با آیدی ثبت شده مطابقت داشته باشد.
                </div>
            </div>
        </section>

        {/* AI JUDGE BADGE */}
        <div className="glass-panel p-5 rounded-[25px] border-purple-500/20 flex items-center justify-center gap-3 opacity-80">
            <span className="text-xl">🤖</span>
            <span className="text-[10px] font-black uppercase tracking-widest">AI Judge Is Monitoring This Lobby</span>
        </div>

      </div>

      {/* Persistent Bottom Button */}
      <div className="fixed bottom-10 left-0 right-0 max-w-[480px] mx-auto px-6 z-50">
          <button className="w-full py-5 rounded-3xl bg-gradient-to-r from-purple-600 to-blue-600 font-black text-sm shadow-[0_15px_30px_rgba(147,51,234,0.3)] active:scale-95 transition-all">
              ورود به بازی و تایید حضور
          </button>
      </div>

      <style jsx global>{`
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
