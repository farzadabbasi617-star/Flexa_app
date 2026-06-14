"use client";

import { useCallback, useEffect, useState } from "react";
import BottomNav from "@/components/BottomNav";

interface Player {
  id: string;
  username: string;
  displayName: string;
  rating: number;
  wins: number;
  losses: number;
}

export default function LeaderboardPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/players");
      const data = await res.json();
      setPlayers(Array.isArray(data) ? data : []);
    } catch {
      setPlayers([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  return (
    <div className="min-h-screen bg-[#050508] text-white font-vazir relative overflow-x-hidden">
      {/* Background Glow */}
      <div className="fixed inset-0 z-0">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,_#1a0033_0%,_transparent_70%)]"></div>
      </div>

      <div className="relative z-10 max-w-[480px] mx-auto px-6 pb-44">
        {/* Header */}
        <header className="pt-12 pb-8">
            <h1 className="text-6xl font-black italic tracking-tighter en-font opacity-90 drop-shadow-2xl" style={{ fontFamily: 'Orbitron' }}>RANKINGS</h1>
            <p className="text-[10px] font-bold text-purple-400 tracking-[0.3em] uppercase opacity-60 mt-2">قهرمانان فلکسا</p>
        </header>

        {/* TABS (Static for now) */}
        <div class="bg-[#111115] p-1 rounded-2xl border border-white/5 flex gap-1 mb-8">
            <button class="flex-1 py-3 rounded-xl bg-white/5 text-xs font-black tracking-wider border border-white/5">GLOBAL</button>
            <button class="flex-1 py-3 rounded-xl text-gray-500 text-xs font-black tracking-wider">FRIENDS</button>
        </div>

        {loading ? (
          <div className="text-center py-20 animate-pulse text-purple-500">در حال لود کردن...</div>
        ) : (
          <div className="space-y-4">
            {players.map((player, idx) => (
              <div key={player.id} className={`glass-panel p-6 rounded-[40px] flex items-center gap-5 ${idx === 0 ? 'border-yellow-500/30' : 'border-white/5'}`}>
                <div className="w-10 text-center text-3xl">
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : (idx + 1)}
                </div>
                <div className={`w-14 h-14 rounded-full border-2 p-1 ${idx === 0 ? 'border-yellow-500' : 'border-white/10'}`}>
                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${player.username}`} className="rounded-full bg-black/40" />
                </div>
                <div className="flex-1 text-right">
                    <h4 className="text-lg font-black en-font tracking-tighter uppercase">{player.username}</h4>
                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">{player.displayName}</p>
                </div>
                <div className="text-left">
                    <p className="text-base font-black num-en">{player.rating}</p>
                    <p className="text-[8px] text-gray-600 font-bold uppercase">Points</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />

      <style jsx global>{`
        .glass-panel {
            background: rgba(20, 20, 25, 0.75);
            backdrop-filter: blur(25px);
        }
        .en-font { font-family: 'Orbitron', sans-serif; }
        .num-en { font-family: 'Rajdhani', sans-serif; }
      `}</style>
    </div>
  );
}
