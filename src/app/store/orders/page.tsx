"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Order {
  id: string;
  title: string | null;
  kind: string | null;
  source: "official" | "user";
  quantity: number;
  totalPriceToman: number;
  status: string;
  iAmBuyer: boolean;
  iAmSeller: boolean;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending_payment: { label: "در انتظار پرداخت", cls: "bg-gray-500/20 text-gray-300" },
  paid_escrow: { label: "پرداخت‌شده (امانی)", cls: "bg-blue-500/20 text-blue-300" },
  delivered: { label: "تحویل داده شد", cls: "bg-cyan-500/20 text-cyan-300" },
  completed: { label: "تکمیل‌شده", cls: "bg-green-500/20 text-green-300" },
  disputed: { label: "در حال اعتراض", cls: "bg-orange-500/20 text-orange-300" },
  refunded: { label: "بازپرداخت‌شده", cls: "bg-purple-500/20 text-purple-300" },
  cancelled: { label: "لغو شد", cls: "bg-red-500/20 text-red-300" },
};

function toman(n: number) { return `${n.toLocaleString("fa-IR")} تومان`; }

export default function OrdersPage() {
  const [items, setItems] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Record<string, string | null>>({});
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/store/orders", { cache: "no-store", credentials: "include" });
      if (res.status === 401) { setItems([]); setMsg({ type: "err", text: "برای مشاهده سفارش‌ها وارد شوید." }); return; }
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 4000); return () => clearTimeout(t); }, [msg]);

  async function act(id: string, action: "deliver" | "confirm" | "dispute" | "cancel") {
    if (busyId) return;
    let reason: string | undefined;
    if (action === "dispute") {
      reason = window.prompt("دلیل اعتراض را بنویسید:") || undefined;
      if (!reason) return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/store/orders/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ action, reason }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ type: "err", text: data.error || "عملیات ناموفق بود." }); return; }
      setMsg({ type: "ok", text: "انجام شد." });
      load();
    } catch {
      setMsg({ type: "err", text: "خطای ارتباط." });
    } finally {
      setBusyId(null);
    }
  }

  async function showDelivery(id: string) {
    try {
      const res = await fetch(`/api/store/orders/${id}`, { cache: "no-store", credentials: "include" });
      const data = await res.json();
      setReveal((p) => ({ ...p, [id]: data?.order?.deliveryNotes ?? "اطلاعات تحویل ثبت نشده است." }));
    } catch {
      setReveal((p) => ({ ...p, [id]: "خطا در دریافت اطلاعات." }));
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[#06060f] px-4 py-8 text-white sm:px-6 pb-28">
      <div className="mx-auto max-w-3xl">
        <Link href="/store" className="text-sm text-gray-400 hover:text-white">← بازگشت به فروشگاه</Link>
        <h1 className="mt-3 text-2xl font-black sm:text-3xl">📦 سفارش‌های من</h1>

        {loading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-3xl border border-white/10 bg-white/[0.04]" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.03] py-16 text-center">
            <div className="text-5xl">🧾</div>
            <p className="mt-4 font-bold text-gray-300">هنوز سفارشی ندارید.</p>
            <Link href="/store" className="mt-4 inline-block rounded-2xl bg-purple-600 px-5 py-2.5 text-sm font-black">رفتن به فروشگاه</Link>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {items.map((o) => {
              const st = STATUS_LABELS[o.status] || { label: o.status, cls: "bg-gray-500/20 text-gray-300" };
              return (
                <div key={o.id} className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black">{o.title || "کالا"}</h3>
                      <p className="mt-1 text-xs text-gray-500">
                        {o.iAmBuyer ? "🛒 خریدار" : "🏷️ فروشنده"} · تعداد {o.quantity.toLocaleString("fa-IR")}
                        {o.source === "official" && " · فروشگاه رسمی"}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="mt-2 text-sm font-black text-purple-200">{toman(o.totalPriceToman)}</div>

                  {/* Actions */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {/* Seller delivers */}
                    {o.iAmSeller && o.status === "paid_escrow" && (
                      <button onClick={() => act(o.id, "deliver")} disabled={busyId === o.id} className="rounded-xl bg-cyan-600 px-3 py-1.5 text-xs font-black disabled:opacity-40">تحویل دادم</button>
                    )}
                    {/* Buyer confirms / disputes / reveals */}
                    {o.iAmBuyer && ["paid_escrow", "delivered"].includes(o.status) && (
                      <>
                        <button onClick={() => act(o.id, "confirm")} disabled={busyId === o.id} className="rounded-xl bg-green-600 px-3 py-1.5 text-xs font-black disabled:opacity-40">تأیید دریافت</button>
                        <button onClick={() => act(o.id, "dispute")} disabled={busyId === o.id} className="rounded-xl bg-orange-600 px-3 py-1.5 text-xs font-black disabled:opacity-40">اعتراض</button>
                      </>
                    )}
                    {o.iAmBuyer && ["delivered", "completed"].includes(o.status) && (
                      <button onClick={() => showDelivery(o.id)} className="rounded-xl border border-white/20 px-3 py-1.5 text-xs font-black">نمایش اطلاعات تحویل</button>
                    )}
                  </div>

                  {reveal[o.id] && (
                    <div className="mt-3 whitespace-pre-wrap rounded-2xl bg-black/40 p-3 text-xs text-gray-200 ring-1 ring-white/10">
                      {reveal[o.id]}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {msg && (
          <div className={`fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-bold shadow-2xl ${msg.type === "ok" ? "bg-green-600" : "bg-red-600"}`}>
            {msg.text}
          </div>
        )}
      </div>
    </main>
  );
}
