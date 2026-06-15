"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

interface WalletRow {
  walletId: string | null;
  userId: string;
  displayName: string;
  username: string | null;
  phoneNumber: string;
  role: string;
  balanceToman: number;
  currency: string | null;
  updatedAt: string | null;
}

export default function AdminWalletsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<WalletRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<WalletRow | null>(null);
  const [amountToman, setAmountToman] = useState("");
  const [direction, setDirection] = useState<"increase" | "decrease">("increase");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/wallets", { cache: "no-store" });
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [loading, user, isAdmin, router]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  }, [query, rows]);

  async function adjust(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/wallets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ userId: selected.userId, amountToman, direction, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ذخیره نشد");
      setSelected(null);
      setAmountToman("");
      setReason("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ذخیره نشد");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <button onClick={() => router.push("/admin")} className="text-gray-500 hover:text-white mb-4">← بازگشت</button>
        <h1 className="text-3xl font-black neon-text-purple mb-2">💳 مدیریت کیف پول‌ها</h1>
        <p className="text-gray-500 text-sm mb-6">افزایش/کاهش دستی موجودی همراه با ثبت تراکنش و لاگ مدیریتی</p>
        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 mb-5 text-sm">{error}</div>}
        <input className="gaming-input max-w-md mb-5" placeholder="جستجوی کاربر..." value={query} onChange={(e) => setQuery(e.target.value)} />

        {selected && (
          <form onSubmit={adjust} className="gaming-card p-5 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-4 animate-slide-up">
            <div className="sm:col-span-4 text-sm text-gray-300">اصلاح موجودی برای <b>{selected.displayName}</b> — موجودی فعلی: {selected.balanceToman.toLocaleString("fa-IR")} تومان</div>
            <select className="gaming-select" value={direction} onChange={(e) => setDirection(e.target.value as "increase" | "decrease")}><option value="increase">افزایش</option><option value="decrease">کاهش</option></select>
            <input className="gaming-input" placeholder="مبلغ تومان" value={amountToman} onChange={(e) => setAmountToman(e.target.value)} />
            <input className="gaming-input sm:col-span-2" placeholder="دلیل اصلاح" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button disabled={saving} className="gaming-btn disabled:opacity-50">ثبت اصلاح</button>
            <button type="button" onClick={() => setSelected(null)} className="px-4 py-3 rounded-xl bg-dark-700 text-gray-300">انصراف</button>
          </form>
        )}

        {busy ? <div className="text-center py-20 text-4xl animate-neon-pulse">💳</div> : (
          <div className="gaming-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-dark-800 text-gray-400"><tr><th className="p-3 text-right">کاربر</th><th className="p-3 text-right">موبایل</th><th className="p-3 text-right">نقش</th><th className="p-3 text-right">موجودی</th><th className="p-3 text-right">عملیات</th></tr></thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.userId} className="border-t border-white/5 hover:bg-white/[.03]">
                      <td className="p-3"><div className="font-bold">{row.displayName}</div><div className="text-xs text-gray-500">@{row.username || "-"}</div></td>
                      <td className="p-3" dir="ltr">{row.phoneNumber}</td>
                      <td className="p-3">{row.role}</td>
                      <td className="p-3 font-black text-neon-green">{row.balanceToman.toLocaleString("fa-IR")} تومان</td>
                      <td className="p-3"><button onClick={() => setSelected(row)} className="text-neon-blue text-xs font-bold">اصلاح موجودی</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
