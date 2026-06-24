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

// Exclusive Gament premium avatars (uploaded directly by the platform owner)
const AVATAR_OPTIONS = [
  { label: "لرد خون‌آشام", url: "/avatars/avatar_1.jpg" },
  { label: "دراکولا جوان", url: "/avatars/avatar_2.jpg" },
  { label: "ملکه رز سرخ", url: "/avatars/avatar_3.jpg" },
  { label: "امپراتور طلایی", url: "/avatars/avatar_4.jpg" },
  { label: "شوالیه پیش‌فرض", url: "/icons/profile_icon.png" },
  { label: "نشان گیمنت", url: "/icons/arena_icon.png" },
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

function getRankTier(rating: number) {
  if (rating >= 2000) return { label: "افسانه‌ای", color: "text-purple-400 bg-purple-950/40 border-purple-500/50", icon: "🔮" };
  if (rating >= 1600) return { label: "الماس", color: "text-cyan-400 bg-cyan-950/40 border-cyan-500/50", icon: "💎" };
  if (rating >= 1300) return { label: "طلایی", color: "text-yellow-400 bg-yellow-950/40 border-yellow-500/50", icon: "🥇" };
  if (rating >= 1000) return { label: "نقره‌ای", color: "text-gray-300 bg-gray-900/40 border-gray-500/50", icon: "🥈" };
  return { label: "برنزی", color: "text-amber-600 bg-amber-950/40 border-amber-800/50", icon: "🥉" };
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

  // Interactive Quests System State (Option 3)
  const [claimedQuests, setClaimedQuests] = useState<string[]>([]);
  const [claimLoading, setClaimLoading] = useState<string | null>(null);
  const [questSuccessMsg, setQuestSuccessMsg] = useState("");
  const [questErrorMsg, setQuestErrorMsg] = useState("");

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
      const metadata = (user.metadata as Record<string, any>) || {};
      setClaimedQuests(metadata.claimedQuests || []);
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

  // Interactive Quest Claim Reward API call
  async function handleClaimQuest(questId: string) {
    setClaimLoading(questId);
    setQuestSuccessMsg("");
    setQuestErrorMsg("");
    try {
      const res = await fetch("/api/quests/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ questId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "خطا در ثبت مأموریت");
      
      setQuestSuccessMsg(json.message);
      setClaimedQuests(json.claimedQuests || []);
      
      // Update local state instantly and sync from backend
      await refreshUser();
      loadDashboard();
    } catch (err) {
      setQuestErrorMsg(err instanceof Error ? err.message : "ثبت مأموریت انجام نشد.");
    }
    setClaimLoading(null);
  }

  const nextMatch = useMemo(() => data?.matches.find((m) => m.status !== "completed") || null, [data]);
  const activeTournament = useMemo(() => data?.tournaments.find((t) => t.status === "registration" || t.status === "in_progress") || null, [data]);

  const hasGameIds = user?.clashRoyaleId || user?.codMobileId || user?.fortniteId;
  const tier = useMemo(() => getRankTier(data?.stats.rating ?? 1000), [data]);

  // Exact XP progression calculation matching Gament leveling formula
  const xpInfo = useMemo(() => {
    if (!user) return { currentLevelBaseXP: 0, nextLevelTargetXP: 100, levelXP: 0, levelMaxXP: 100, progressPercent: 0 };
    const lvl = user.level || 1;
    const currentLevelBaseXP = Math.pow(lvl - 1, 2) * 100;
    const nextLevelTargetXP = Math.pow(lvl, 2) * 100;
    const levelXP = (user.xp || 0) - currentLevelBaseXP;
    const levelMaxXP = nextLevelTargetXP - currentLevelBaseXP;
    const progressPercent = Math.max(0, Math.min(100, (levelXP / levelMaxXP) * 100));
    return { currentLevelBaseXP, nextLevelTargetXP, levelXP, levelMaxXP, progressPercent };
  }, [user]);

  // Client-side interactive and dynamic Quest Checklist (Option 3)
  const quests = useMemo(() => {
    if (!user || !data) return [];
    return [
      {
        id: "game_ids",
        title: "ثبت شناسه‌های بازی",
        desc: "ثبت حداقل یک آیدی بازی (کالاف، کلش یا فورتنایت)",
        xp: 50,
        completed: Boolean(hasGameIds),
        icon: "🎮",
      },
      {
        id: "telegram_link",
        title: "اتصال به ربات تلگرام",
        desc: "لینک کردن موفق حساب تلگرام به گیمنت",
        xp: 50,
        completed: Boolean(telegramAccount),
        icon: "🔗",
      },
      {
        id: "join_tournament",
        title: "اولین رقابت",
        desc: "ثبت‌نام در حداقل یک تورنومنت گیمنت",
        xp: 100,
        completed: Boolean(data.stats.myTournaments > 0),
        icon: "⚔️",
      },
      {
        id: "level_5",
        title: "کهنه‌کار نوپا",
        desc: "رسیدن به سطح کاربری ۵ در پلتفرم",
        xp: 150,
        completed: Boolean(user.level >= 5),
        icon: "⚡",
      },
    ];
  }, [user, data, hasGameIds, telegramAccount]);

  if (loading || busy || !user) {
    return (
      <div className="min-h-screen bg-[#050508] text-white flex items-center justify-center">
        <div className="text-4xl animate-pulse">⚡</div>
      </div>
    );
  }

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
            👑 تنظیمات، پروفایل و داشبورد کاربری گیمنت
          </div>
          <h1 className="text-3xl font-black">تنظیمات حساب</h1>
          <p className="text-xs text-gray-500 mt-1 leading-6">
            پروفایل، امنیت، کیف پول، خدمات مالی، آواتارها و آمار زنده حساب
          </p>
        </header>

        {/* Site Errors */}
        {dashboardError && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-2xl p-4 mb-5 text-xs text-right">
            {dashboardError}
          </div>
        )}

        {/* Option 2: Esports Gamer ID Card */}
        <section className="mb-6 relative group">
          {/* Subtle backglow */}
          <div className="absolute inset-0 bg-gradient-to-tr from-purple-600/15 to-cyan-500/15 rounded-[38px] blur-xl opacity-60 transition-opacity group-hover:opacity-100" />
          
          <div className="relative glass-panel rounded-[38px] border border-purple-500/30 overflow-hidden bg-gradient-to-br from-[#1c1140]/90 via-[#0a071f]/95 to-[#050508]/100 p-6 shadow-2xl">
            {/* Holographic Watermark lines */}
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[linear-gradient(45deg,#fff_25%,transparent_25%,transparent_50%,#fff_50%,#fff_75%,transparent_75%,transparent)] bg-[length:40px_40px]" />
            <div className="absolute -top-12 -left-12 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />

            {/* Top Bar of the Card */}
            <div className="flex justify-between items-start mb-6">
              <div className="text-right">
                <div className="text-[9px] font-black text-purple-400 tracking-[0.2em] uppercase leading-none">GAMENT ATHLETE LICENSE</div>
                <div className="text-[10px] text-gray-500 font-bold mt-1 leading-none">کارت هویت رسمی بازیکن</div>
              </div>
              <img src="/icons/arena_icon.png" alt="Gament Logo" className="w-8 h-8 object-contain drop-shadow-[0_0_8px_rgba(188,0,255,0.4)]" />
            </div>

            {/* Body of the Card */}
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex-1 min-w-0 text-right">
                <h2 className="text-2xl sm:text-3xl font-black text-white truncate leading-none mb-2">{user.displayName}</h2>
                <div className="text-xs text-gray-400 font-bold num-en">@{user.username}</div>
                
                <div className="flex items-center gap-1.5 justify-end mt-3.5">
                  <span className="text-[10px] text-purple-300 font-black en-font tracking-wide bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20 num-en">
                    {user.gamentId}
                  </span>
                  <span className={`px-2 py-0.5 rounded-md text-[9px] border font-black flex items-center gap-1 shrink-0 ${tier.color}`}>
                    <span>{tier.icon}</span>
                    <span>{tier.label}</span>
                  </span>
                </div>
              </div>

              {/* Avatar Box with level badge */}
              <div className="relative shrink-0">
                <div className="p-0.5 rounded-full bg-gradient-to-tr from-[#bc00ff] to-[#00d2ff] shadow-[0_0_20px_rgba(188,0,255,0.35)]">
                  <img
                    src={selectedAvatar}
                    alt="Avatar"
                    className="w-18 h-18 sm:w-20 sm:h-20 rounded-full border-4 border-[#09071f] object-cover bg-black/40"
                    onError={(e) => ((e.target as HTMLImageElement).src = "/icons/profile_icon.png")}
                  />
                </div>
                <div className="absolute -bottom-1 -right-1 bg-gradient-to-r from-purple-600 to-fuchsia-600 border-2 border-[#09071f] w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black num-en shadow-md">
                  {user.level || 1}
                </div>
              </div>
            </div>

            {/* Bottom Bar: Level progress & License Info */}
            <div className="mt-6 pt-4 border-t border-white/5 flex flex-col gap-2">
              <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold">
                <span className="num-en">LEVEL {user.level || 1} PROGRESS</span>
                <span className="num-en text-purple-300">{user.xp || 0} / {xpInfo.nextLevelTargetXP} XP</span>
              </div>
              <div className="h-2 bg-black/40 border border-white/5 rounded-full overflow-hidden p-0.5">
                <div 
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-cyan-500 shadow-[0_0_10px_rgba(188,0,255,0.5)] transition-all duration-500"
                  style={{ width: `${xpInfo.progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Section 1: Hero Edit Profile */}
        <section className="glass-panel rounded-[38px] p-6 border border-white/5 mb-6">
          <div className="text-right mb-4">
            <h2 className="text-sm font-black text-gray-400">👤 تنظیمات مشخصات و آواتار</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-gray-500 mb-1.5">نام نمایشی جدید</label>
              <div className="flex gap-2">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="flex-1 bg-black/25 border border-white/10 rounded-2xl px-4 py-3 text-sm outline-none focus:border-purple-400"
                  placeholder="نام نمایشی"
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
              <div className="flex items-center justify-between mb-2.5">
                <label className="block text-[10px] font-black text-purple-300 tracking-wider">🌟 انتخاب آواتار انحصاری گیمنت</label>
                <span className="text-[9px] text-gray-500">جهت اعمال کلیک کنید</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {AVATAR_OPTIONS.map((avatar) => {
                  const active = selectedAvatar === avatar.url;
                  return (
                    <button
                      key={avatar.url}
                      type="button"
                      onClick={() => chooseAvatar(avatar.url)}
                      disabled={profileSaving}
                      className={`rounded-2xl p-1 border transition-all aspect-square flex items-center justify-center relative ${
                        active 
                          ? "border-yellow-500 bg-yellow-500/10 shadow-[0_0_15px_rgba(234,179,8,0.25)] scale-[1.04]" 
                          : "border-white/10 bg-black/20 hover:border-white/30"
                      }`}
                      title={avatar.label}
                    >
                      <img src={avatar.url} alt={avatar.label} className="w-full h-full rounded-xl object-cover" />
                      {active && (
                        <div className="absolute top-0.5 right-0.5 bg-yellow-500 text-[7px] text-black px-1 rounded font-black leading-none">✓</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {profileMessage && <div className="text-green-300 text-xs mt-2">{profileMessage}</div>}
            {profileError && <div className="text-red-300 text-xs mt-2">{profileError}</div>}
          </div>
        </section>

        {/* Option 3: Daily Quests & Onboarding Checklist (Fully interactive and claimed quests saved in DB!) */}
        <section className="glass-panel rounded-[34px] border border-white/10 p-5 mb-6" dir="rtl">
          <div className="text-right mb-4">
            <h3 className="text-sm font-black text-white flex items-center gap-1.5">
              <span>🎯</span>
              <span>مأموریت‌ها و چالش‌های کاربری</span>
            </h3>
            <p className="text-[10px] text-gray-500 mt-1">با انجام مأموریت‌ها و دریافت جوایز، سریع‌تر لول‌آپ شوید!</p>
          </div>

          <div className="space-y-2.5">
            {quests.map((quest) => {
              const isClaimed = claimedQuests.includes(quest.id);
              const isClaimable = quest.completed && !isClaimed;

              return (
                <div 
                  key={quest.id} 
                  className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                    isClaimed 
                      ? "bg-emerald-500/5 border-emerald-500/15 opacity-75" 
                      : isClaimable
                      ? "bg-yellow-500/5 border-yellow-500/25 shadow-[0_0_10px_rgba(234,179,8,0.05)]"
                      : "bg-black/20 border-white/5 hover:border-white/10"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-lg ${
                      isClaimed 
                        ? "bg-emerald-500/10 text-emerald-400" 
                        : isClaimable
                        ? "bg-yellow-500/10 text-yellow-400"
                        : "bg-white/5 text-gray-400"
                    }`}>
                      {isClaimed ? "✓" : quest.icon}
                    </div>
                    <div className="text-right min-w-0 flex-1">
                      <div className={`text-xs font-black truncate ${
                        isClaimed 
                          ? "text-emerald-400 line-through" 
                          : isClaimable
                          ? "text-yellow-300 font-bold"
                          : "text-gray-200"
                      }`}>
                        {quest.title}
                      </div>
                      <div className="text-[9px] text-gray-500 mt-1 truncate">{quest.desc}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                      isClaimed 
                        ? "bg-emerald-500/10 text-emerald-400/70 border border-emerald-500/10" 
                        : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/10 animate-pulse"
                    }`}>
                      +{quest.xp} XP
                    </span>
                    
                    {isClaimed ? (
                      <span className="text-[10px] font-black text-emerald-500 shrink-0">دریافت شده</span>
                    ) : isClaimable ? (
                      <button 
                        onClick={() => handleClaimQuest(quest.id)}
                        disabled={claimLoading !== null}
                        className="text-[10px] bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black px-2.5 py-1 rounded-lg font-black transition-all shrink-0 shadow-lg shadow-yellow-500/15 animate-bounce"
                      >
                        {claimLoading === quest.id ? "..." : "دریافت جایزه"}
                      </button>
                    ) : (
                      <Link 
                        href={quest.id === "game_ids" ? "/profile/edit" : quest.id === "telegram_link" ? "#telegram" : "/tournaments"} 
                        className="text-[9px] bg-purple-600 hover:bg-purple-500 text-white px-2.5 py-1 rounded-lg font-black transition-all shrink-0"
                      >
                        شروع
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {questSuccessMsg && <div className="text-green-300 text-xs mt-3 text-right font-bold">✅ {questSuccessMsg}</div>}
          {questErrorMsg && <div className="text-red-300 text-xs mt-3 text-right font-bold">❌ {questErrorMsg}</div>}
        </section>

        {/* Section 2: Unified Esports Stats */}
        <section className="grid grid-cols-2 gap-3 mb-6" dir="rtl">
          {[
            { label: "رتبه رنکینگ", value: (data?.stats.rating ?? 1000).toLocaleString("en-US"), color: "text-cyan-400", sub: "امتیاز GAMENT" },
            { label: "تعداد بردها", value: (data?.stats.wins ?? 0).toLocaleString("en-US"), color: "text-emerald-400", sub: `${(data?.stats.losses ?? 0).toLocaleString("en-US")} باخت` },
            { label: "Win Rate (درصد برد)", value: `${(data?.stats.winRate ?? 0).toLocaleString("en-US")}%`, color: "text-purple-400", sub: "عملکرد رقابتی" },
            { label: "موجودی کیف پول", value: `${(data?.wallet.balanceToman ?? 0).toLocaleString("en-US")} تومان`, color: "text-yellow-400", sub: `${(Number(data?.wallet.balanceRial ?? 0) / 10).toLocaleString("en-US")} ریال` },
          ].map((stat, i) => (
            <div key={i} className="bg-[#111114] border border-white/5 rounded-3xl p-4 text-right">
              <div className="text-[10px] text-gray-500 mb-0.5">{stat.label}</div>
              <div className={`text-xl sm:text-2xl font-black num-en ${stat.color}`}>{stat.value}</div>
              <div className="text-[9px] text-gray-600 mt-1">{stat.sub}</div>
            </div>
          ))}
        </section>

        {/* Section 3: Action Cards Counters */}
        <section className="grid grid-cols-4 gap-2 mb-6" dir="rtl">
          {[
            { icon: "🏆", label: "تورنومنت من", value: (data?.stats.myTournaments ?? 0).toLocaleString("en-US"), href: "/tournaments" },
            { icon: "⚔️", label: "مسابقه بعدی", value: (data?.stats.upcomingMatches ?? 0).toLocaleString("en-US"), href: nextMatch ? `/tournaments/${nextMatch.tournamentId}` : "/tournaments" },
            { icon: "🔔", label: "اعلان جدید", value: (data?.stats.unreadNotifications ?? 0).toLocaleString("en-US"), href: "/notifications" },
            { icon: "🎧", label: "تیکت پشتیبانی", value: (data?.stats.openTickets ?? 0).toLocaleString("en-US"), href: "/support" },
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
        <section id="telegram" className="glass-panel p-5 rounded-[34px] border border-cyan-500/20 bg-gradient-to-br from-cyan-900/10 to-purple-900/10 mb-6" dir="rtl">
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

        {/* Section 8: Settings tabs, Security, and Logout */}
        <section className="grid grid-cols-2 gap-3 mb-8" dir="rtl">
          <Link href="/wallet" className="settings-tile flex items-center justify-center gap-2 bg-[#111114] border border-purple-500/20 rounded-2xl py-4 hover:border-purple-500/40 active:scale-95 transition-transform">
            <img src="/icons/wallet_icon.png" alt="کیف پول" className="w-6 h-6 object-contain drop-shadow-[0_0_8px_#bc00ff]" />
            <span className="text-xs font-black text-purple-200">کیف پول</span>
          </Link>
          <Link href="/profile/descriptions" className="settings-tile flex items-center justify-center gap-2 bg-[#111114] border border-cyan-500/20 rounded-2xl py-4 hover:border-cyan-500/40 active:scale-95 transition-transform">
            <span>📘</span>
            <span className="text-xs font-black text-cyan-200">توضیحات</span>
          </Link>
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
        
        @keyframes float-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        .animate-float-slow {
          animation: float-slow 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
