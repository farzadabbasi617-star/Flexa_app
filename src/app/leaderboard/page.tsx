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
  { id: "rating", label: "امتیاز رنکینگ", icon: "⭐" },
  { id: "xp", label: "سطح و تجربه (XP)", icon: "⚡" },
  { id: "wins", label: "تعداد بردها", icon: "🏆" },
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

function scoreUnit(board: Board) {
  if (board === "xp") return "XP";
  if (board === "wins") return "برد";
  if (board === "winrate") return "٪";
  return "امتیاز";
}

function getRankTier(rating: number) {
  if (rating >= 2000) return { label: "افسانه‌ای", color: "text-purple-400 bg-purple-950/40 border-purple-500/50", icon: "🔮" };
  if (rating >= 1600) return { label: "الماس", color: "text-cyan-400 bg-cyan-950/40 border-cyan-500/50", icon: "💎" };
  if (rating >= 1300) return { label: "طلایی", color: "text-yellow-400 bg-yellow-950/40 border-yellow-500/50", icon: "🥇" };
  if (rating >= 1000) return { label: "نقره‌ای", color: "text-gray-300 bg-gray-900/40 border-gray-500/50", icon: "🥈" };
  return { label: "برنزی", color: "text-amber-600 bg-amber-950/40 border-amber-800/50", icon: "🥉" };
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
  const [searchQuery, setSearchQuery] = useState("");

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

  const filteredPlayers = useMemo(() => {
    if (!searchQuery.trim()) return sortedPlayers;
    const query = searchQuery.toLowerCase().trim();
    return sortedPlayers.filter(
      (p) =>
        p.displayName.toLowerCase().includes(query) ||
        p.username.toLowerCase().includes(query) ||
        (p.gamentId && p.gamentId.toLowerCase().includes(query))
    );
  }, [sortedPlayers, searchQuery]);

  const topThree = useMemo(() => {
    return filteredPlayers.slice(0, 3);
  }, [filteredPlayers]);

  return (
    <div className="min-h-screen bg-[#050508] text-white relative overflow-x-hidden">
      {/* Background Gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_#1a0033_0%,_transparent_70%)]" />
        <div className="absolute -top-20 -left-20 w-72 h-72 bg-purple-700/20 rounded-full blur-[90px] animate-pulse" />
        <div className="absolute top-1/3 -right-20 w-80 h-80 bg-blue-700/10 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-[720px] mx-auto px-6 pb-32">
        <header className="pt-12 pb-6">
          <h1 className="text-5xl sm:text-6xl font-black italic tracking-tighter en-font opacity-95 drop-shadow-2xl bg-gradient-to-l from-purple-400 to-cyan-300 bg-clip-text text-transparent">
            LEADERBOARD
          </h1>
          <p className="text-[10px] font-bold text-purple-400 tracking-[0.3em] uppercase opacity-70 mt-2">رتبه‌بندی قهرمانان گیمنت</p>
        </header>

        {/* Search Input */}
        <div className="mb-6 relative">
          <input
            type="text"
            placeholder="جستجوی بازیکن با نام، نام کاربری یا شناسه گیمنت..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#111114] border border-white/10 rounded-2xl px-5 py-4 pr-12 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all text-right"
            dir="rtl"
          />
          <div className="absolute top-1/2 right-4 -translate-y-1/2 text-gray-500">
            🔍
          </div>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute top-1/2 left-4 -translate-y-1/2 text-xs text-gray-400 hover:text-white"
            >
              لغو
            </button>
          )}
        </div>

        {/* Boards Selector */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-8 scrollbar-hide" dir="rtl">
          {BOARDS.map((item) => (
            <button
              key={item.id}
              onClick={() => setBoard(item.id)}
              className={`whitespace-nowrap px-5 py-3.5 rounded-2xl text-xs font-black border transition-all active:scale-[0.985] ${
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
          <div className="text-center py-20 animate-pulse text-purple-500">در حال دریافت لیست قهرمانان...</div>
        ) : filteredPlayers.length === 0 ? (
          <div className="gaming-card p-12 text-center text-gray-500 border border-white/5 rounded-3xl bg-[#111114]/40">
            <span className="text-4xl block mb-3">🧐</span>
            هیچ بازیکنی با این مشخصات پیدا نشد.
          </div>
        ) : (
          <>
            {/* Top 3 Podium */}
            {!searchQuery && topThree.length >= 3 && (
              <section className="grid grid-cols-3 gap-3 mb-10 items-end" dir="rtl">
                {/* 2nd Place */}
                {topThree[1] && (
                  <Link 
                    href={`/players/${topThree[1].id}`} 
                    className="glass-panel p-4 rounded-3xl text-center active:scale-[0.985] transition-all border border-white/5 hover:border-white/20 relative"
                  >
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-2xl">{medal(1)}</div>
                    <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-br from-gray-400 to-gray-600 grid place-items-center text-xl font-black mb-3 ring-4 ring-[#050508] mt-2">
                      {topThree[1].displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="font-black truncate text-xs sm:text-sm">{topThree[1].displayName}</div>
                    <div className="text-[10px] text-gray-500 truncate">@{topThree[1].username}</div>
                    <div className="mt-2 text-gray-300 font-black text-sm tracking-tight num-en">
                      {scoreFor(topThree[1], board).toLocaleString("fa-IR")} <span className="text-[9px] text-gray-500 font-normal">{scoreUnit(board)}</span>
                    </div>
                  </Link>
                )}

                {/* 1st Place */}
                {topThree[0] && (
                  <Link 
                    href={`/players/${topThree[0].id}`} 
                    className="glass-panel p-5 rounded-3xl text-center active:scale-[0.985] transition-all border border-yellow-500/30 shadow-[0_0_30px_rgba(234,179,8,.1)] scale-[1.05] relative z-10"
                  >
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-3xl">{medal(0)}</div>
                    <div className="w-18 h-18 mx-auto rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 grid place-items-center text-3xl font-black mb-3 ring-4 ring-[#050508] mt-2 shadow-[0_0_15px_rgba(234,179,8,.3)]">
                      {topThree[0].displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="font-black truncate text-sm sm:text-base text-yellow-100">{topThree[0].displayName}</div>
                    <div className="text-[10px] text-yellow-500/70 truncate font-semibold">@{topThree[0].username}</div>
                    <div className="mt-2 text-yellow-400 font-black text-lg tracking-tight num-en">
                      {scoreFor(topThree[0], board).toLocaleString("fa-IR")} <span className="text-[10px] text-yellow-500/50 font-normal">{scoreUnit(board)}</span>
                    </div>
                  </Link>
                )}

                {/* 3rd Place */}
                {topThree[2] && (
                  <Link 
                    href={`/players/${topThree[2].id}`} 
                    className="glass-panel p-4 rounded-3xl text-center active:scale-[0.985] transition-all border border-white/5 hover:border-white/20 relative"
                  >
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-2xl">{medal(2)}</div>
                    <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-br from-amber-700 to-amber-900 grid place-items-center text-xl font-black mb-3 ring-4 ring-[#050508] mt-2">
                      {topThree[2].displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="font-black truncate text-xs sm:text-sm">{topThree[2].displayName}</div>
                    <div className="text-[10px] text-gray-500 truncate">@{topThree[2].username}</div>
                    <div className="mt-2 text-amber-500/90 font-black text-sm tracking-tight num-en">
                      {scoreFor(topThree[2], board).toLocaleString("fa-IR")} <span className="text-[9px] text-amber-500/50 font-normal">{scoreUnit(board)}</span>
                    </div>
                  </Link>
                )}
              </section>
            )}

            {/* Players List */}
            <div className="space-y-2.5" dir="rtl">
              {filteredPlayers.map((player, idx) => {
                const actualIndex = sortedPlayers.findIndex((p) => p.id === player.id);
                const isTop3 = actualIndex < 3 && !searchQuery;
                const tier = getRankTier(player.rating);

                return (
                  <Link 
                    key={player.id} 
                    href={`/players/${player.id}`} 
                    className={`glass-panel active:bg-white/5 p-4 sm:p-5 rounded-3xl flex items-center gap-4 border transition-all ${
                      isTop3 
                        ? actualIndex === 0 
                          ? "border-yellow-500/20 bg-yellow-500/5" 
                          : "border-purple-500/10"
                        : "border-white/5 hover:border-white/10"
                    }`}
                  >
                    {/* Rank Number / Medal */}
                    <div className="w-11 text-center text-lg font-black text-purple-400">
                      {medal(actualIndex)}
                    </div>
                    
                    {/* Avatar */}
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 grid place-items-center font-black text-lg ring-4 ring-[#050508] shadow-lg">
                      {player.displayName.charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 text-right">
                      <div className="font-black flex items-center justify-start gap-1.5 text-sm sm:text-base">
                        {player.displayName}
                        {player.isVerified && (
                          <span className="text-emerald-400 text-xs bg-emerald-500/10 px-1.5 py-0.5 rounded-md border border-emerald-500/20">✓ تایید شده</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 flex items-center justify-start gap-1.5">
                        <span className="num-en">@{player.username}</span>
                        <span>•</span>
                        <span>سطح {player.level || 1}</span>
                        {board === "rating" && (
                          <>
                            <span>•</span>
                            <span className={`px-1.5 py-0.2 rounded-md text-[9px] border font-bold ${tier.color}`}>
                              {tier.icon} {tier.label}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Score display */}
                    <div className="text-left min-w-[75px]">
                      <div className="font-black text-xl sm:text-2xl num-en tracking-tight text-purple-100">
                        {scoreFor(player, board).toLocaleString("fa-IR")}
                      </div>
                      <div className="text-[10px] text-gray-500 font-bold">
                        {scoreUnit(board)}
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
        .glass-panel { background: rgba(18, 18, 22, 0.7); backdrop-filter: blur(20px); }
        .en-font { font-family: Impact, "Arial Black", system-ui, sans-serif; letter-spacing: -0.04em; }
        .num-en { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
