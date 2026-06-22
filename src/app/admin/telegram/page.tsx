"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

interface TelegramAnalytics {
  stats: Record<string, number>;
  campaigns: Array<{ campaign: string; events: number }>;
  coupons: Array<{ code: string; discountPercent: number; usedCount: number; isActive: boolean }>;
  recentPreRegistrations: Array<Record<string, unknown>>;
}

function fmt(value: unknown) {
  if (typeof value === "number") return value.toLocaleString("fa-IR");
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return new Date(value).toLocaleString("fa-IR");
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export default function AdminTelegramPage() {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<TelegramAnalytics | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/telegram", { credentials: "include", cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "آمار تلگرام بارگذاری نشد");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "آمار تلگرام بارگذاری نشد");
    }
    setBusy(false);
  }, []);

  useEffect(() => { refreshUser().catch(() => undefined); }, [refreshUser]);
  useEffect(() => { if (!loading && (!user || !isAdmin)) router.push("/"); }, [loading, user, isAdmin, router]);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const statCards = useMemo(() => {
    const s = data?.stats || {};
    return [
      ["👥", "پیش‌ثبت‌نام", s.preRegistrations || 0],
      ["🔗", "حساب لینک‌شده", s.linkedAccounts || 0],
      ["🎮", "ثبت‌نام تلگرامی", s.telegramRegistrations || 0],
      ["🎁", "دعوت‌ها", s.referrals || 0],
      ["🕒", "لیست انتظار", s.waiting || 0],
      ["🎟", "کوپن مصرف‌شده", s.couponUses || 0],
      ["💰", "درآمد تلگرام", `${fmt(s.revenueToman || 0)} تومان`],
    ];
  }, [data]);

  if (loading || !user || !isAdmin) {
    return <div className="min-h-screen bg-dark-900 text-white"><Navbar /><div className="py-32 text-center text-5xl">🔒</div></div>;
  }

  return (
    <div className="min-h-screen bg-[#070711] text-white">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black">⚡ داشبورد تلگرام Gament</h1>
            <p className="text-gray-400 text-sm mt-2">آنالیتیکس ربات، کمپین‌ها، کوپن‌ها و تبدیل کاربران تلگرام</p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="gaming-btn text-xs">🔄 بروزرسانی</button>
            <Link href="/admin" className="px-4 py-3 rounded-xl bg-white/5 text-xs font-bold">پنل اصلی</Link>
          </div>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-2xl p-4 mb-6">{error}</div>}

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {busy ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="gaming-card p-5 h-24 animate-pulse" />) : statCards.map(([icon, label, value]) => (
            <div key={String(label)} className="gaming-card p-5">
              <div className="text-3xl mb-2">{icon}</div>
              <div className="text-2xl font-black text-neon-purple">{fmt(value)}</div>
              <div className="text-xs text-gray-500 mt-1">{label}</div>
            </div>
          ))}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <section className="gaming-card p-5">
            <h2 className="font-black mb-4">📣 کمپین‌ها</h2>
            <div className="space-y-3">
              {(data?.campaigns || []).map((row) => (
                <div key={row.campaign} className="flex items-center justify-between bg-white/[.03] rounded-2xl p-3">
                  <code className="text-cyan-300 text-xs">{row.campaign}</code>
                  <b>{fmt(row.events)}</b>
                </div>
              ))}
              {!data?.campaigns?.length && <p className="text-gray-500 text-sm">هنوز کمپینی ثبت نشده.</p>}
            </div>
          </section>

          <section className="gaming-card p-5">
            <h2 className="font-black mb-4">🎟 کوپن‌ها</h2>
            <div className="space-y-3">
              {(data?.coupons || []).map((row) => (
                <div key={row.code} className="flex items-center justify-between bg-white/[.03] rounded-2xl p-3">
                  <div><code className="text-fuchsia-300">{row.code}</code><div className="text-xs text-gray-500">{row.discountPercent}% تخفیف</div></div>
                  <div className="text-left"><b>{fmt(row.usedCount)}</b><div className={row.isActive ? "text-green-300 text-xs" : "text-red-300 text-xs"}>{row.isActive ? "فعال" : "غیرفعال"}</div></div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="gaming-card overflow-hidden">
          <div className="p-5 border-b border-white/10 font-black">آخرین پیش‌ثبت‌نام‌ها</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-white/[.03] text-gray-400"><tr>{["نام", "تلگرام", "شماره", "بازی", "وضعیت", "آخرین بروزرسانی"].map((h) => <th key={h} className="text-right p-3">{h}</th>)}</tr></thead>
              <tbody>
                {(data?.recentPreRegistrations || []).map((row, index) => (
                  <tr key={`${row.telegramId}-${index}`} className="border-t border-white/5">
                    <td className="p-3">{fmt(row.fullName)}</td>
                    <td className="p-3">{row.username ? `@${row.username}` : fmt(row.telegramId)}</td>
                    <td className="p-3">{fmt(row.phoneNumber)}</td>
                    <td className="p-3">{fmt(row.game)}</td>
                    <td className="p-3">{fmt(row.status)}</td>
                    <td className="p-3">{fmt(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
