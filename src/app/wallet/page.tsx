"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";

interface WalletData {
  wallet: { balanceToman: number; balanceRial: string; currency: string };
  transactions: Array<{
    id: string;
    amountToman: number;
    type: string;
    status: string;
    referenceId: string | null;
    metadata: unknown;
    createdAt: string;
  }>;
}

const TYPE_LABELS: Record<string, string> = {
  deposit: "شارژ کیف پول",
  withdrawal: "برداشت",
  tournament_win: "جایزه تورنومنت",
  entry_fee: "ورودی تورنومنت",
  refund: "برگشت وجه",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "در انتظار",
  completed: "تکمیل‌شده",
  failed: "ناموفق",
  cancelled: "لغوشده",
};

export default function WalletPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<WalletData | null>(null);
  const [busy, setBusy] = useState(true);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/wallet/transactions", { cache: "no-store", credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "کیف پول بارگذاری نشد");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "کیف پول بارگذاری نشد");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (user) load();
    else setBusy(false);
  }, [user, load]);

  const pendingDeposits = useMemo(() => data?.transactions.filter((tx) => tx.type === "deposit" && tx.status === "pending") || [], [data]);

  async function requestDeposit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/wallet/transactions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ amountToman: amount, note }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "درخواست شارژ ثبت نشد");
      setMessage(json.message || "درخواست شارژ ثبت شد");
      setAmount("");
      setNote("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "درخواست شارژ ثبت نشد");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || busy) {
    return <div className="min-h-screen bg-dark-900 text-white flex items-center justify-center"><div className="text-4xl animate-neon-pulse">💳</div></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-dark-900 text-white">
        <Navbar />
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <div className="gaming-card p-8">
            <div className="text-6xl mb-4">💳</div>
            <h1 className="text-2xl font-black mb-3">برای مشاهده کیف پول وارد شو</h1>
            <Link href="/login" className="gaming-btn w-full">ورود</Link>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050508] text-white relative overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_-10%,rgba(92,0,160,.62),transparent_70%)]" />
      <Navbar />
      <main className="relative z-10 max-w-[680px] mx-auto px-4 sm:px-6 py-8 pb-32">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-black neon-text-purple">💳 کیف پول</h1>
            <p className="text-gray-500 text-sm mt-2">موجودی، شارژ و تاریخچه تراکنش‌ها</p>
          </div>
          <button onClick={load} className="px-4 py-3 rounded-xl bg-dark-700 text-sm font-bold">🔄</button>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 mb-5 text-sm">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 rounded-xl p-3 mb-5 text-sm">{message}</div>}

        <section className="glass-panel p-7 mb-6 bg-gradient-to-br from-purple-900/30 to-[#0a0a0e] border-purple-500/20">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-purple-400">موجودی قابل استفاده</p>
            {pendingDeposits.length > 0 && (
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                {pendingDeposits.length} در انتظار
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-6xl font-black tracking-tighter num-en">
              {(data?.wallet.balanceToman || 0).toLocaleString("fa-IR")}
            </span>
            <span className="text-xl font-bold text-purple-400">تومان</span>
          </div>
        </section>

        <form onSubmit={requestDeposit} className="glass-panel p-5 mb-6 space-y-4">
          <div>
            <h2 className="font-black mb-1">درخواست شارژ کیف پول</h2>
            <p className="text-xs text-gray-500">تا اتصال درگاه، درخواست‌ها توسط مدیریت تأیید می‌شوند.</p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input 
              className="gaming-input" 
              placeholder="مبلغ (تومان)" 
              value={amount} 
              onChange={(e) => setAmount(e.target.value)} 
            />
            <input 
              className="gaming-input sm:col-span-2" 
              placeholder="توضیح اختیاری" 
              value={note} 
              onChange={(e) => setNote(e.target.value)} 
            />
          </div>
          
          <button 
            disabled={submitting} 
            className="gaming-btn w-full disabled:opacity-60"
          >
            {submitting ? "در حال ثبت..." : "ثبت درخواست شارژ (درگاه واقعی بعداً)"}
          </button>

          {/* دکمه پرداخت آنلاین (زیرساخت آماده) */}
          <button
            type="button"
            onClick={() => alert("این دکمه بعداً به درگاه واقعی متصل می‌شود")}
            className="w-full py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-sm font-bold border border-white/10 transition-colors"
          >
            پرداخت آنلاین با درگاه بانکی (به‌زودی)
          </button>
        </form>

        <section className="glass-panel overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <span className="font-black">تاریخچه تراکنش‌ها</span>
            <span className="text-xs text-gray-500">{data?.transactions.length || 0} مورد</span>
          </div>
          
          {data?.transactions.length ? (
            <div className="divide-y divide-white/10 text-sm">
              {data.transactions.map((tx) => (
                <div key={tx.id} className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <div className="font-bold">{TYPE_LABELS[tx.type] || tx.type}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {new Date(tx.createdAt).toLocaleString("fa-IR")} • {STATUS_LABELS[tx.status] || tx.status}
                    </div>
                  </div>
                  <div className={`font-black num-en ${tx.type === "entry_fee" || tx.type === "withdrawal" ? "text-red-400" : "text-emerald-400"}`}>
                    {tx.type === "entry_fee" || tx.type === "withdrawal" ? "-" : "+"}
                    {tx.amountToman.toLocaleString("fa-IR")}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500 text-sm">هنوز تراکنشی ثبت نشده است.</div>
          )}
        </section>
      </main>
      <BottomNav />
    </div>
  );
}
