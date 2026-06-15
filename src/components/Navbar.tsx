"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, t } = useLanguage();
  const { user, loading, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const navItems = [
    { href: "/", label: t.nav.home, icon: "🏠" },
    { href: "/tournaments", label: t.nav.tournaments, icon: "🏆" },
    { href: "/leaderboard", label: t.nav.leaderboard, icon: "📊" },
    { href: "/judging", label: t.nav.judging, icon: "⚖️" },
    { href: "/teams", label: t.teamsPage.title, icon: "🛡️" },
    { href: "/achievements", label: t.achievementsPage.title, icon: "🏅" },
  ];

  if (isAdmin) {
    navItems.push({ href: "/admin", label: lang === "fa" ? "پنل مدیریت" : "Admin", icon: "👑" });
  }

  async function handleLogout() {
    await logout();
    setShowUserMenu(false);
    router.push("/");
  }

  return (
    <nav className="sticky top-0 z-50 bg-dark-950/80 backdrop-blur-xl border-b border-gaming-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 bg-neon-purple rounded-xl flex items-center justify-center shadow-lg shadow-neon-purple/30 group-hover:scale-110 transition-transform">
              <span className="text-2xl">⚡</span>
            </div>
            <span className="text-2xl font-black tracking-tighter text-white">
              فلکسا<span className="text-neon-purple"> گیمینگ</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-2">
            {navItems.map((item) => {
              const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${
                    isActive
                      ? "bg-neon-purple text-white shadow-lg shadow-neon-purple/40"
                      : "text-gray-400 hover:text-white hover:bg-dark-800"
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {/* User/Auth */}
            <div className="ms-4 border-s border-gaming-border ps-4">
              {loading ? (
                <div className="w-10 h-10 rounded-full bg-dark-800 animate-pulse" />
              ) : user ? (
                <div className="relative">
                  <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-dark-800 hover:bg-dark-700 transition-all border border-gaming-border">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isAdmin ? "bg-gradient-to-br from-neon-pink to-neon-orange" : "bg-gradient-to-br from-neon-purple to-neon-blue"}`}>
                      {isAdmin ? "👑" : user.displayName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-bold hidden xl:block">{user.displayName}</span>
                    <span className="text-gray-500 text-[10px]">▼</span>
                  </button>

                  {showUserMenu && (
                    <div className="absolute end-0 mt-3 w-60 bg-dark-900 border border-gaming-border rounded-2xl shadow-2xl py-2 z-50 overflow-hidden">
                      <div className="px-4 py-3 bg-dark-800/50 border-b border-gaming-border">
                        <p className="text-xs text-gray-400">{lang === "fa" ? "حساب کاربری" : "User Account"}</p>
                        <p className="text-sm font-bold text-white truncate">{user.displayName}</p>
                      </div>
                      <div className="p-1">
                        <Link href="/dashboard" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-neon-purple/10 hover:text-neon-purple rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                          <span>📊</span> {lang === "fa" ? "داشبورد" : "Dashboard"}
                        </Link>
                        <Link href="/profile" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-neon-purple/10 hover:text-neon-purple rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                          <span>👤</span> {t.auth.profile}
                        </Link>
                        <Link href="/profile/edit" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-neon-purple/10 hover:text-neon-purple rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                          <span>🎮</span> {t.auth.gameIds}
                        </Link>
                        <Link href="/notifications" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-neon-purple/10 hover:text-neon-purple rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                          <span>🔔</span> {t.notif.title}
                        </Link>
                        <Link href="/chat" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-neon-purple/10 hover:text-neon-purple rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                          <span>💬</span> {t.chat.title}
                        </Link>

                        {isAdmin && (
                          <>
                            <div className="my-2 px-4 py-1">
                              <span className="text-[10px] uppercase tracking-widest text-neon-pink font-black">Admin Panel</span>
                            </div>
                            <Link href="/admin" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>📊</span> {lang === "fa" ? "داشبورد مدیریت" : "Admin Dashboard"}
                            </Link>
                            <Link href="/admin/images" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>🖼️</span> {lang === "fa" ? "تصاویر" : "Images"}
                            </Link>
                            <Link href="/admin/users" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>👥</span> {lang === "fa" ? "کاربران" : "Users"}
                            </Link>
                            <Link href="/admin/settings" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>⚙️</span> {lang === "fa" ? "تنظیمات" : "Settings"}
                            </Link>
                            <Link href="/admin/customize" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>🎨</span> {lang === "fa" ? "شخصی‌سازی ظاهر" : "Customize UI"}
                            </Link>
                            <Link href="/admin/tournaments" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>🏆</span> مدیریت تورنومنت‌ها
                            </Link>
                            <Link href="/admin/matches" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>⚔️</span> مدیریت مسابقات
                            </Link>
                            <Link href="/admin/judgments" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>⚖️</span> مدیریت داوری‌ها
                            </Link>
                            <Link href="/admin/disputes" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>🚨</span> اعتراضات
                            </Link>
                            <Link href="/admin/wallets" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>💳</span> کیف پول و مالی
                            </Link>
                            <Link href="/admin/audit" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>🧾</span> لاگ مدیران
                            </Link>
                            <Link href="/admin/ai" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>🤖</span> {lang === "fa" ? "هوش مصنوعی" : "AI"}
                            </Link>
                          </>
                        )}
                        <div className="mt-2 pt-2 border-t border-gaming-border">
                          <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 rounded-xl transition-all w-full text-start">
                            <span>🚪</span> {t.auth.logout}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Link href="/login" className="px-4 py-2 rounded-full text-sm font-bold text-gray-400 hover:text-white transition-all">{t.auth.login}</Link>
                  <Link href="/register" className="px-5 py-2 rounded-full text-sm font-bold bg-neon-purple text-white shadow-lg shadow-neon-purple/30 hover:bg-neon-purple/80 transition-all">
                    {t.auth.register}
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Nav */}
          <div className="lg:hidden flex items-center gap-1.5">
            {navItems.slice(0, 4).map((item) => {
              const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} className={`text-lg p-2 rounded-xl transition-all ${isActive ? "bg-neon-purple text-white" : "text-gray-400 hover:bg-dark-800"}`} title={item.label}>
                  {item.icon}
                </Link>
              );
            })}
            {user ? (
              <Link href="/dashboard" className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${isAdmin ? "bg-gradient-to-br from-neon-pink to-neon-orange" : "bg-gradient-to-br from-neon-purple to-neon-blue"}`}>
                {isAdmin ? "👑" : user.displayName.charAt(0).toUpperCase()}
              </Link>
            ) : (
              <Link href="/login" className="text-lg p-2 rounded-xl hover:bg-dark-800 text-gray-400">👤</Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
