"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

interface PlayerStats {
  rating: number;
  wins: number;
  losses: number;
  totalMatches: number;
  winRate: number;
}

export default function ProfilePage() {
  const { t, lang } = useLanguage();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<PlayerStats | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/players");
      const players = await res.json();
      if (Array.isArray(players)) {
        const myPlayer = players.find(
          (p: { username: string }) => p.username === user?.username
        );
        if (myPlayer) {
          const total = myPlayer.wins + myPlayer.losses;
          setStats({
            rating: myPlayer.rating,
            wins: myPlayer.wins,
            losses: myPlayer.losses,
            totalMatches: total,
            winRate: total > 0 ? Math.round((myPlayer.wins / total) * 100) : 0,
          });
        }
      }
    } catch {
      // handle error
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [user, fetchStats]);

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-900">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="text-4xl animate-neon-pulse">⚡</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const hasAnyGameId = user.clashRoyaleId || user.codMobileId || user.fortniteId;

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Profile Header */}
        <div className="gaming-card p-6 sm:p-8 mb-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar */}
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-neon-purple via-neon-blue to-neon-pink flex items-center justify-center text-4xl font-bold">
              {user.displayName.charAt(0).toUpperCase()}
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-start">
              <h1 className="text-2xl sm:text-3xl font-bold">{user.displayName}</h1>
              <p className="text-gray-400">@{user.username}</p>
              <p className="text-gray-500 text-sm mt-1">{user.email}</p>

              <div className="flex flex-wrap gap-2 mt-4 justify-center sm:justify-start">
                <span className="px-3 py-1 rounded-full bg-neon-purple/20 text-neon-purple text-xs font-bold">
                  {user.role === "admin" ? "👑 Admin" : user.role === "judge" ? "⚖️ Judge" : "🎮 Player"}
                </span>
                <span className="px-3 py-1 rounded-full bg-dark-600 text-gray-400 text-xs">
                  {t.auth.memberSince}: {new Date().toLocaleDateString(lang === "fa" ? "fa-IR" : "en-US")}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Link href="/profile/edit" className="gaming-btn text-sm">
                ✏️ {t.auth.editProfile}
              </Link>
            </div>
          </div>
        </div>

        {/* Game IDs Warning */}
        {!hasAnyGameId && (
          <div className="bg-neon-orange/10 border border-neon-orange/50 rounded-lg p-4 mb-6 flex items-center gap-4">
            <span className="text-2xl">⚠️</span>
            <div className="flex-1">
              <p className="font-bold text-neon-orange">
                {lang === "fa" ? "آیدی بازی‌ها وارد نشده!" : "Game IDs not set!"}
              </p>
              <p className="text-sm text-gray-400">
                {t.auth.gameIdsDesc}
              </p>
            </div>
            <Link href="/profile/edit" className="gaming-btn text-sm bg-gradient-to-r from-neon-orange to-neon-pink">
              {lang === "fa" ? "وارد کردن" : "Add Now"}
            </Link>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: t.playersPage.rating, value: stats?.rating || 1000, icon: "⭐", color: "text-neon-blue" },
            { label: t.leaderboardPage.wins, value: stats?.wins || 0, icon: "🏆", color: "text-neon-green" },
            { label: t.auth.totalMatches, value: stats?.totalMatches || 0, icon: "⚔️", color: "text-neon-purple" },
            { label: t.auth.winRate, value: `${stats?.winRate || 0}%`, icon: "📈", color: "text-neon-orange" },
          ].map((stat) => (
            <div key={stat.label} className="gaming-card p-4 text-center">
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className={`text-xl sm:text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Game IDs Display */}
        <div className="gaming-card p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold neon-text-purple">{t.auth.gameIds}</h3>
            <Link href="/profile/edit" className="text-sm text-neon-blue hover:underline">
              {t.auth.editProfile} →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Clash Royale */}
            <div className={`p-4 rounded-lg ${user.clashRoyaleId ? "bg-neon-blue/10 border border-neon-blue/30" : "bg-dark-700"}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">⚔️</span>
                <span className="font-bold text-sm">{t.games.clash_royale}</span>
              </div>
              {user.clashRoyaleId ? (
                <>
                  <p className="text-neon-blue font-mono text-sm">{user.clashRoyaleId}</p>
                  <p className="text-gray-400 text-xs mt-1">{user.clashRoyaleUsername}</p>
                </>
              ) : (
                <p className="text-gray-500 text-sm">{lang === "fa" ? "وارد نشده" : "Not set"}</p>
              )}
            </div>

            {/* COD Mobile */}
            <div className={`p-4 rounded-lg ${user.codMobileId ? "bg-neon-orange/10 border border-neon-orange/30" : "bg-dark-700"}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🎯</span>
                <span className="font-bold text-sm">{t.games.cod_mobile}</span>
              </div>
              {user.codMobileId ? (
                <>
                  <p className="text-neon-orange font-mono text-sm">{user.codMobileId}</p>
                  <p className="text-gray-400 text-xs mt-1">{user.codMobileUsername}</p>
                </>
              ) : (
                <p className="text-gray-500 text-sm">{lang === "fa" ? "وارد نشده" : "Not set"}</p>
              )}
            </div>

            {/* Fortnite */}
            <div className={`p-4 rounded-lg ${user.fortniteId ? "bg-neon-purple/10 border border-neon-purple/30" : "bg-dark-700"}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🏗️</span>
                <span className="font-bold text-sm">{t.games.fortnite}</span>
              </div>
              {user.fortniteId ? (
                <>
                  <p className="text-neon-purple font-mono text-sm">{user.fortniteId}</p>
                  <p className="text-gray-400 text-xs mt-1">{user.fortniteUsername}</p>
                </>
              ) : (
                <p className="text-gray-500 text-sm">{lang === "fa" ? "وارد نشده" : "Not set"}</p>
              )}
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link href="/profile/tournaments" className="gaming-card p-5 flex items-center gap-4 group">
            <div className="text-3xl">🏆</div>
            <div>
              <h3 className="font-bold group-hover:text-neon-blue transition-colors">
                {t.auth.myTournaments}
              </h3>
              <p className="text-sm text-gray-500">
                {lang === "fa" ? "مدیریت تورنومنت‌ها" : "Manage tournaments"}
              </p>
            </div>
          </Link>

          <Link href="/notifications" className="gaming-card p-5 flex items-center gap-4 group">
            <div className="text-3xl">🔔</div>
            <div>
              <h3 className="font-bold group-hover:text-neon-blue transition-colors">
                {t.notif.title}
              </h3>
              <p className="text-sm text-gray-500">
                {lang === "fa" ? "اعلان‌های شما" : "Your notifications"}
              </p>
            </div>
          </Link>

          <Link href="/chat" className="gaming-card p-5 flex items-center gap-4 group">
            <div className="text-3xl">💬</div>
            <div>
              <h3 className="font-bold group-hover:text-neon-blue transition-colors">
                {t.chat.title}
              </h3>
              <p className="text-sm text-gray-500">
                {lang === "fa" ? "پیام‌های شما" : "Your messages"}
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
