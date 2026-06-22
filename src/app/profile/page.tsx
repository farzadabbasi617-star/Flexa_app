"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";

interface TelegramLinkAccount {
  telegramId: string;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
  linkedAt: string;
}

interface DashboardData {
  user: { id: string; displayName: string; username: string | null; gamentId: string; level: number; xp: number; rankPoints: number };
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

const AVATAR_OPTIONS = [
  { label: "شوالیه", url: "/icons/profile_icon.png" },
  { label: "گیمنت", url: "/icons/arena_icon.png" },
  { label: "تنظیمات", url: "/icons/settings_icon.png" },
  { label: "رتبه‌ها", url: "/icons/rankings_icon.png" },
  { label: "افتخارات", url: "/icons/honors_icon.png" },
  { label: "کیف پول", url: "/icons/wallet_icon.png" },
  { label: "کلش", url: "/icons/icon-clash_royale.png" },
  { label: "کالاف", url: "/icons/icon-cod_mobile.png" },
  { label: "فورتنایت", url: "/icons/icon-fortnite.png" },
];

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

export default function ProfilePage() {
  const { user, loading, logout, refreshUser } = useAuth();
  const router = useRouter();

  // Dashboard Data
  const [data, setData] = useState<DashboardData | null>(null);
  const [busy, setBusy] = useState(true);
  const [dashboardError, setDashboardError] = useState("");

  // Profile Edit Data
  const [displayName, setDisplayName] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("/icons/profile_icon.png");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  // Telegram Link Data
  const [telegramAccount, setTelegramAccount] = useState<TelegramLinkAccount | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramCode, setTelegramCode] = useState("");
  const [telegramMessage, setTelegramMessage] = useState("");
  const [telegramError, setTelegramError] = useState("");

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setDashboardError("");
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store", credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "اطلاعات حساب بارگذاری نشد");
      setData(json);
    } catch (err) {
      setDashboardError(err instanceof Error ? err.message : "اطلاعات حساب بارگذاری نشد");
    } finally {
      setBusy(false);
    }
  }, [user]);

  async function loadTelegramLink() {
    if (!user) return;
    setTelegramLoading(true);
    try {
      const res = await fetch("/api/telegram/link", { credentials: "include", cache: "no-store" });
      const json = await res.json();
      if (res.ok) setTelegramAccount(json.account || null);
    } catch {
      setTelegramAccount(null);
    }
    setTelegramLoading(false);
  }

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || user.username || "");
      setSelectedAvatar(user.avatarUrl || "/icons/profile_icon.png");
      loadDashboard();
      loadTelegramLink();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const gameIds = useMemo(() => {
    if (!user) return [];
    return [
      {
        label: "کلش رویال",
        icon: "/icons/icon-clash_royale.png",
        id: user.clashRoyaleId,
        username: user.clashRoyaleUsername,
      },
      {
        label: "کالاف موبایل",
        icon: "/icons/icon-cod_mobile.png",
        id: user.codMobileId,
        username: user.codMobileUsername,
      },
      {
        label: "فورتنایت",
        icon: "/icons/icon-fortnite.png",
        id: user.fortniteId,
        username: user.fortniteUsername,
      },
    ];
  }, [user]);

  async function saveProfile(nextAvatar?: string) {
    if (!user) return;
    const avatarUrl = nextAvatar || selectedAvatar;
    setProfileSaving(true);
    setProfileMessage("");
    setProfileError("");
    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
        body: JSON.stringify({ displayName: displayName.trim(), avatarUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "ذخیره پروفایل انجام نشد.");
      setProfileMessage("پروفایل با موفقیت ذخیره شد.");
      await refreshUser();
      // Reload dashboard stats to match updated profile name
      loadDashboard();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "ذخیره پروفایل انجام نشد.");
    }
    setProfileSaving(false);
  }

  async function chooseAvatar(url: string) {
    setSelectedAvatar(url);
    await saveProfile(url);
  }

  async function submitTelegramCode() {
    setTelegramMessage("");
    setTelegramError("");
    const code = telegramCode.replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) {
      setTelegramError("کد اتصال باید ۶ رقم باشد.");
      return;
    }
    setTelegramLoading(true);
    try {
      const res = await fetch("/api/telegram/link", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "اتصال تلگرام انجام نشد.");
      setTelegramMessage("حساب تلگرام با موفقیت لینک شد.");
      setTelegramCode("");
      await loadTelegramLink();
    } catch (err) {
      setTelegramError(err instanceof Error ? err.message : "اتصال تلگرام انجام نشد.");
    }
    setTelegramLoading(false);
  }

  async function unlinkTelegram() {
    if (!confirm("اتصال تلگرام حذف شود؟")) return;
    setTelegramMessage("");
    setTelegramError("");
    setTelegramLoading(true);
    try {
      const res = await fetch("/api/telegram/link", {
        method: "DELETE",
        headers: { "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "حذف اتصال انجام نشد.");
      setTelegramAccount(null);
      setTelegramMessage("اتصال تلگرام حذف شد.");
    } catch (err) {
      setTelegramError(err instanceof Error ? err.message : "حذف اتصال انجام نشد.");
    }
    setTelegramLoading(false);
  }

  const nextMatch = useMemo(() => data?.matches.find((m) => m.status !== "completed") || null, [data]);
  const activeTournament = useMemo(() => data?.tournaments.find((t) => t.status === "registration" || t.status === "in_progress") || null, [data]);

  if (loading || busy || !user) {
    return (
      <div className="min-h-screen bg-[#050508] text-white flex items-center justify-center">
        <div className="text-4xl animate-pulse">⚡</div>
      </div>
    );
  }

  const hasGameIds = user.clashRoyaleId || user.codMobileId || user.fortniteId;

  return (
    <div className="min-h-screen bg-[#050508] text-white relative overflow-x-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,_rgba(92,0,160,.68)_0%,_rgba(32,0,56,.42)_34%,_transparent_72%)]" />
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-purple-700/20 blur-[80px]" />
      </div>

      <div className="relative z-10 max-w-[540px] mx-auto px-5 pb-28">
        
        {/* Header */}
        <header className="pt-10 pb-4 text-right">
          <div className="inline-flex items-center gap-2 text-[10px] font-black text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded-full px-3 py-1 mb-3">
            ⚙️ پروفایل و داشبورد کاربری
          </div>
          <h1 className="text-3xl font-black">پروفایل من</h1>
          <p className="text-xs text-gray-500 mt-1 leading-6">
            ویرایش مشخصات، کیف پول، آمار بازی‌ها و دسترسی‌های سریع
          </p>
        </header>

        {/* Site Errors */}
        {dashboardError && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-2xl p-4 mb-5 text-xs text-right">
            {dashboardError}
          </div>
        )}

        {/* Section 1: Hero Edit Profile */}
        <section className="glass-panel rounded-[38px] p-6 border border-purple-500/20 bg-gradient-to-br from-[#1a0033]/70 to-[#0a0a0c] mb-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="text-right">
              <h2 className="text-xl font-black">{user.displayName} 👋</h2>
              <p className="text-[11px] text-gray-400 mt-1">
                نام کاربری: <span className="font-mono">@{user.username}</span>
              </p>
              <p className="text-[11px] text-purple-300 mt-1 en-font">
                ID: {user.gamentId}
              </p>
            </div>
            <div className="relative">
              <div className="p-1 rounded-full bg-gradient-to-tr from-[#bc00ff] to-[#00d2ff] shadow-[0_0_30px_rgba(188,0,255,0.35)]">
                <img
                  src={selectedAvatar}
                  alt="Avatar"
                  className="w-20 h-20 rounded-full border-4 border-[#050508] object-cover bg-black/40"
                  onError={(e) => ((e.target as HTMLImageElement).src = "/icons/profile_icon.png")}
                />
              </div>
              <div className="absolute -bottom-1 -right-1 bg-purple-600 border-4 border-[#050508] w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black num-en">
                {user.level || 1}
              </div>
            </div>
          </div>

          <div className="space-y-4 mb-5">
            <div>
              <label className="block text-[10px] font-black text-gray-500 mb-1.5">نام نمایشی</label>
              <div className="flex gap-2">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="flex-1 bg-black/25 border border-white/10 rounded-2xl px-4 py-3 text-sm outline-none focus:border-purple-400"
                  placeholder="نام نمایشی جدید"
                  maxLength={100}
                />
                <button
                  onClick={() => saveProfile()}
                  disabled={profileSaving || !displayName.trim()}
                  className="px-4 rounded-2xl bg-purple-600 disabled:opacity-50 text-xs font-black"
                >
                  ذخیره
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-gray-500 mb-1.5">مسیر یا آدرس آواتار سفارشی</label>
              <div className="flex gap-2">
                <input
                  value={selectedAvatar}
                  onChange={(e) => setSelectedAvatar(e.target.value)}
                  className="flex-1 bg-black/25 border border-white/10 rounded-2xl px-4 py-3 text-xs outline-none focus:border-purple-400 text-left"
                  placeholder="مثال: /avatars/my-photo.png"
                  dir="ltr"
                />
                <button
                  onClick={() => saveProfile(selectedAvatar)}
                  disabled={profileSaving || !selectedAvatar.trim()}
                  className="px-4 rounded-2xl bg-cyan-600 disabled:opacity-50 text-xs font-black shrink-0"
                >
                  ثبت آواتار
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[10px] font-black text-gray-500">انتخاب از طرح‌های آماده</label>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {AVATAR_OPTIONS.slice(0, 5).map((avatar) => {
                  const active = selectedAvatar === avatar.url;
                  return (
                    <button
                      key={avatar.url}
                      type="button"
                      onClick={() => chooseAvatar(avatar.url)}
                      disabled={profileSaving}
                      className={`rounded-2xl p-1.5 border transition-all ${active ? "border-purple-400 bg-purple-500/15" : "border-white/10 bg-black/20 hover:border-white/30"}`}
                      title={avatar.label}
                    >
                      <img src={avatar.url} alt={avatar.label} className="w-full aspect-square rounded-xl object-contain" />
                    </button>
                  );
                })}
              </div>
            </div>

            {profileMessage && <div className="text-green-300 text-xs">{profileMessage}</div>}
            {profileError && <div className="text-red-300 text-xs">{profileError}</div>}
          </div>
        </section>

        {/* Section 2: Unified Esports Stats */}
        <section className="grid grid-cols-2 gap-3 mb-6" dir="rtl">
          {[
            { label: "رتبه رنکینگ", value: data?.stats.rating ?? 1000, color: "text-cyan-400", sub: "امتیاز GAMENT" },
            { label: "تعداد بردها", value: data?.stats.wins ?? 0, color: "text-emerald-400", sub: `${data?.stats.losses ?? 0} باخت` },
            { label: "Win Rate (درصد برد)", value: `${data?.stats.winRate ?? 0}%`, color: "text-purple-400", sub: "عملکرد رقابتی" },
            { label: "موجودی کیف پول", value: `${(data?.wallet.balanceToman ?? 0).toLocaleString("en-US")} تومان`, color: "text-yellow-400", sub: `${(Number(data?.wallet.balanceRial ?? 0) / 10).toLocaleString("en-US")} ریال` },
          ].map((stat, i) => (
            <div key={i} className="bg-[#111114] border border-white/5 rounded-3xl p-4 text-right">
              <div className="text-[10px] text-gray-500 mb-0.5">{stat.label}</div>
              <div className={`text-xl sm:text-2xl font-black num-en ${stat.color}`}>{stat.value}</div>
              <div className="text-[9px] text-gray-600 mt-1">{stat.sub}</div>
            </div>
          ))}
        </section>

        {/* Missing Game IDs Warning */}
        {!hasGameIds && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 mb-6 flex items-center justify-between gap-3 animate-pulse" dir="rtl">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div className="text-right">
                <p className="font-bold text-amber-400 text-xs">آیدی بازی‌ها ثبت نشده است!</p>
                <p className="text-[10px] text-gray-400 mt-0.5">جهت واریز جوایز، شناسه‌های بازی خود را وارد کنید.</p>
              </div>
            </div>
            <Link href="/profile/edit" className="text-[10px] bg-amber-500/20 text-amber-300 px-3 py-1.5 rounded-xl border border-amber-500/30 whitespace-nowrap">
              ثبت آیدی
            </Link>
          </div>
        )}

        {/* Section 3: Action Cards Counters */}
        <section className="grid grid-cols-4 gap-2 mb-6" dir="rtl">
          {[
            { icon: "🏆", label: "تورنومنت من", value: data?.stats.myTournaments ?? 0, href: "/tournaments" },
            { icon: "⚔️", label: "مسابقه بعدی", value: data?.stats.upcomingMatches ?? 0, href: nextMatch ? `/tournaments/${nextMatch.tournamentId}` : "/tournaments" },
            { icon: "🔔", label: "اعلان جدید", value: data?.stats.unreadNotifications ?? 0, href: "/notifications" },
            { icon: "🎧", label: "تیکت پشتیبانی", value: data?.stats.openTickets ?? 0, href: "/support" },
          ].map((card, index) => (
            <Link key={index} href={card.href} className="glass-panel p-3.5 rounded-2xl text-center border border-white/5 active:scale-95 transition-transform flex flex-col items-center justify-center">
              <div className="text-xl mb-1">{card.icon}</div>
              <div className="text-base font-black num-en text-purple-100">{card.value}</div>
              <div className="text-[9px] text-gray-400 mt-0.5 whitespace-nowrap">{card.label}</div>
            </Link>
          ))}
        </section>

        {/* Section 4: Next Step (Next Match Lobby details) */}
        <section className="mb-6" dir="rtl">
          <div className="glass-panel p-5 rounded-3xl border border-purple-500/10 relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-black text-sm text-purple-300">🎯 مسابقه فعال و گام بعدی</h2>
              <button onClick={loadDashboard} className="text-[9px] px-2 py-1 rounded-lg bg-white/5 text-gray-400">به‌روزرسانی</button>
            </div>
            
            {nextMatch ? (
              <div className="bg-[#111114]/60 rounded-2xl p-4 border border-white/5">
                <div className="font-black text-sm text-white">{nextMatch.tournamentName}</div>
                <div className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
                  <span>حریف:</span>
                  <span className="text-purple-300">@{nextMatch.opponent?.displayName || "نامشخص"}</span>
                  {nextMatch.opponent?.rating && <span className="num-en text-[10px] bg-white/5 px-1.5 py-0.2 rounded-md">({nextMatch.opponent.rating})</span>}
                </div>
                <div className="flex gap-2 mt-4">
                  <Link href={`/tournaments/${nextMatch.tournamentId}`} className="flex-1 bg-purple-600 py-2.5 rounded-xl text-xs font-black text-center">جزئیات تورنومنت</Link>
                  <Link href={`/tournaments/${nextMatch.tournamentId}/lobby`} className="flex-1 bg-white/10 py-2.5 rounded-xl text-xs font-black text-center">ورود به لابی</Link>
                </div>
              </div>
            ) : activeTournament ? (
              <div className="bg-[#111114]/60 rounded-2xl p-4 border border-white/5">
                <div className="font-black text-sm">{activeTournament.tournamentName}</div>
                <p className="text-xs text-gray-400 mt-1">شما در این تورنومنت ثبت‌نام کرده‌اید و مسابقه در جریان است.</p>
                <Link href={`/tournaments/${activeTournament.tournamentId}`} className="mt-3 block text-center bg-purple-600 py-2.5 rounded-xl text-xs font-black">باز کردن روم</Link>
              </div>
            ) : (
              <div className="text-center py-5 text-gray-500 text-xs">فعلاً مسابقه یا تورنومنت فعالی نداری. آماده رقابت شو!</div>
            )}
          </div>
        </section>

        {/* Section 5: In-Game IDs */}
        <section className="glass-panel rounded-[34px] p-5 border border-white/10 mb-6" dir="rtl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black">🎮 آیدی و اکانت بازی‌ها</h3>
              <p className="text-[10px] text-gray-500 mt-0.5">شناسه‌ها و گیم‌تگ‌های متصل شده شما</p>
            </div>
            <Link href="/profile/edit" className="text-[10px] bg-purple-500/10 text-purple-200 px-3 py-1.5 rounded-xl border border-purple-500/20">
              ویرایش شناسه‌ها
            </Link>
          </div>
          <div className="space-y-2.5">
            {gameIds.map((game) => (
              <div key={game.label} className="flex items-center gap-3 bg-black/20 border border-white/5 rounded-2xl p-3">
                <img src={game.icon} alt={game.label} className="w-9 h-9 rounded-xl object-contain bg-white/5 shrink-0" />
                <div className="flex-1 text-right min-w-0">
                  <div className="text-xs font-black">{game.label}</div>
                  <div className="text-[10px] text-gray-400 mt-1 truncate" dir="ltr">
                    {game.id || game.username ? `${game.username || "بدون نام"} ${game.id ? `• ${game.id}` : ""}` : "ثبت نشده"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 6: Telegram Connection */}
        <section className="glass-panel p-5 rounded-[34px] border border-cyan-500/20 bg-gradient-to-br from-cyan-900/10 to-purple-900/10 mb-6" dir="rtl">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="text-right">
              <h3 className="text-sm font-black">🔗 اتصال بات تلگرام</h3>
              <p className="text-[10px] text-gray-500 mt-1 leading-4">
                در تلگرام آیدی <span dir="ltr" className="text-cyan-300 font-bold">@GamentTournamentBot</span> را استارت کرده، دستور <code className="text-cyan-300">/link</code> را بزنید و کد دریافت شده را اینجا وارد کنید:
              </p>
            </div>
            <Link href="https://t.me/GamentTournamentBot" className="text-[10px] bg-cyan-500/15 text-cyan-200 px-3 py-1.5 rounded-xl border border-cyan-500/20 whitespace-nowrap">
              ربات تلگرام
            </Link>
          </div>

          {telegramAccount ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 mb-4">
              <div className="text-xs font-black text-green-300 mb-1">✅ تلگرام با موفقیت لینک شد</div>
              <div className="text-[11px] text-gray-300 num-en" dir="ltr">
                {telegramAccount.telegramUsername ? `@${telegramAccount.telegramUsername}` : `ID: ${telegramAccount.telegramId}`}
              </div>
            </div>
          ) : (
            <div className="flex gap-2 mb-4" dir="ltr">
              <input
                value={telegramCode}
                onChange={(e) => setTelegramCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="flex-1 bg-black/25 border border-white/10 rounded-2xl px-4 py-3 text-center text-lg font-black tracking-[0.35em] outline-none focus:border-cyan-400 num-en"
                placeholder="123456"
                inputMode="numeric"
                maxLength={6}
              />
              <button
                onClick={submitTelegramCode}
                disabled={telegramLoading || telegramCode.replace(/\D/g, "").length !== 6}
                className="bg-gradient-to-r from-cyan-600 to-blue-600 disabled:opacity-40 px-5 rounded-2xl text-xs font-black shrink-0"
              >
                اتصال
              </button>
            </div>
          )}

          {telegramMessage && <div className="text-green-300 text-xs mb-3">{telegramMessage}</div>}
          {telegramError && <div className="text-red-300 text-xs mb-3">{telegramError}</div>}

          {telegramAccount && (
            <button onClick={unlinkTelegram} disabled={telegramLoading} className="text-[10px] text-red-300 bg-red-500/10 px-3 py-1.5 rounded-xl border border-red-500/20">
              حذف اتصال تلگرام
            </button>
          )}
        </section>

        {/* Section 7: Recent Transactions & Activities */}
        <section className="grid grid-cols-1 gap-4 mb-6" dir="rtl">
          {/* Recent Transactions */}
          <div className="glass-panel p-5 rounded-[30px] border border-white/5">
            <h3 className="font-black text-sm mb-3">💳 آخرین تراکنش‌های کیف پول</h3>
            {data?.transactions.length ? (
              <div className="space-y-2">
                {data.transactions.slice(0, 3).map((tx) => (
                  <div key={tx.id} className="flex justify-between items-center bg-black/20 rounded-2xl px-4 py-3 text-xs">
                    <div className="text-right">
                      <div className="font-bold">{transactionLabel(tx.type)}</div>
                      <div className="text-[10px] text-gray-500 mt-1 num-en">{new Date(tx.createdAt).toLocaleDateString("en-US")}</div>
                    </div>
                    <div className="font-black num-en text-emerald-400">+{tx.amountToman.toLocaleString("en-US")}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 py-3 text-center">تراکنشی یافت نشد.</p>
            )}
          </div>

          {/* Recent Activity */}
          <div className="glass-panel p-5 rounded-[30px] border border-white/5">
            <h3 className="font-black text-sm mb-3">🧭 فعالیت‌های اخیر حساب</h3>
            {data?.recentActivity.length ? (
              <div className="space-y-2">
                {data.recentActivity.slice(0, 3).map((act, i) => (
                  <Link key={i} href={act.link || "#"} className="flex items-start gap-3 bg-black/20 rounded-2xl p-3 hover:bg-white/5 active:scale-[0.99] transition-transform">
                    <span className="text-xl shrink-0">{act.icon}</span>
                    <div className="text-right min-w-0 flex-1">
                      <div className="font-bold text-xs truncate">{act.title}</div>
                      <div className="text-[10px] text-gray-500 mt-1 line-clamp-1">{act.description}</div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 py-3 text-center">فعالیتی ثبت نشده است.</p>
            )}
          </div>
        </section>

        {/* Section 8: Pre-Nav actions, Security, and Logout */}
        <section className="grid grid-cols-2 gap-3 mb-8" dir="rtl">
          <Link href="/profile/security" className="settings-tile flex items-center justify-center gap-2 bg-[#111114] border border-white/10 rounded-2xl py-4 hover:border-white/20 active:scale-95 transition-transform">
            <span>🔐</span>
            <span className="text-xs font-black">امنیت حساب</span>
          </Link>
          <Link href="/profile/privacy" className="settings-tile flex items-center justify-center gap-2 bg-[#111114] border border-white/10 rounded-2xl py-4 hover:border-white/20 active:scale-95 transition-transform">
            <span>🛡️</span>
            <span className="text-xs font-black">حریم خصوصی</span>
          </Link>
          {isAdmin && (
            <Link href="/admin" className="col-span-2 flex items-center justify-center gap-2 bg-[#111114] border border-fuchsia-500/20 rounded-2xl py-4 hover:border-fuchsia-500/40 active:scale-95 transition-transform">
              <span>👑</span>
              <span className="text-xs font-black text-fuchsia-300">ورود به پنل مدیریت ارشد</span>
            </Link>
          )}
        </section>

        <button
          onClick={logout}
          className="w-full glass-panel py-4 sm:py-5 rounded-[24px] sm:rounded-[30px] text-red-400 text-sm font-black border border-red-500/10 hover:bg-red-500/5 active:scale-95 transition-transform"
        >
          خروج از حساب کاربری
        </button>
      </div>

      <BottomNav />
      <style jsx global>{`
        .glass-panel { background: rgba(18, 18, 22, 0.7); backdrop-filter: blur(20px); }
        .num-en { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
        .en-font { font-family: Impact, "Arial Black", system-ui, sans-serif; letter-spacing: -0.04em; }
        .settings-tile { min-height: 54px; transition: transform .15s ease, border-color .15s ease; }
      `}</style>
    </div>
  );
}
