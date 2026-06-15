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
        <section className="gaming-card p-6 sm:p-8 mb-8 overflow-hidden relative border-neon-purple/20">
          <div className="absolute -top-16 -left-16 w-56 h-56 rounded-full bg-purple-600/20 blur-3xl animate-float-slow" />
          <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <p className="text-xs text-purple-300 font-black mb-2">FLEXA DASHBOARD</p>
              <h1 className="text-3xl sm:text-4xl font-black">سلام {user.displayName}! 👋</h1>
              <p className="text-gray-400 mt-2">شناسه فلکسا: <span className="text-neon-purple font-black" dir="ltr">{user.flexaId}</span></p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 min-w-full lg:min-w-[520px]">
              <div className="bg-dark-700/70 rounded-2xl p-4"><div className="text-xs text-gray-500">رتبه</div><div className="text-2xl font-black text-neon-blue">{data?.stats.rating.toLocaleString("fa-IR")}</div></div>
              <div className="bg-dark-700/70 rounded-2xl p-4"><div className="text-xs text-gray-500">برد</div><div className="text-2xl font-black text-neon-green">{data?.stats.wins.toLocaleString("fa-IR")}</div></div>
              <div className="bg-dark-700/70 rounded-2xl p-4"><div className="text-xs text-gray-500">Win Rate</div><div className="text-2xl font-black text-neon-purple">{data?.stats.winRate}%</div></div>
              <div className="bg-dark-700/70 rounded-2xl p-4"><div className="text-xs text-gray-500">کیف پول</div><div className="text-2xl font-black text-neon-yellow">{(data?.wallet.balanceToman || 0).toLocaleString("fa-IR")}</div></div>
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

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: "🏆", label: "تورنومنت‌های من", value: data?.stats.myTournaments, href: "/tournaments" },
            { icon: "⚔️", label: "مسابقات پیش‌رو", value: data?.stats.upcomingMatches, href: nextMatch ? `/tournaments/${nextMatch.tournamentId}` : "/tournaments" },
            { icon: "🔔", label: "اعلان خوانده‌نشده", value: data?.stats.unreadNotifications, href: "/notifications" },
            { icon: "🎧", label: "تیکت باز", value: data?.stats.openTickets, href: "/support" },
          ].map((card) => (
            <Link key={card.label} href={card.href} className="gaming-card p-5 group hover:border-neon-purple/40">
              <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">{card.icon}</div>
              <div className="text-2xl font-black text-white">{Number(card.value || 0).toLocaleString("fa-IR")}</div>
              <div className="text-xs text-gray-500 mt-1">{card.label}</div>
            </Link>
          ))}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="gaming-card p-6">
            <div className="flex items-center justify-between mb-5"><h2 className="font-black text-neon-blue">🎯 قدم بعدی</h2><button onClick={loadDashboard} className="text-xs text-gray-400">🔄</button></div>
            {nextMatch ? (
              <div className="bg-dark-700 rounded-2xl p-4">
                <div className="font-black">{nextMatch.tournamentName || "مسابقه"}</div>
                <div className="text-sm text-gray-400 mt-2">حریف: {nextMatch.opponent?.displayName || "TBD"} • وضعیت: {statusFa(nextMatch.status)}</div>
                <div className="flex gap-2 mt-4"><Link href={`/tournaments/${nextMatch.tournamentId}`} className="gaming-btn text-xs">جزئیات</Link><Link href={`/tournaments/${nextMatch.tournamentId}/lobby`} className="px-4 py-3 rounded-xl bg-dark-600 text-xs font-bold">لابی</Link></div>
              </div>
            ) : activeTournament ? (
              <div className="bg-dark-700 rounded-2xl p-4"><div className="font-black">{activeTournament.tournamentName || "تورنومنت فعال"}</div><p className="text-sm text-gray-400 mt-2">برای ورود به لابی یا مشاهده وضعیت، تورنومنت را باز کن.</p><Link href={`/tournaments/${activeTournament.tournamentId}`} className="gaming-btn text-xs mt-4">باز کردن</Link></div>
            ) : (
              <div className="text-center text-gray-500 py-8">فعلاً مسابقه یا تورنومنت فعالی نداری.</div>
            )}
          </div>

          <div className="gaming-card p-6">
            <h2 className="font-black text-neon-purple mb-5">⚡ دسترسی سریع</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                ...(isAdmin ? [{ href: "/tournaments/create", icon: "🏆", label: "ساخت تورنومنت" }] : []),
                { href: "/tournaments", icon: "🎮", label: "تورنومنت‌ها" },
                { href: "/wallet", icon: "💳", label: "کیف پول" },
                { href: "/support", icon: "🎧", label: "پشتیبانی" },
                { href: "/chat", icon: "💬", label: "چت" },
                { href: "/leaderboard", icon: "📊", label: "رتبه‌بندی" },
                { href: "/profile/edit", icon: "⚙️", label: "آیدی بازی‌ها" },
              ].map((action) => (
                <Link key={action.href} href={action.href} className="bg-dark-700 rounded-2xl p-4 text-center hover:bg-dark-600 transition-colors">
                  <div className="text-2xl mb-2">{action.icon}</div><div className="text-xs font-bold">{action.label}</div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="gaming-card p-6 lg:col-span-2">
            <h2 className="font-black text-neon-green mb-5">🏆 تورنومنت‌های اخیر من</h2>
            {data?.tournaments.length ? <div className="space-y-3">{data.tournaments.slice(0, 6).map((tournament) => <Link key={tournament.registrationId} href={`/tournaments/${tournament.tournamentId}`} className="block bg-dark-700 rounded-2xl p-4 hover:bg-dark-600"><div className="font-bold">{tournament.tournamentName || "—"}</div><div className="text-xs text-gray-500 mt-1">{tournament.game} • {statusFa(tournament.status)} • {tournament.checkedInAt ? "حضور تأیید شده" : "بدون check-in"}</div></Link>)}</div> : <p className="text-gray-500 text-sm">هنوز در تورنومنتی ثبت‌نام نکرده‌ای.</p>}
          </div>
          <div className="gaming-card p-6">
            <h2 className="font-black text-neon-yellow mb-5">💳 تراکنش‌های اخیر</h2>
            {data?.transactions.length ? <div className="space-y-3">{data.transactions.slice(0, 6).map((tx) => <Link key={tx.id} href="/wallet" className="block bg-dark-700 rounded-xl p-3"><div className="flex justify-between gap-2"><span className="text-sm">{transactionLabel(tx.type)}</span><span className="font-black text-neon-green text-sm">{tx.amountToman.toLocaleString("fa-IR")}</span></div><div className="text-xs text-gray-500 mt-1">{statusFa(tx.status)} • {new Date(tx.createdAt).toLocaleDateString("fa-IR")}</div></Link>)}</div> : <p className="text-gray-500 text-sm">تراکنشی نداری.</p>}
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
