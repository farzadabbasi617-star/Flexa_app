"use client";

import { useEffect, useState } from "react";
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

export default function ProfilePage() {
  const { user, loading, logout } = useAuth();
  const [balance, setBalance] = useState(0);
  const [walletLoading, setWalletLoading] = useState(false);
  const [telegramAccount, setTelegramAccount] = useState<TelegramLinkAccount | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramCode, setTelegramCode] = useState("");
  const [telegramMessage, setTelegramMessage] = useState("");
  const [telegramError, setTelegramError] = useState("");

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
            <div className="text-6xl mb-5">🚀</div>
            <h1 className="text-2xl font-black mb-3">برای دیدن پروفایل وارد شو</h1>
            <p className="text-sm text-gray-400 leading-7 mb-7">
              پروفایل، کیف پول و آیدی‌های بازی بعد از ورود نمایش داده می‌شوند.
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

  const initial = user.displayName?.charAt(0) || user.username?.charAt(0) || "F";
  const isAdmin = user.role === "admin" || user.role === "super_admin";

  return (
    <div className="min-h-screen bg-[#050508] text-white relative overflow-x-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,_rgba(92,0,160,.68)_0%,_rgba(32,0,56,.42)_34%,_transparent_72%)]" />
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-purple-700/20 blur-[80px]" />
      </div>

      <div className="relative z-10 max-w-[480px] mx-auto px-6 pb-28">
        <header className="pt-12 pb-8 text-center">
          <div className="relative inline-block mb-6">
            <div className="p-1 rounded-full bg-gradient-to-tr from-[#bc00ff] to-[#00d2ff] shadow-[0_0_30px_rgba(188,0,255,0.4)]">
              <div className="w-28 h-28 rounded-full border-4 border-[#050508] overflow-hidden bg-gradient-to-br from-purple-700 to-cyan-600 grid place-items-center text-5xl font-black">
                {initial.toUpperCase()}
              </div>
            </div>
            <div className="absolute -bottom-1 -right-1 bg-purple-600 border-4 border-[#050508] w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-black num-en">
              {user.level || 1}
            </div>
          </div>

          <h2 className="text-3xl font-black mb-2 uppercase en-font">{user.username}</h2>
          <div className="inline-flex items-center gap-2 bg-white/5 px-4 py-1.5 rounded-full border border-white/5 mb-3" dir="ltr">
            <span className="text-[9px] font-bold text-gray-500 uppercase">Flexa ID:</span>
            <span className="text-xs font-black text-purple-400 en-font">{user.flexaId || "N/A"}</span>
          </div>
          {isAdmin && (
            <div className="mx-auto w-fit bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-300 px-3 py-1 rounded-full text-[10px] font-black">
              {user.role === "super_admin" ? "مدیر اصلی" : "ادمین"}
            </div>
          )}
        </header>

        <div className="mb-8">
          <div className="glass-panel p-8 rounded-[45px] border border-purple-500/20 bg-gradient-to-br from-[#1a0033] to-[#0a0a0c]">
            <p className="text-[10px] font-black text-purple-300 uppercase mb-2 opacity-70">موجودی کیف پول</p>
            <div className="flex items-baseline gap-3 mb-8" dir="ltr">
              <span className="text-5xl font-black num-en">{walletLoading ? "..." : balance.toLocaleString("fa-IR")}</span>
              <span className="text-xs font-bold text-purple-400 uppercase">Toman</span>
            </div>
            <div className="flex gap-3">
                    <Link href="/wallet" className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 py-4 rounded-[22px] font-black text-[10px] shadow-xl text-center">
                شارژ حساب
              </Link>
              <Link href="/wallet" className="flex-1 glass-panel py-4 rounded-[22px] font-black text-[10px] text-gray-400 text-center">
                تراکنش‌ها
              </Link>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <div className="glass-panel p-6 rounded-[34px] border border-cyan-500/20 bg-gradient-to-br from-cyan-900/20 to-purple-900/10">
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
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-8">
          <Link href="/profile/edit" className="glass-panel p-5 rounded-[28px] border border-white/5 text-center active:scale-95 transition-transform">
            <img src="/icons/profile_game_ids.png" alt="Game IDs" className="w-12 h-12 mx-auto mb-2 object-contain" />
            <div className="text-xs font-black">آیدی بازی‌ها</div>
          </Link>
          <Link href="/dashboard" className="glass-panel p-5 rounded-[28px] border border-white/5 text-center active:scale-95 transition-transform">
            <img src="/icons/profile_dashboard.png" alt="Dashboard" className="w-12 h-12 mx-auto mb-2 object-contain" />
            <div className="text-xs font-black">داشبورد</div>
          </Link>
          <Link href="/support" className="glass-panel p-5 rounded-[28px] border border-white/5 text-center active:scale-95 transition-transform col-span-2">
            <img src="/icons/profile_tickets.png" alt="Support" className="w-12 h-12 mx-auto mb-2 object-contain" />
            <div className="text-xs font-black">پشتیبانی و تیکت‌ها</div>
          </Link>
          <Link href="/profile/security" className="glass-panel p-5 rounded-[28px] border border-white/5 text-center active:scale-95 transition-transform col-span-2">
            <img src="/icons/profile_security.png" alt="Security" className="w-12 h-12 mx-auto mb-2 object-contain" />
            <div className="text-xs font-black">امنیت حساب و دستگاه‌ها</div>
          </Link>

          <Link href="/profile/privacy" className="glass-panel p-5 rounded-[28px] border border-white/5 text-center active:scale-95 transition-transform col-span-2">
            <img src="/icons/profile_privacy.png" alt="Privacy" className="w-12 h-12 mx-auto mb-2 object-contain" />
            <div className="text-xs font-black">حریم خصوصی</div>
          </Link>
          {isAdmin && (
            <Link href="/admin" className="glass-panel p-5 rounded-[28px] border border-fuchsia-500/20 text-center active:scale-95 transition-transform col-span-2">
              <img src="/icons/profile_admin.png" alt="Admin" className="w-12 h-12 mx-auto mb-2 object-contain" />
              <div className="text-xs font-black text-fuchsia-300">پنل مدیریت</div>
            </Link>
          )}
        </div>

        <div className="mb-8 space-y-4">
          <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mr-2">تیکت‌های پشتیبانی</h3>
          <Link 
            href="/support" 
            className="glass-panel p-5 rounded-[30px] flex items-center justify-between border-white/5 active:scale-[0.985] transition-all block"
          >
            <div className="text-right">
              <h4 className="text-xs font-black">مرکز پشتیبانی فلکسا</h4>
              <p className="text-[8px] text-gray-500 uppercase">ارسال تیکت و پیگیری</p>
            </div>
            <img src="/icons/profile_support_center.png" alt="Support Center" className="w-10 h-10 object-contain" />
          </Link>
        </div>

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
        .num-en { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
        .en-font { font-family: Impact, "Arial Black", system-ui, sans-serif; letter-spacing: -0.04em; }
      `}</style>
    </div>
  );
}
