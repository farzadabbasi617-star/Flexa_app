"use client";

import { useCallback, useEffect, useState } from "react";
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
  { label: "لرد خون‌آشام", url: "/avatars/avatar_1.jpg" },
  { label: "دراکولا جوان", url: "/avatars/avatar_2.jpg" },
  { label: "ملکه رز سرخ", url: "/avatars/avatar_3.jpg" },
  { label: "امپراتور طلایی", url: "/avatars/avatar_4.jpg" },
  { label: "شوالیه پیش‌فرض", url: "/icons/profile_icon.png" },
  { label: "نشان گیمنت", url: "/icons/gament-icon-192.png" },
];

export default function UserProfileSettingsPage() {
  const { user, loading, refreshUser } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("/icons/profile_icon.png");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [telegramAccount, setTelegramAccount] = useState<TelegramLinkAccount | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramCode, setTelegramCode] = useState("");
  const [telegramMessage, setTelegramMessage] = useState("");
  const [telegramError, setTelegramError] = useState("");

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName || "");
    setSelectedAvatar(user.avatarUrl || "/icons/profile_icon.png");
  }, [user]);

  const loadTelegramLink = useCallback(async () => {
    if (!user) return;
    setTelegramLoading(true);
    try {
      const res = await fetch("/api/telegram/link", { cache: "no-store", credentials: "include" });
      const json = await res.json();
      if (res.ok) setTelegramAccount(json.account || null);
    } catch {
      setTelegramAccount(null);
    } finally {
      setTelegramLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadTelegramLink();
  }, [loadTelegramLink]);

  async function saveProfile(nextAvatar?: string) {
    if (!user) return;
    setSaving(true);
    setMessage("");
    setError("");
    const avatarUrl = nextAvatar || selectedAvatar;
    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ displayName: displayName.trim(), avatarUrl }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "ذخیره پروفایل انجام نشد.");
      setSelectedAvatar(avatarUrl);
      setMessage("پروفایل با موفقیت ذخیره شد.");
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ذخیره پروفایل انجام نشد.");
    } finally {
      setSaving(false);
    }
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
    } finally {
      setTelegramLoading(false);
    }
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
    } finally {
      setTelegramLoading(false);
    }
  }

  if (loading) return <div className="min-h-screen bg-[#050508] text-white flex items-center justify-center"><div className="text-4xl animate-neon-pulse">👤</div></div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050508] text-white flex items-center justify-center px-5">
        <div className="glass-panel rounded-3xl p-8 text-center max-w-sm w-full">
          <div className="text-5xl mb-4">👤</div>
          <h1 className="font-black text-xl mb-4">برای ویرایش پروفایل وارد شو</h1>
          <Link href="/login" className="gaming-btn block">ورود</Link>
        </div>
      </div>
    );
  }

  const gameIds = [
    { label: "کلش رویال", icon: "/icons/icon-clash_royale.png", id: user.clashRoyaleId, username: user.clashRoyaleUsername },
    { label: "کالاف موبایل", icon: "/icons/icon-cod_mobile.png", id: user.codMobileId, username: user.codMobileUsername },
    { label: "فورتنایت", icon: "/icons/icon-fortnite.png", id: user.fortniteId, username: user.fortniteUsername },
  ];

  return (
    <div className="min-h-screen bg-[#050508] text-white relative overflow-x-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,_rgba(92,0,160,.68)_0%,_rgba(32,0,56,.42)_34%,_transparent_72%)]" />
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-purple-700/20 blur-[80px]" />
      </div>

      <main className="relative z-10 max-w-[620px] mx-auto px-4 sm:px-5 py-6 sm:py-8" style={{ paddingBottom: "var(--bottom-nav-space)" }} dir="rtl">
        <Link href="/profile" className="inline-flex items-center gap-2 text-xs text-gray-400 hover:text-white mb-5">← بازگشت به تنظیمات</Link>

        <header className="text-right mb-6">
          <div className="inline-flex items-center gap-2 text-[10px] font-black text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded-full px-3 py-1 mb-3">
            <img src="/icons/profile_icon.png" alt="پروفایل" className="w-5 h-5 object-contain" />
            پروفایل کاربری
          </div>
          <h1 className="text-3xl font-black">پروفایل</h1>
          <p className="text-xs text-gray-500 mt-1 leading-6">نام نمایشی، آواتار، آیدی بازی‌ها و اتصال تلگرام</p>
        </header>

        <section className="glass-panel rounded-[32px] sm:rounded-[38px] p-4 sm:p-6 border border-white/5 mb-6">
          <div className="flex items-center gap-4 mb-5">
            <div className="p-0.5 rounded-full bg-gradient-to-tr from-[#bc00ff] to-[#00d2ff] shadow-[0_0_20px_rgba(188,0,255,0.35)]">
              <img src={selectedAvatar} alt="Avatar" className="w-20 h-20 rounded-full border-4 border-[#09071f] object-cover bg-black/40" onError={(e) => ((e.target as HTMLImageElement).src = "/icons/profile_icon.png")} />
            </div>
            <div className="text-right">
              <div className="font-black text-xl">{user.displayName}</div>
              <div className="text-xs text-gray-500 mt-1 num-en">@{user.username || "user"}</div>
              <div className="text-[10px] text-purple-300 mt-2 num-en">{user.gamentId}</div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-gray-500 mb-1.5">نام نمایشی جدید</label>
              <div className="flex gap-2">
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="flex-1 bg-black/25 border border-white/10 rounded-2xl px-4 py-3 text-sm outline-none focus:border-purple-400" placeholder="نام نمایشی" maxLength={100} />
                <button onClick={() => saveProfile()} disabled={saving || !displayName.trim()} className="px-4 rounded-2xl bg-purple-600 disabled:opacity-50 text-xs font-black">ذخیره</button>
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
                    <button key={avatar.url} type="button" onClick={() => chooseAvatar(avatar.url)} disabled={saving} className={`rounded-2xl p-1 border transition-all aspect-square flex items-center justify-center relative ${active ? "border-yellow-500 bg-yellow-500/10 shadow-[0_0_16px_rgba(234,179,8,.2)]" : "border-white/10 bg-black/20 hover:border-purple-400/50"}`} title={avatar.label}>
                      <img src={avatar.url} alt={avatar.label} className="w-full h-full rounded-xl object-cover" />
                      {active && <span className="absolute -top-1 -right-1 text-[10px] bg-yellow-500 text-black rounded-full w-5 h-5 grid place-items-center font-black">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {message && <div className="text-green-300 text-xs mt-2">{message}</div>}
            {error && <div className="text-red-300 text-xs mt-2">{error}</div>}
          </div>
        </section>

        <section className="glass-panel rounded-[34px] p-5 border border-white/10 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-black">🎮 آیدی و اکانت بازی‌ها</h2>
              <p className="text-[10px] text-gray-500 mt-0.5">شناسه‌ها و گیم‌تگ‌های متصل شده شما</p>
            </div>
            <Link href="/profile/edit" className="text-[10px] bg-purple-500/10 text-purple-200 px-3 py-1.5 rounded-xl border border-purple-500/20">ویرایش شناسه‌ها</Link>
          </div>
          <div className="space-y-2.5">
            {gameIds.map((game) => (
              <div key={game.label} className="flex items-center gap-3 bg-black/20 border border-white/5 rounded-2xl p-3">
                <img src={game.icon} alt={game.label} className="w-9 h-9 rounded-xl object-contain bg-white/5 shrink-0" />
                <div className="flex-1 text-right min-w-0">
                  <div className="text-xs font-black">{game.label}</div>
                  <div className="text-[10px] text-gray-400 mt-1 truncate" dir="ltr">{game.id || game.username ? `${game.username || "بدون نام"} ${game.id ? `• ${game.id}` : ""}` : "ثبت نشده"}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="telegram" className="glass-panel p-5 rounded-[34px] border border-cyan-500/20 bg-gradient-to-br from-cyan-900/10 to-purple-900/10 mb-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="text-right">
              <h2 className="text-sm font-black">🔗 اتصال بات تلگرام</h2>
              <p className="text-[10px] text-gray-500 mt-1 leading-4">در تلگرام آیدی <span dir="ltr" className="text-cyan-300 font-bold">@FlexaTournamentBot</span> را استارت کرده، دستور <code className="text-cyan-300">/link</code> را بزنید و کد دریافت شده را اینجا وارد کنید.</p>
            </div>
            <Link href="https://t.me/FlexaTournamentBot" className="text-[10px] bg-cyan-500/15 text-cyan-200 px-3 py-1.5 rounded-xl border border-cyan-500/20 whitespace-nowrap">ربات تلگرام</Link>
          </div>

          {telegramAccount ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 mb-4">
              <div className="text-xs font-black text-green-300 mb-1">✅ تلگرام با موفقیت لینک شد</div>
              <div className="text-[11px] text-gray-300 num-en" dir="ltr">{telegramAccount.telegramUsername ? `@${telegramAccount.telegramUsername}` : `ID: ${telegramAccount.telegramId}`}</div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2 mb-4" dir="ltr">
              <input value={telegramCode} onChange={(e) => setTelegramCode(e.target.value.replace(/\D/g, "").slice(0, 6))} className="flex-1 bg-black/25 border border-white/10 rounded-2xl px-4 py-3 text-center text-lg font-black tracking-[0.35em] outline-none focus:border-cyan-400 num-en" placeholder="123456" inputMode="numeric" maxLength={6} />
              <button onClick={submitTelegramCode} disabled={telegramLoading || telegramCode.replace(/\D/g, "").length !== 6} className="bg-gradient-to-r from-cyan-600 to-blue-600 disabled:opacity-40 px-5 rounded-2xl text-xs font-black shrink-0">اتصال</button>
            </div>
          )}

          {telegramMessage && <div className="text-green-300 text-xs mb-3">{telegramMessage}</div>}
          {telegramError && <div className="text-red-300 text-xs mb-3">{telegramError}</div>}
          {telegramAccount && <button onClick={unlinkTelegram} disabled={telegramLoading} className="text-[10px] text-red-300 bg-red-500/10 px-3 py-1.5 rounded-xl border border-red-500/20">حذف اتصال تلگرام</button>}
        </section>
      </main>

      <BottomNav />
      <style jsx global>{`
        .glass-panel { background: rgba(18, 18, 22, 0.7); backdrop-filter: blur(20px); }
        .num-en { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
      `}</style>
    </div>
  );
}
