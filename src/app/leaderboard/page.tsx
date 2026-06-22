"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";

interface Player {
  id: string;
  username: string;
  displayName: string;
  rating: number;
  wins: number;
  losses: number;
  xp?: number | null;
  level?: number | null;
  rankPoints?: number | null;
  gamentId?: string | null;
  isVerified?: boolean | null;
}

type Board = "rating" | "xp" | "wins" | "winrate";

const BOARDS: Array<{ id: Board; label: string; icon: string }> = [
  { id: "rating", label: "امتیاز", icon: "⭐" },
  { id: "xp", label: "XP / Level", icon: "⚡" },
  { id: "wins", label: "بردها", icon: "🏆" },
  { id: "winrate", label: "درصد برد", icon: "📈" },
];

function getWinRate(player: Player) {
  const total = player.wins + player.losses;
  return total > 0 ? Math.round((player.wins / total) * 100) : 0;
}

function scoreFor(player: Player, board: Board) {
  if (board === "xp") return player.xp ?? 0;
  if (board === "wins") return player.wins;
  if (board === "winrate") return getWinRate(player);
  return player.rating;
}

function medal(index: number) {
  if (index === 0) return "🥇";
  if (index === 1) return "🥈";
  if (index === 2) return "🥉";
  return `#${index + 1}`;
}

export default function LeaderboardPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [board, setBoard] = useState<Board>("rating");

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/players?limit=100", { cache: "no-store" });
      const data = await res.json();
      setPlayers(Array.isArray(data) ? data : Array.isArray(data.data) ? data.data : []);
    } catch {
      setPlayers([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => scoreFor(b, board) - scoreFor(a, board));
  }, [players, board]);

  const topThree = sortedPlayers.slice(0, 3);

  return (
    <div className="min-h-screen bg-[#050508] text-white relative overflow-x-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_#1a0033_0%,_transparent_70%)]" />
        <div className="absolute -top-20 -left-20 w-72 h-72 bg-purple-700/20 rounded-full blur-[90px] animate-float-slow" />
      </div>

      <div className="relative z-10 max-w-[720px] mx-auto px-6 pb-32">
        <header className="pt-12 pb-8">
          <h1 className="text-5xl sm:text-6xl font-black italic tracking-tighter en-font opacity-95 drop-shadow-2xl">RANKINGS</h1>
          <p className="text-[10px] font-bold text-purple-400 tracking-[0.3em] uppercase opacity-70 mt-2">قهرمانان گیمنت</p>
        </header>

        <div className="flex gap-2 overflow-x-auto pb-3 mb-8 scrollbar-hide">
          {BOARDS.map((item) => (
            <button
              key={item.id}
              onClick={() => setBoard(item.id)}
              className={`whitespace-nowrap px-5 py-3 rounded-2xl text-sm font-black border transition-all active:scale-[0.985] ${
                board === item.id 
                  ? "bg-purple-600 text-white border-purple-500 shadow-[0_0_20px_rgba(168,85,247,.3)]" 
                  : "bg-[#111114] border-white/10 text-gray-400 hover:border-white/30"
              }`}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20 animate-pulse text-purple-500">در حال لود کردن...</div>
        ) : sortedPlayers.length === 0 ? (
          <div className="gaming-card p-10 text-center text-gray-500">هنوز بازیکنی برای رتبه‌بندی وجود ندارد.</div>
        ) : (
          <>
            <section className="grid grid-cols-3 gap-3 mb-10 items-end">
              {[topThree[1], topThree[0], topThree[2]].map((player, visualIndex) => {
                if (!player) return <div key={visualIndex} />;
                const actualIndex = sortedPlayers.findIndex((p) => p.id === player.id);
                const isFirst = actualIndex === 0;
                return (
                  <Link 
                    key={player.id} 
                    href={`/players/${player.id}`} 
                    className={`glass-panel p-5 text-center active:scale-[0.985] transition-all border ${isFirst ? "border-yellow-500/50 scale-[1.03]" : "border-white/10"}`}
                  >
                    <div className="text-4xl mb-3">{medal(actualIndex)}</div>
                    <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-purple-600 to-cyan-500 grid place-items-center text-2xl font-black mb-3 ring-4 ring-[#050508]">
                      {player.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="font-black truncate text-[15px]">{player.displayName}</div>
                    <div className="text-xs text-gray-500 truncate">@{player.username}</div>
                    <div className="mt-3 text-yellow-400 font-black text-xl tracking-tight num-en">
                      {scoreFor(player, board).toLocaleString("fa-IR")}
                    </div>
                  </Link>
                );
              })}
            </section>

            <div className="space-y-2.5">
              {sortedPlayers.map((player, idx) => {
                const winRate = getWinRate(player);
                return (
                  <Link 
                    key={player.id} 
                    href={`/players/${player.id}`} 
                    className="glass-panel active:bg-white/5 p-5 rounded-3xl flex items-center gap-4 border border-white/10 active:scale-[0.985] transition-all"
                  >
                    <div className="w-11 text-center text-xl font-black text-purple-400">{medal(idx)}</div>
                    
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 grid place-items-center font-black text-lg ring-4 ring-[#050508]">
                      {player.displayName.charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0 text-right">
                      <div className="font-black flex items-center justify-end gap-1.5">
                        {player.displayName}
                        {player.isVerified && <span className="text-emerald-400 text-sm">✓</span>}
                      </div>
                      <div className="text-xs text-gray-500">@{player.username} • سطح {player.level || 1}</div>
                    </div>

                    <div className="text-right min-w-[68px]">
                      <div className="font-black text-2xl num-en tracking-[-1px]">
                        {scoreFor(player, board).toLocaleString("fa-IR")}
                      </div>
                      <div className="text-[10px] text-gray-500 -mt-0.5">
                        {board === "winrate" ? "%" : board}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>

      <BottomNav />

      <style jsx global>{`
        .glass-panel { background: rgba(20, 20, 25, 0.75); backdrop-filter: blur(25px); }
        .en-font { font-family: Impact, "Arial Black", system-ui, sans-serif; letter-spacing: -0.04em; }
        .num-en { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      `}</style>
    </div>
  );
}
