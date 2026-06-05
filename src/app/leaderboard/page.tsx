"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";

interface Player {
  id: string;
  username: string;
  displayName: string;
  rating: number;
  wins: number;
  losses: number;
}

export default function LeaderboardPage() {
  const { t } = useLanguage();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"rating" | "wins" | "winrate">("rating");

  useEffect(() => {
    fetchPlayers();
  }, []);

  async function fetchPlayers() {
    setLoading(true);
    try {
      const res = await fetch("/api/players");
      const data = await res.json();
      setPlayers(Array.isArray(data) ? data : []);
    } catch {
      setPlayers([]);
    }
    setLoading(false);
  }

  function getWinRate(wins: number, losses: number) {
    const total = wins + losses;
    if (total === 0) return 0;
    return Math.round((wins / total) * 100);
  }

  const sortedPlayers = [...players].sort((a, b) => {
    if (sortBy === "rating") return b.rating - a.rating;
    if (sortBy === "wins") return b.wins - a.wins;
    return getWinRate(b.wins, b.losses) - getWinRate(a.wins, a.losses);
  });

  function getRankStyle(index: number) {
    if (index === 0)
      return "border-2 border-yellow-500 bg-yellow-500/5 shadow-[0_0_20px_rgba(234,179,8,0.2)]";
    if (index === 1) return "border-2 border-gray-400 bg-gray-400/5";
    if (index === 2) return "border-2 border-amber-700 bg-amber-700/5";
    return "border border-gaming-border";
  }

  function getRankBadge(index: number) {
    if (index === 0)
      return (
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-xl">
          🥇
        </div>
      );
    if (index === 1)
      return (
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 flex items-center justify-center text-xl">
          🥈
        </div>
      );
    if (index === 2)
      return (
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center text-xl">
          🥉
        </div>
      );
    return (
      <div className="w-12 h-12 rounded-full bg-dark-600 flex items-center justify-center text-lg font-bold text-gray-400">
        {index + 1}
      </div>
    );
  }

  function getRatingTier(rating: number) {
    if (rating >= 1500) return { name: t.tiers.legend, color: "text-yellow-400", icon: "👑" };
    if (rating >= 1400) return { name: t.tiers.diamond, color: "text-cyan-400", icon: "💎" };
    if (rating >= 1300) return { name: t.tiers.platinum, color: "text-blue-400", icon: "⭐" };
    if (rating >= 1200) return { name: t.tiers.gold, color: "text-yellow-500", icon: "🌟" };
    if (rating >= 1100) return { name: t.tiers.silver, color: "text-gray-400", icon: "🔰" };
    return { name: t.tiers.bronze, color: "text-amber-700", icon: "🛡️" };
  }

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">
            📊 <span className="neon-text-purple">{t.leaderboardPage.title}</span>
          </h1>
          <p className="text-gray-400">{t.leaderboardPage.subtitle}</p>
        </div>

        {/* Sort Controls */}
        <div className="flex justify-center gap-2 mb-8">
          {(["rating", "wins", "winrate"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                sortBy === s
                  ? "bg-neon-purple/20 text-neon-purple border border-neon-purple/50"
                  : "bg-dark-700 text-gray-400 border border-gaming-border hover:border-neon-purple/30"
              }`}
            >
              {s === "rating" && `⭐ ${t.leaderboardPage.rating}`}
              {s === "wins" && `🏆 ${t.leaderboardPage.wins}`}
              {s === "winrate" && `📈 ${t.leaderboardPage.winRate}`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-4 animate-neon-pulse">📊</div>
            <p className="text-gray-400">{t.leaderboardPage.loading}</p>
          </div>
        ) : sortedPlayers.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🏅</div>
            <h3 className="text-xl font-bold mb-2">{t.leaderboardPage.noPlayers}</h3>
            <p className="text-gray-400">{t.leaderboardPage.noPlayersDesc}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedPlayers.map((player, idx) => {
              const winRate = getWinRate(player.wins, player.losses);
              const tier = getRatingTier(player.rating);
              return (
                <div
                  key={player.id}
                  className={`rounded-xl p-4 sm:p-5 bg-gaming-card flex items-center gap-4 transition-all hover:scale-[1.01] ${getRankStyle(idx)}`}
                >
                  {getRankBadge(idx)}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-lg">{player.displayName}</span>
                      <span className={`text-xs ${tier.color} font-medium`}>
                        {tier.icon} {tier.name}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">@{player.username}</span>
                  </div>

                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center hidden sm:block">
                      <div className="text-neon-blue font-bold text-xl">{player.rating}</div>
                      <div className="text-xs text-gray-500">{t.leaderboardPage.rating}</div>
                    </div>
                    <div className="text-center hidden sm:block">
                      <div className="text-white font-bold">
                        <span className="text-neon-green">{player.wins}</span>
                        <span className="text-gray-600">/</span>
                        <span className="text-neon-pink">{player.losses}</span>
                      </div>
                      <div className="text-xs text-gray-500">{t.leaderboardPage.wl}</div>
                    </div>
                    <div className="text-center">
                      <div className="relative w-14 h-14">
                        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                          <circle
                            cx="28"
                            cy="28"
                            r="24"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                            className="text-dark-600"
                          />
                          <circle
                            cx="28"
                            cy="28"
                            r="24"
                            stroke="url(#gradient)"
                            strokeWidth="4"
                            fill="none"
                            strokeDasharray={`${winRate * 1.51} 151`}
                            strokeLinecap="round"
                          />
                          <defs>
                            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#39ff14" />
                              <stop offset="100%" stopColor="#00d4ff" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                          {winRate}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
