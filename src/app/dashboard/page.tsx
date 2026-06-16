"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

interface DashboardData {
  user: { id: string; displayName: string; username: string | null; flexaId: string; level: number; xp: number; rankPoints: number };
  player: { id: string; rating: number; wins: number; losses: number } | null;
  stats: {
    rating: number;
    wins: number;
    losses: number;
    winRate: number;
    myTournaments: number;
    upcomingMatches: number;
    unreadNotifications: number;
    openTickets: number;
  };
  wallet: { balanceToman: number; balanceRial: string };
  tournaments: Array<{ registrationId: string; tournamentId: string; tournamentName: string | null; game: string | null; status: string | null; startDate: string | null; checkedInAt: string | null; bannerUrl: string | null }>;
  matches: Array<{ id: string; tournamentId: string; tournamentName: string | null; opponent: { displayName: string; username: string; rating: number } | null; status: string; round: number; matchNumber: number; player1Score: number | null; player2Score: number | null; scheduledAt: string | null; createdAt: string }>;
  transactions: Array<{ id: string; type: string; status: string; amountToman: number; createdAt: string }>;
  tickets: Array<{ id: string; subject: string; status: string; createdAt: string }>;
  recentActivity: Array<{ type: string; icon: string; title: string; description: string; link: string | null; time: string }>;
}

function statusFa(status: string | null | undefined) {
  const map: Record<string, string> = {
    registration: "ثبت‌نام",
    in_progress: "در جریان",
    completed: "تکمیل‌شده",
    cancelled: "لغوشده",
    pending: "در انتظار",
    awaiting_judgment: "در انتظار داوری",
    disputed: "اعتراض‌شده",
    open: "باز",
    closed: "بسته",
    resolved: "حل‌شده",
  };
  return status ? map[status] || status : "—";
}

