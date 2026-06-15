"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

interface DashboardData {
  myTournaments: number;
  upcomingMatches: number;
  unreadNotifications: number;
  rating: number;
  wins: number;
  losses: number;
  recentActivity: Array<{
    type: string;
    title: string;
    time: string;
  }>;
}

export default function DashboardPage() {
  const { t, lang } = useLanguage();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData>({
    myTournaments: 0,
    upcomingMatches: 0,
    unreadNotifications: 0,
    rating: 1000,
    wins: 0,
    losses: 0,
    recentActivity: [],
  });

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  const fetchDashboard = useCallback(async () => {
    try {
      const [pRes, nRes] = await Promise.all([
        fetch("/api/players"),
        fetch("/api/notifications"),
      ]);
      const playersResponse = await pRes.json();
      const notificationsResponse = await nRes.json();
      const players = Array.isArray(playersResponse) ? playersResponse : Array.isArray(playersResponse.data) ? playersResponse.data : [];
      const notifications = Array.isArray(notificationsResponse) ? notificationsResponse : Array.isArray(notificationsResponse.data) ? notificationsResponse.data : [];

      let myStats = { rating: 1000, wins: 0, losses: 0 };
      if (Array.isArray(players)) {
        const me = players.find((p: { username: string }) => p.username === user?.username);
        if (me) myStats = { rating: me.rating, wins: me.wins, losses: me.losses };
      }

      const unread = Array.isArray(notifications)
        ? notifications.filter((n: { isRead: boolean }) => !n.isRead).length
        : 0;

      setData({
        myTournaments: 0,
        upcomingMatches: 0,
        unreadNotifications: unread,
        ...myStats,
        recentActivity: [],
      });
    } catch {
      // ignore
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchDashboard();
  }, [user, fetchDashboard]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-dark-900">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="text-4xl animate-neon-pulse">⚡</div>
        </div>
      </div>
    );
  }

  const hasGameIds = user.clashRoyaleId || user.codMobileId || user.fortniteId;
  const total = data.wins + data.losses;
  const winRate = total > 0 ? Math.round((data.wins / total) * 100) : 0;

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold">
            {lang === "fa" ? `سلام ${user.displayName}! 👋` : `Hey ${user.displayName}! 👋`}
          </h1>
          <p className="text-gray-400 mt-1">
            {lang === "fa" ? "خوش اومدی به داشبورد Flexa" : "Welcome to your Flexa dashboard"}
          </p>
        </div>

        {/* Game ID Warning */}
        {!hasGameIds && (
          <div className="bg-neon-orange/10 border border-neon-orange/40 rounded-xl p-4 mb-6 flex items-center gap-4 animate-slide-up">
            <span className="text-3xl">⚠️</span>
            <div className="flex-1">
              <p className="font-bold text-neon-orange">
                {lang === "fa" ? "آیدی بازی‌ها وارد نشده!" : "Game IDs not set!"}
              </p>
              <p className="text-sm text-gray-400">{t.auth.gameIdsDesc}</p>
            </div>
            <Link href="/profile/edit" className="gaming-btn text-sm whitespace-nowrap">
              {lang === "fa" ? "وارد کردن" : "Add Now"}
            </Link>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="gaming-card p-5 text-center">
            <div className="text-3xl mb-2">⭐</div>
            <div className="text-2xl font-bold text-neon-blue">{data.rating}</div>
            <div className="text-xs text-gray-500 mt-1">{t.playersPage.rating}</div>
          </div>
          <div className="gaming-card p-5 text-center">
            <div className="text-3xl mb-2">🏆</div>
            <div className="text-2xl font-bold text-neon-green">{data.wins}</div>
            <div className="text-xs text-gray-500 mt-1">{lang === "fa" ? "بردها" : "Wins"}</div>
          </div>
          <div className="gaming-card p-5 text-center">
            <div className="text-3xl mb-2">📈</div>
            <div className="text-2xl font-bold text-neon-purple">{winRate}%</div>
            <div className="text-xs text-gray-500 mt-1">{lang === "fa" ? "درصد برد" : "Win Rate"}</div>
          </div>
          <div className="gaming-card p-5 text-center relative">
            <div className="text-3xl mb-2">🔔</div>
            <div className="text-2xl font-bold text-neon-orange">{data.unreadNotifications}</div>
            <div className="text-xs text-gray-500 mt-1">{t.notif.title}</div>
            {data.unreadNotifications > 0 && (
              <span className="absolute top-2 end-2 w-3 h-3 rounded-full bg-neon-pink animate-neon-pulse" />
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <h2 className="text-lg font-bold mb-4 neon-text-blue">
          {lang === "fa" ? "⚡ دسترسی سریع" : "⚡ Quick Actions"}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
          {[
            { href: "/tournaments/create", icon: "🏆", label: lang === "fa" ? "ساخت تورنومنت" : "Create Tournament" },
            { href: "/tournaments", icon: "🎮", label: lang === "fa" ? "تورنومنت‌ها" : "Tournaments" },
            { href: "/judging", icon: "⚖️", label: lang === "fa" ? "داوری" : "Judging" },
            { href: "/chat", icon: "💬", label: lang === "fa" ? "چت" : "Chat" },
            { href: "/leaderboard", icon: "📊", label: lang === "fa" ? "رتبه‌بندی" : "Leaderboard" },
            { href: "/teams", icon: "🛡️", label: lang === "fa" ? "تیم‌ها" : "Teams" },
            { href: "/achievements", icon: "🏅", label: lang === "fa" ? "دستاوردها" : "Achievements" },
            { href: "/profile/edit", icon: "⚙️", label: lang === "fa" ? "تنظیمات" : "Settings" },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="gaming-card p-4 flex flex-col items-center gap-2 group text-center"
            >
              <span className="text-3xl group-hover:scale-110 transition-transform">{action.icon}</span>
              <span className="text-sm font-medium group-hover:text-neon-blue transition-colors">
                {action.label}
              </span>
            </Link>
          ))}
        </div>

        {/* Game IDs Status */}
        <h2 className="text-lg font-bold mb-4 neon-text-purple">
          {lang === "fa" ? "🎮 وضعیت آیدی بازی‌ها" : "🎮 Game ID Status"}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              game: lang === "fa" ? "کلش رویال" : "Clash Royale",
              icon: "⚔️",
              id: user.clashRoyaleId,
              name: user.clashRoyaleUsername,
              color: "neon-blue",
            },
            {
              game: lang === "fa" ? "کالاف موبایل" : "COD Mobile",
              icon: "🎯",
              id: user.codMobileId,
              name: user.codMobileUsername,
              color: "neon-orange",
            },
            {
              game: lang === "fa" ? "فورتنایت" : "Fortnite",
              icon: "🏗️",
              id: user.fortniteId,
              name: user.fortniteUsername,
              color: "neon-purple",
            },
          ].map((g) => (
            <div
              key={g.game}
              className={`gaming-card p-4 ${g.id ? `border-${g.color}/30` : "opacity-60"}`}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{g.icon}</span>
                <span className="font-bold text-sm">{g.game}</span>
                <span className={`ms-auto text-xs ${g.id ? "text-neon-green" : "text-neon-pink"}`}>
                  {g.id ? "✓ " + (lang === "fa" ? "متصل" : "Connected") : "✕ " + (lang === "fa" ? "وارد نشده" : "Not set")}
                </span>
              </div>
              {g.id ? (
                <div className="text-xs text-gray-400">
                  <span className="font-mono">{g.id}</span>
                  {g.name && <span className="block mt-0.5">{g.name}</span>}
                </div>
              ) : (
                <Link href="/profile/edit" className="text-xs text-neon-blue hover:underline">
                  {lang === "fa" ? "وارد کردن آیدی →" : "Add game ID →"}
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
