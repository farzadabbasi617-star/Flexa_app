"use client";

import { useEffect, useMemo, useState } from "react";
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

const AVATAR_OPTIONS = [
  { label: "شوالیه", url: "/icons/profile_icon.png" },
  { label: "فلکسا", url: "/icons/arena_icon.png" },
  { label: "تنظیمات", url: "/icons/settings_icon.png" },
  { label: "رتبه‌ها", url: "/icons/rankings_icon.png" },
  { label: "افتخارات", url: "/icons/honors_icon.png" },
  { label: "کیف پول", url: "/icons/wallet_icon.png" },
  { label: "کلش", url: "/icons/icon-clash_royale.png" },
  { label: "کالاف", url: "/icons/icon-cod_mobile.png" },
  { label: "فورتنایت", url: "/icons/icon-fortnite.png" },
];

export default function ProfilePage() {
  const { user, loading, logout, refreshUser } = useAuth();
  const [balance, setBalance] = useState(0);
  const [walletLoading, setWalletLoading] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("/icons/profile_icon.png");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [telegramAccount, setTelegramAccount] = useState<TelegramLinkAccount | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramCode, setTelegramCode] = useState("");
  const [telegramMessage, setTelegramMessage] = useState("");
  const [telegramError, setTelegramError] = useState("");

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName || user.username || "");
    setSelectedAvatar(user.avatarUrl || "/icons/profile_icon.png");
  }, [user]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    async function fetchBalance() {
      setWalletLoading(true);
      try {
        const res = await fetch("/api/wallet/balance", { credentials: "include" });
        const data = await res.json();
        if (!cancelled && res.ok) setBalance(data.balanceToman || 0);
      } catch {
        if (!cancelled) setBalance(0);
      }
      if (!cancelled) setWalletLoading(false);
    }

    fetchBalance();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function loadTelegramLink() {
    if (!user) return;
    setTelegramLoading(true);
    try {
      const res = await fetch("/api/telegram/link", { credentials: "include", cache: "no-store" });
      const data = await res.json();
      if (res.ok) setTelegramAccount(data.account || null);
    } catch {
      setTelegramAccount(null);
    }
    setTelegramLoading(false);
  }

  useEffect(() => {
    loadTelegramLink();
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ذخیره پروفایل انجام نشد.");
      setProfileMessage("پروفایل با موفقیت ذخیره شد.");
      await refreshUser();
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "اتصال تلگرام انجام نشد.");
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "حذف اتصال انجام نشد.");
      setTelegramAccount(null);
      setTelegramMessage("اتصال تلگرام حذف شد.");
    } catch (err) {
      setTelegramError(err instanceof Error ? err.message : "حذف اتصال انجام نشد.");
    }
    setTelegramLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050508] text-white flex items-center justify-center">
        <div className="text-4xl animate-neon-pulse">⚡</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050508] text-white relative overflow-hidden">
        <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,_rgba(92,0,160,.55),_transparent_65%)]" />
        <div className="relative z-10 max-w-[480px] mx-auto px-6 min-h-screen flex items-center justify-center">
          <div className="glass-panel p-8 rounded-[38px] text-center border border-white/10 shadow-2xl">
            <div className="text-6xl mb-5">⚙️</div>
            <h1 className="text-2xl font-black mb-3">برای دیدن تنظیمات وارد شو</h1>
            <p className="text-sm text-gray-400 leading-7 mb-7">
              پروفایل، کیف پول، آیدی‌های بازی و تنظیمات حساب بعد از ورود نمایش داده می‌شوند.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/login" className="bg-purple-600 py-4 rounded-2xl font-black text-sm">
                ورود
              </Link>
              <Link href="/register" className="glass-panel py-4 rounded-2xl font-black text-sm text-gray-300">
                ثبت‌نام
              </Link>
            </div>
          </div>
        </div>
        <BottomNav />
        <style jsx global>{`
          .glass-panel { background: rgba(20, 20, 25, 0.75); backdrop-filter: blur(25px); }
        `}</style>
      </div>
    );
  }

  const isAdmin = user.role === "admin" || user.role === "super_admin";

  return (
    <div className="min-h-screen bg-[#050508] text-white relative overflow-x-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,_rgba(92,0,160,.68)_0%,_rgba(32,0,56,.42)_34%,_transparent_72%)]" />
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-purple-700/20 blur-[80px]" />
      </div>

      <div className="relative z-10 max-w-[520px] mx-auto px-5 pb-28">
        <header className="pt-10 pb-6 text-right">
          <div className="inline-flex items-center gap-2 text-[10px] font-black text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded-full px-3 py-1 mb-4">
            ⚙️ مرکز تنظیمات حساب
          </div>
          <h1 className="text-3xl font-black">تنظیمات</h1>
          <p className="text-xs text-gray-500 mt-2 leading-6">
            پروفایل، دارایی‌ها، آیدی‌های بازی و تنظیمات حساب کاربری
          </p>
        </header>

        <section className="glass-panel rounded-[38px] p-6 border border-purple-500/20 bg-gradient-to-br from-[#1a0033]/70 to-[#0a0a0c] mb-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="text-right">
              <h2 className="text-xl font-black">👤 پروفایل</h2>
              <p className="text-[10px] text-gray-500 mt-1">آواتار، نام نمایشی و اطلاعات بازی‌ها</p>
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
              <label className="block text-[10px] font-black text-gray-500 mb-2">نام نمایشی</label>
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
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[10px] font-black text-gray-500">انتخاب آواتار</label>
                <span className="text-[9px] text-gray-600">برای انتخاب کلیک کن</span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {AVATAR_OPTIONS.map((avatar) => {
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

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-black/20 border border-white/10 rounded-3xl p-4">
              <div className="text-[9px] font-black text-gray-500 mb-1">نام کاربری</div>
              <div className="text-sm font-black" dir="ltr">@{user.username}</div>
            </div>
            <div className="bg-black/20 border border-white/10 rounded-3xl p-4">
              <div className="text-[9px] font-black text-gray-500 mb-1">Flexa ID</div>
              <div className="text-sm font-black text-purple-300 en-font" dir="ltr">{user.flexaId || "N/A"}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Link href="/achievements" className="profile-tile">
              <span className="text-2xl">🏆</span>
              <span>دستاوردها</span>
            </Link>
            <Link href="/wallet" className="profile-tile">
              <span className="text-2xl">💳</span>
              <span>کیف پول</span>
            </Link>
            <Link href="/wallet" className="profile-tile col-span-2">
              <span className="text-2xl">💎</span>
              <span>{walletLoading ? "در حال دریافت دارایی..." : `دارایی: ${balance.toLocaleString("fa-IR")} تومان`}</span>
            </Link>
          </div>
        </section>

        <section className="glass-panel rounded-[34px] p-5 border border-white/10 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black">🎮 آیدی بازی‌ها</h3>
              <p className="text-[10px] text-gray-500 mt-1">شناسه‌ها و نام‌های داخل بازی</p>
            </div>
            <Link href="/profile/edit" className="text-[10px] bg-purple-500/15 text-purple-200 px-3 py-2 rounded-2xl border border-purple-500/20">
              ویرایش
            </Link>
          </div>
          <div className="space-y-3">
            {gameIds.map((game) => (
              <div key={game.label} className="flex items-center gap-3 bg-black/20 border border-white/5 rounded-2xl p-3">
                <img src={game.icon} alt={game.label} className="w-10 h-10 rounded-xl object-contain bg-white/5" />
                <div className="flex-1 text-right">
                  <div className="text-xs font-black">{game.label}</div>
                  <div className="text-[10px] text-gray-500 mt-1" dir="ltr">
                    {game.id || game.username ? `${game.username || "بدون نام"} ${game.id ? `• ${game.id}` : ""}` : "ثبت نشده"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-panel p-5 rounded-[34px] border border-cyan-500/20 bg-gradient-to-br from-cyan-900/20 to-purple-900/10 mb-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="text-right">
              <h3 className="text-sm font-black">🔗 اتصال تلگرام</h3>
              <p className="text-[10px] text-gray-500 mt-1 leading-5">
                در ربات <span dir="ltr" className="text-cyan-300">@FlexaTournamentBot</span> دستور <code className="text-cyan-300">/link</code> را بزن و کد ۶ رقمی را اینجا وارد کن.
              </p>
            </div>
            <Link href="https://t.me/FlexaTournamentBot" className="text-[10px] bg-cyan-500/15 text-cyan-200 px-3 py-2 rounded-2xl border border-cyan-500/20 whitespace-nowrap">
              ربات
            </Link>
          </div>

          {telegramAccount ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 mb-4">
              <div className="text-xs font-black text-green-300 mb-1">✅ تلگرام لینک شده</div>
              <div className="text-[11px] text-gray-300" dir="ltr">
                {telegramAccount.telegramUsername ? `@${telegramAccount.telegramUsername}` : `ID: ${telegramAccount.telegramId}`}
              </div>
            </div>
          ) : (
            <div className="flex gap-2 mb-4" dir="ltr">
              <input
                value={telegramCode}
                onChange={(e) => setTelegramCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="flex-1 bg-black/25 border border-white/10 rounded-2xl px-4 py-3 text-center text-lg font-black tracking-[0.35em] outline-none focus:border-cyan-400"
                placeholder="123456"
                inputMode="numeric"
                maxLength={6}
              />
              <button
                onClick={submitTelegramCode}
                disabled={telegramLoading || telegramCode.replace(/\D/g, "").length !== 6}
                className="bg-gradient-to-r from-cyan-600 to-blue-600 disabled:opacity-40 px-5 rounded-2xl text-xs font-black"
              >
                اتصال
              </button>
            </div>
          )}

          {telegramMessage && <div className="text-green-300 text-xs mb-3">{telegramMessage}</div>}
          {telegramError && <div className="text-red-300 text-xs mb-3">{telegramError}</div>}

          {telegramAccount && (
            <button onClick={unlinkTelegram} disabled={telegramLoading} className="text-[10px] text-red-300 bg-red-500/10 px-3 py-2 rounded-xl border border-red-500/20">
              حذف اتصال تلگرام
            </button>
          )}
        </section>

        <section className="grid grid-cols-2 gap-3 mb-8">
          <Link href="/dashboard" className="settings-tile">
            <img src="/icons/profile_dashboard.png" alt="Dashboard" className="w-10 h-10 object-contain" />
            <span>داشبورد</span>
          </Link>
          <Link href="/profile/security" className="settings-tile">
            <img src="/icons/profile_security.png" alt="Security" className="w-10 h-10 object-contain" />
            <span>امنیت</span>
          </Link>
          <Link href="/profile/privacy" className="settings-tile">
            <img src="/icons/profile_privacy.png" alt="Privacy" className="w-10 h-10 object-contain" />
            <span>حریم خصوصی</span>
          </Link>
          <Link href="/support" className="settings-tile">
            <img src="/icons/profile_support_center.png" alt="Support" className="w-10 h-10 object-contain" />
            <span>پشتیبانی</span>
          </Link>
          {isAdmin && (
            <Link href="/admin" className="settings-tile col-span-2 border-fuchsia-500/20">
              <img src="/icons/profile_admin.png" alt="Admin" className="w-10 h-10 object-contain" />
              <span className="text-fuchsia-300">پنل مدیریت</span>
            </Link>
          )}
        </section>

        <button
          onClick={logout}
          className="w-full glass-panel py-5 rounded-[30px] text-red-400 text-sm font-black border border-red-500/10"
        >
          خروج از حساب کاربری
        </button>
      </div>

      <BottomNav />
      <style jsx global>{`
        .glass-panel { background: rgba(20, 20, 25, 0.75); backdrop-filter: blur(25px); }
        .num-en { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
        .en-font { font-family: Impact, "Arial Black", system-ui, sans-serif; letter-spacing: -0.04em; }
        .profile-tile { display: flex; align-items: center; justify-content: center; gap: 0.5rem; min-height: 68px; border-radius: 24px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.08); font-size: 12px; font-weight: 900; }
        .settings-tile { display: flex; align-items: center; justify-content: center; gap: 0.6rem; min-height: 82px; border-radius: 28px; background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.08); font-size: 12px; font-weight: 900; transition: transform .15s ease, border-color .15s ease; }
        .settings-tile:active, .profile-tile:active { transform: scale(.97); }
      `}</style>
    </div>
  );
}