function transactionLabel(type: string) {
  const map: Record<string, string> = {
    deposit: "شارژ کیف پول",
    withdrawal: "برداشت",
    entry_fee: "ورودی تورنومنت",
    refund: "برگشت وجه",
    tournament_win: "جایزه تورنومنت",
  };
  return map[type] || type;
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store", credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "داشبورد بارگذاری نشد");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "داشبورد بارگذاری نشد");
    } finally {
      setBusy(false);
    }
  }, [user]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (user) loadDashboard();
  }, [user, loadDashboard]);

  const nextMatch = useMemo(() => data?.matches.find((m) => m.status !== "completed") || null, [data]);
  const activeTournament = useMemo(() => data?.tournaments.find((t) => t.status === "registration" || t.status === "in_progress") || null, [data]);

  if (loading || busy || !user) {
    return (
      <div className="min-h-screen bg-dark-900">
        <Navbar />
        <div className="flex items-center justify-center py-32"><div className="text-4xl animate-neon-pulse">⚡</div></div>
      </div>
    );
  }

  const hasGameIds = user.clashRoyaleId || user.codMobileId || user.fortniteId;

  return (
    <div className="min-h-screen bg-[#050508] text-white relative overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_-10%,rgba(92,0,160,.55),transparent_70%)]" />
      <Navbar />

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <section className="glass-panel p-7 sm:p-8 mb-8 relative overflow-hidden border-purple-500/20">
          <div className="absolute -top-20 -left-20 w-64 h-64 bg-purple-600/20 rounded-full blur-[90px]" />
          
          <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            <div>
              <div className="text-xs font-black tracking-[2px] text-purple-400 mb-1">FLEXA DASHBOARD</div>
              <h1 className="text-4xl font-black">سلام، {user.displayName} 👋</h1>
              <p className="text-sm text-gray-400 mt-1">شناسه شما: <span className="font-mono text-purple-400">{user.flexaId}</span></p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
              {[
                { label: "رتبه", value: data?.stats.rating, color: "text-cyan-400" },
                { label: "برد", value: data?.stats.wins, color: "text-emerald-400" },
                { label: "Win Rate", value: `${data?.stats.winRate}%`, color: "text-purple-400" },
                { label: "کیف پول", value: data?.wallet.balanceToman?.toLocaleString("fa-IR"), color: "text-yellow-400" },
              ].map((stat, i) => (
                <div key={i} className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3.5">
                  <div className="text-[10px] text-gray-500 mb-0.5">{stat.label}</div>
                  <div className={`text-2xl font-black ${stat.color}`}>{stat.value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 mb-5 text-sm">{error}</div>}

        {!hasGameIds && (
          <div className="bg-neon-orange/10 border border-neon-orange/40 rounded-xl p-4 mb-6 flex items-center gap-4 animate-slide-up">
            <span className="text-3xl">⚠️</span>
            <div className="flex-1"><p className="font-bold text-neon-orange">آیدی بازی‌ها وارد نشده!</p><p className="text-sm text-gray-400">برای دریافت جایزه و شرکت راحت‌تر، آیدی بازی‌ها را کامل کن.</p></div>
            <Link href="/profile/edit" className="gaming-btn text-sm whitespace-nowrap">وارد کردن</Link>
          </div>
        )}

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {[
            { icon: "🏆", label: "تورنومنت‌های من", value: data?.stats.myTournaments, href: "/tournaments" },
            { icon: "⚔️", label: "مسابقات پیش‌رو", value: data?.stats.upcomingMatches, href: nextMatch ? `/tournaments/${nextMatch.tournamentId}` : "/tournaments" },
            { icon: "🔔", label: "اعلان خوانده‌نشده", value: data?.stats.unreadNotifications, href: "/notifications" },
            { icon: "🎧", label: "تیکت باز", value: data?.stats.openTickets, href: "/support" },
          ].map((card, index) => (
            <Link key={index} href={card.href} className="glass-panel p-5 active:scale-[0.985] transition-all border border-white/10 hover:border-purple-500/30">
              <div className="text-3xl mb-3 opacity-90">{card.icon}</div>
              <div className="text-3xl font-black tracking-tight">{Number(card.value || 0).toLocaleString("fa-IR")}</div>
              <div className="text-xs text-gray-400 mt-1">{card.label}</div>
            </Link>
          ))}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          {/* قدم بعدی */}
          <div className="glass-panel p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-black text-lg">🎯 قدم بعدی</h2>
              <button onClick={loadDashboard} className="text-xs px-3 py-1 rounded-lg bg-white/5 active:bg-white/10">بروزرسانی</button>
            </div>
            
            {nextMatch ? (
              <div className="bg-[#111114] rounded-2xl p-5">
                <div className="font-black mb-1">{nextMatch.tournamentName}</div>
                <div className="text-sm text-gray-400">حریف: {nextMatch.opponent?.displayName || "نامشخص"}</div>
                <div className="flex gap-2 mt-4">
                  <Link href={`/tournaments/${nextMatch.tournamentId}`} className="flex-1 bg-purple-600 py-3 rounded-xl text-sm font-black text-center">جزئیات</Link>
                  <Link href={`/tournaments/${nextMatch.tournamentId}/lobby`} className="flex-1 bg-white/10 py-3 rounded-xl text-sm font-black text-center">لابی</Link>
                </div>
              </div>
            ) : activeTournament ? (
              <div className="bg-[#111114] rounded-2xl p-5">
                <div className="font-black">{activeTournament.tournamentName}</div>
                <p className="text-sm text-gray-400 mt-1">تورنومنت فعال داری</p>
                <Link href={`/tournaments/${activeTournament.tournamentId}`} className="gaming-btn text-sm mt-4 block text-center">باز کردن</Link>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm">فعلاً مسابقه یا تورنومنت فعالی نداری</div>
            )}
          </div>

          {/* دسترسی سریع */}
          <div className="glass-panel p-6">
            <h2 className="font-black text-lg mb-5">⚡ دسترسی سریع</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {[
                ...(isAdmin ? [{ href: "/tournaments/create", icon: "🏆", label: "ساخت" }] : []),
                { href: "/tournaments", icon: "🎮", label: "تورنومنت" },
                { href: "/wallet", icon: "💳", label: "کیف پول" },
                { href: "/support", icon: "🎧", label: "پشتیبانی" },
                { href: "/chat", icon: "💬", label: "چت" },
                { href: "/leaderboard", icon: "📊", label: "رتبه‌ها" },
                { href: "/profile/edit", icon: "⚙️", label: "آیدی‌ها" },
              ].map((action, i) => (
                <Link key={i} href={action.href} className="bg-[#111114] hover:bg-[#1a1a1f] active:bg-purple-900/30 transition-colors rounded-2xl p-4 text-center border border-white/5">
                  <div className="text-2xl mb-1.5">{action.icon}</div>
                  <div className="text-xs font-bold text-gray-300">{action.label}</div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* تورنومنت‌های اخیر */}
          <div className="glass-panel p-6 lg:col-span-2">
            <h2 className="font-black mb-4">🏆 تورنومنت‌های اخیر من</h2>
            {data?.tournaments.length ? (
              <div className="space-y-2.5">
                {data.tournaments.slice(0, 5).map((t) => (
                  <Link key={t.registrationId} href={`/tournaments/${t.tournamentId}`} className="flex items-center justify-between bg-[#111114] rounded-2xl px-5 py-4 active:bg-white/5">
                    <div>
                      <div className="font-bold text-sm">{t.tournamentName}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{t.game} • {statusFa(t.status)}</div>
                    </div>
                    <span className="text-xs text-purple-400">جزئیات ←</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-4">هنوز در تورنومنتی ثبت‌نام نکرده‌ای.</p>
            )}
          </div>

          {/* تراکنش‌های اخیر */}
          <div className="glass-panel p-6">
            <h2 className="font-black mb-4">💳 تراکنش‌های اخیر</h2>
            {data?.transactions.length ? (
              <div className="space-y-2">
                {data.transactions.slice(0, 5).map((tx) => (
                  <Link key={tx.id} href="/wallet" className="flex justify-between items-center bg-[#111114] rounded-2xl px-4 py-3 text-sm active:bg-white/5">
                    <div>
                      <div>{transactionLabel(tx.type)}</div>
                      <div className="text-xs text-gray-500">{new Date(tx.createdAt).toLocaleDateString("fa-IR")}</div>
                    </div>
                    <div className="font-black num-en text-emerald-400">{tx.amountToman.toLocaleString("fa-IR")}</div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-4">تراکنشی نداری.</p>
            )}
          </div>
        </section>

        <section className="gaming-card p-6 mt-6">
          <h2 className="font-black text-neon-blue mb-5">🧭 فعالیت‌های اخیر</h2>
          {data?.recentActivity.length ? <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{data.recentActivity.map((activity, index) => <Link key={`${activity.type}-${index}`} href={activity.link || "#"} className="bg-dark-700 rounded-2xl p-4 hover:bg-dark-600"><div className="flex items-start gap-3"><span className="text-2xl">{activity.icon}</span><div><div className="font-bold text-sm">{activity.title}</div><div className="text-xs text-gray-500 mt-1 line-clamp-2">{activity.description}</div><div className="text-[10px] text-gray-600 mt-2">{new Date(activity.time).toLocaleString("fa-IR")}</div></div></div></Link>)}</div> : <p className="text-gray-500 text-sm">فعلاً فعالیتی ثبت نشده.</p>}
        </section>
      </main>
    </div>
  );
}
