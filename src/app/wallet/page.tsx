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

        <section className="gaming-card p-7 mb-6 bg-gradient-to-br from-purple-900/40 to-dark-800">
          <p className="text-xs text-purple-300 mb-2">موجودی قابل استفاده</p>
          <div className="text-5xl font-black text-white mb-2">{(data?.wallet.balanceToman || 0).toLocaleString("fa-IR")}</div>
          <p className="text-sm text-gray-500">تومان</p>
          {pendingDeposits.length > 0 && <p className="mt-4 text-xs text-yellow-300">{pendingDeposits.length.toLocaleString("fa-IR")} درخواست شارژ در انتظار تأیید مدیریت داری.</p>}
        </section>

        <form onSubmit={requestDeposit} className="gaming-card p-5 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-3">
            <h2 className="font-black mb-2">درخواست شارژ کیف پول</h2>
            <p className="text-xs text-gray-500 leading-6">تا زمان اتصال درگاه پرداخت، درخواست شارژ توسط مدیریت بررسی و تأیید می‌شود.</p>
          </div>
          <input className="gaming-input" placeholder="مبلغ تومان" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className="gaming-input sm:col-span-2" placeholder="توضیح اختیاری / شماره پیگیری" value={note} onChange={(e) => setNote(e.target.value)} />
          <button disabled={submitting} className="gaming-btn sm:col-span-3 disabled:opacity-50">{submitting ? "در حال ثبت..." : "ثبت درخواست شارژ"}</button>
        </form>

        <section className="gaming-card overflow-hidden">
          <div className="p-4 border-b border-white/5 font-black">تاریخچه تراکنش‌ها</div>
          {data?.transactions.length ? (
            <div className="divide-y divide-white/5">
              {data.transactions.map((tx) => (
                <div key={tx.id} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-bold text-sm">{TYPE_LABELS[tx.type] || tx.type}</div>
                    <div className="text-xs text-gray-500 mt-1">{new Date(tx.createdAt).toLocaleString("fa-IR")} • {STATUS_LABELS[tx.status] || tx.status}</div>
                  </div>
                  <div className={`font-black ${tx.type === "entry_fee" || tx.type === "withdrawal" ? "text-red-300" : "text-green-300"}`}>
                    {tx.type === "entry_fee" || tx.type === "withdrawal" ? "-" : "+"}{tx.amountToman.toLocaleString("fa-IR")} تومان
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">هنوز تراکنشی ثبت نشده است.</div>
          )}
        </section>
      </main>
      <BottomNav />
    </div>
  );
}
