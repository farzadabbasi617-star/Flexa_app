"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

interface Stats {
  users: number;
  players: number;
  tournaments: number;
  matches: number;
  completedMatches: number;
  disputes: number;
  chatMessages: number;
  totalJudgments: number;
  aiJudgments: number;
}

export default function AdminPage() {
  const { lang } = useLanguage();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const L = (fa: string, en: string) => lang === "fa" ? fa : en;

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stats");
      if (res.ok) setStats(await res.json());
    } catch { /* ignore */ }
    setLoadingStats(false);
  }, []);

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) router.push("/");
  }, [loading, user, router]);

  useEffect(() => {
    if (user?.role === "admin") fetchStats();
  }, [user, fetchStats]);

  if (loading || !user || user.role !== "admin") {
    return (
      <div className="min-h-screen bg-dark-900">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="text-5xl mb-4">🔒</div>
        </div>
      </div>
    );
  }

  const statCards = stats ? [
    { icon: "👥", label: L("کاربران", "Users"), value: stats.users, color: "text-neon-blue" },
    { icon: "🏆", label: L("تورنومنت‌ها", "Tournaments"), value: stats.tournaments, color: "text-neon-purple" },
    { icon: "⚔️", label: L("مسابقات", "Matches"), value: stats.matches, color: "text-neon-orange" },
    { icon: "✅", label: L("تکمیل شده", "Completed"), value: stats.completedMatches, color: "text-neon-green" },
    { icon: "🤖", label: L("داوری AI", "AI Judgments"), value: stats.aiJudgments, color: "text-neon-blue" },
    { icon: "⚖️", label: L("کل داوری‌ها", "Total Judgments"), value: stats.totalJudgments, color: "text-neon-purple" },
    { icon: "⚠️", label: L("اعتراضات", "Disputes"), value: stats.disputes, color: "text-neon-pink" },
    { icon: "💬", label: L("پیام‌ها", "Messages"), value: stats.chatMessages, color: "text-gray-400" },
  ] : [];

  const menuSections = [
    {
      title: L("📊 مدیریت محتوا", "📊 Content Management"),
      items: [
        { href: "/admin/images", icon: "🖼️", title: L("مدیریت تصاویر", "Image Manager"), desc: L("تصاویر بازی‌ها، بنر، هیرو و ...", "Game images, banners, hero..."), color: "from-blue-600 to-cyan-500" },
        { href: "/admin/customize", icon: "🎨", title: L("شخصی‌سازی ظاهر", "Customize UI"), desc: L("رنگ، آیکون، فونت، چینش، تم", "Colors, icons, fonts, layout, theme"), color: "from-purple-600 to-pink-500" },
        { href: "/admin/settings", icon: "⚙️", title: L("تنظیمات سایت", "Site Settings"), desc: L("عنوان، تماس، AI، سیستم", "Title, contact, AI, system"), color: "from-orange-600 to-red-500" },
      ],
    },
    {
      title: L("👥 مدیریت کاربران", "👥 User Management"),
      items: [
        { href: "/admin/users", icon: "👥", title: L("کاربران", "Users"), desc: L("نقش‌ها، تأیید، جستجو", "Roles, verification, search"), color: "from-green-600 to-teal-500" },
        { href: "/players", icon: "🎮", title: L("بازیکنان", "Players"), desc: L("آمار و اطلاعات بازیکنان", "Player stats and info"), color: "from-yellow-600 to-orange-500" },
      ],
    },
    {
      title: L("🏆 مدیریت مسابقات", "🏆 Tournament Management"),
      items: [
        { href: "/tournaments/create", icon: "🏆", title: L("ساخت تورنومنت", "Create Tournament"), desc: L("تورنومنت جدید بساز", "Create a new tournament"), color: "from-indigo-600 to-purple-500" },
        { href: "/tournaments", icon: "📋", title: L("لیست تورنومنت‌ها", "Tournament List"), desc: L("مشاهده و مدیریت تورنومنت‌ها", "View and manage tournaments"), color: "from-cyan-600 to-blue-500" },
        { href: "/judging", icon: "⚖️", title: L("داوری مسابقات", "Match Judging"), desc: L("داوری دستی مسابقات", "Manual match judging"), color: "from-pink-600 to-rose-500" },
      ],
    },
    {
      title: L("🤖 هوش مصنوعی", "🤖 Artificial Intelligence"),
      items: [
        { href: "/admin/ai", icon: "🤖", title: L("پنل AI", "AI Panel"), desc: L("داوری، مدریشن، تحلیل", "Judging, moderation, analysis"), color: "from-violet-600 to-fuchsia-500" },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-neon-pink to-neon-orange flex items-center justify-center text-3xl shadow-lg shadow-neon-pink/20">
            👑
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">{L("پنل مدیریت", "Admin Panel")}</h1>
            <p className="text-gray-500 text-sm">{L(`سلام ${user.displayName}! 👋`, `Hey ${user.displayName}! 👋`)}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {loadingStats
            ? Array(8).fill(0).map((_, i) => (
                <div key={i} className="gaming-card p-5 animate-pulse"><div className="h-12 bg-dark-600 rounded" /></div>
              ))
            : statCards.map((s) => (
                <div key={s.label} className="gaming-card p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{s.icon}</span>
                    <div>
                      <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                      <div className="text-xs text-gray-500">{s.label}</div>
                    </div>
                  </div>
                </div>
              ))}
        </div>

        {/* Menu Sections */}
        {menuSections.map((section) => (
          <div key={section.title} className="mb-8">
            <h2 className="text-lg font-bold mb-4 text-gray-300">{section.title}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {section.items.map((item) => (
                <Link key={item.href} href={item.href} className="gaming-card p-5 flex items-center gap-4 group hover:border-neon-purple/50 transition-all">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center text-2xl flex-shrink-0 group-hover:scale-110 transition-transform`}>
                    {item.icon}
                  </div>
                  <div>
                    <h3 className="font-bold group-hover:text-neon-blue transition-colors">{item.title}</h3>
                    <p className="text-xs text-gray-500">{item.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
