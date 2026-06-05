"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, setLang, t } = useLanguage();
  const { user, loading, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const isAdmin = user?.role === "admin";

  const navItems = [
    { href: "/", label: t.nav.home, icon: "🏠" },
    { href: "/tournaments", label: t.nav.tournaments, icon: "🏆" },
    { href: "/leaderboard", label: t.nav.leaderboard, icon: "📊" },
    { href: "/judging", label: t.nav.judging, icon: "⚖️" },
    { href: "/teams", label: t.teamsPage.title, icon: "🛡️" },
    { href: "/achievements", label: t.achievementsPage.title, icon: "🏅" },
  ];

  // Admin-only nav item
  if (isAdmin) {
    navItems.push({ href: "/admin", label: lang === "fa" ? "پنل مدیریت" : "Admin", icon: "👑" });
  }

  async function handleLogout() {
    await logout();
    setShowUserMenu(false);
    router.push("/");
  }

  return (
    <nav className="sticky top-0 z-50 bg-dark-800/90 backdrop-blur-md border-b border-gaming-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-3xl">⚡</span>
            <span className="text-xl font-bold bg-gradient-to-r from-neon-blue via-neon-purple to-neon-pink bg-clip-text text-transparent">
              Flexa
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? item.href === "/admin" ? "bg-neon-pink/20 text-neon-pink" : "bg-neon-purple/20 text-neon-purple"
                      : "text-gray-400 hover:text-white hover:bg-dark-600"
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {/* Language */}
            <div className="flex items-center gap-1 ms-2 border-s border-gaming-border ps-3">
              <button onClick={() => setLang("en")} className={`px-2 py-1 rounded text-xs font-bold transition-all ${lang === "en" ? "bg-neon-blue/20 text-neon-blue" : "text-gray-500 hover:text-white"}`}>EN</button>
              <button onClick={() => setLang("fa")} className={`px-2 py-1 rounded text-xs font-bold transition-all ${lang === "fa" ? "bg-neon-blue/20 text-neon-blue" : "text-gray-500 hover:text-white"}`}>فا</button>
            </div>

            {/* User */}
            <div className="ms-3 border-s border-gaming-border ps-3">
              {loading ? (
                <div className="w-8 h-8 rounded-full bg-dark-600 animate-pulse" />
              ) : user ? (
                <div className="relative">
                  <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-600 hover:bg-dark-500 transition-all">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${isAdmin ? "bg-gradient-to-br from-neon-pink to-neon-orange" : "bg-gradient-to-br from-neon-purple to-neon-blue"}`}>
                      {isAdmin ? "👑" : user.displayName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium hidden xl:block">{user.displayName}</span>
                    <span className="text-gray-500 text-xs">▼</span>
                  </button>

                  {showUserMenu && (
                    <div className="absolute end-0 mt-2 w-52 bg-dark-700 border border-gaming-border rounded-lg shadow-xl py-1 z-50">
                      <Link href="/dashboard" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-dark-600" onClick={() => setShowUserMenu(false)}>
                        📊 {lang === "fa" ? "داشبورد" : "Dashboard"}
                      </Link>
                      <Link href="/profile" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-dark-600" onClick={() => setShowUserMenu(false)}>
                        👤 {t.auth.profile}
                      </Link>
                      <Link href="/profile/edit" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-dark-600" onClick={() => setShowUserMenu(false)}>
                        🎮 {t.auth.gameIds}
                      </Link>
                      <Link href="/notifications" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-dark-600" onClick={() => setShowUserMenu(false)}>
                        🔔 {t.notif.title}
                      </Link>
                      <Link href="/chat" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-dark-600" onClick={() => setShowUserMenu(false)}>
                        💬 {t.chat.title}
                      </Link>

                      {/* Admin section in dropdown too */}
                      {isAdmin && (
                        <>
                          <hr className="border-gaming-border my-1" />
                          <div className="px-4 py-1">
                            <span className="text-xs text-neon-pink font-bold">👑 {lang === "fa" ? "مدیریت" : "Admin"}</span>
                          </div>
                          <Link href="/admin" className="flex items-center gap-2 px-4 py-2 text-sm text-neon-pink hover:bg-dark-600" onClick={() => setShowUserMenu(false)}>
                            📊 {lang === "fa" ? "داشبورد مدیریت" : "Admin Dashboard"}
                          </Link>
                          <Link href="/admin/images" className="flex items-center gap-2 px-4 py-2 text-sm text-neon-pink hover:bg-dark-600" onClick={() => setShowUserMenu(false)}>
                            🖼️ {lang === "fa" ? "تصاویر" : "Images"}
                          </Link>
                          <Link href="/admin/users" className="flex items-center gap-2 px-4 py-2 text-sm text-neon-pink hover:bg-dark-600" onClick={() => setShowUserMenu(false)}>
                            👥 {lang === "fa" ? "کاربران" : "Users"}
                          </Link>
                          <Link href="/admin/settings" className="flex items-center gap-2 px-4 py-2 text-sm text-neon-pink hover:bg-dark-600" onClick={() => setShowUserMenu(false)}>
                            ⚙️ {lang === "fa" ? "تنظیمات" : "Settings"}
                          </Link>
                          <Link href="/admin/customize" className="flex items-center gap-2 px-4 py-2 text-sm text-neon-pink hover:bg-dark-600" onClick={() => setShowUserMenu(false)}>
                            🎨 {lang === "fa" ? "شخصی‌سازی ظاهر" : "Customize UI"}
                          </Link>
                          <Link href="/admin/ai" className="flex items-center gap-2 px-4 py-2 text-sm text-neon-pink hover:bg-dark-600" onClick={() => setShowUserMenu(false)}>
                            🤖 {lang === "fa" ? "هوش مصنوعی" : "AI"}
                          </Link>
                        </>
                      )}

                      <hr className="border-gaming-border my-1" />
                      <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-dark-600 w-full text-start">
                        🚪 {t.auth.logout}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link href="/login" className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white transition-all">{t.auth.login}</Link>
                  <Link href="/register" className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neon-purple/20 text-neon-purple hover:bg-neon-purple/30 transition-all">{t.auth.register}</Link>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Nav */}
          <div className="lg:hidden flex items-center gap-1.5">
            {navItems.slice(0, 4).map((item) => {
              const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} className={`text-lg p-1.5 rounded-lg transition-all ${isActive ? "bg-neon-purple/20" : "hover:bg-dark-600"}`} title={item.label}>
                  {item.icon}
                </Link>
              );
            })}
            {isAdmin && (
              <Link href="/admin" className={`text-lg p-1.5 rounded-lg transition-all ${pathname.startsWith("/admin") ? "bg-neon-pink/20" : "hover:bg-dark-600"}`} title="Admin">
                👑
              </Link>
            )}
            <button onClick={() => setLang(lang === "en" ? "fa" : "en")} className="text-xs font-bold px-2 py-1 rounded bg-dark-600 text-gray-300">
              {lang === "en" ? "فا" : "EN"}
            </button>
            {user ? (
              <Link href="/dashboard" className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isAdmin ? "bg-gradient-to-br from-neon-pink to-neon-orange" : "bg-gradient-to-br from-neon-purple to-neon-blue"}`}>
                {isAdmin ? "👑" : user.displayName.charAt(0).toUpperCase()}
              </Link>
            ) : (
              <Link href="/login" className="text-lg p-1.5 rounded-lg hover:bg-dark-600">👤</Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
