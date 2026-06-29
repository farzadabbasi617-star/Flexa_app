"use client";

import { useCallback, useEffect, useState } from "react";
import Navbar from "@/components/Navbar";

type Tab = "kyc" | "listings" | "orders";

interface KycRow {
  id: string;
  userId: string;
  fullName: string;
  nationalId: string;
  birthDate: string | null;
  idCardImageUrl: string;
  selfieImageUrl: string;
  status: string;
  displayName: string | null;
  phoneNumber: string | null;
  gamentId: string | null;
}
interface ListingRow {
  id: string;
  source: string;
  sellerName: string | null;
  kind: string;
  title: string;
  priceToman: number;
  stock: number;
  status: string;
}
interface OrderRow {
  id: string;
  title: string | null;
  buyerName: string | null;
  source: string;
  totalPriceToman: number;
  status: string;
  disputeReason: string | null;
}

function toman(n: number) { return `${n.toLocaleString("fa-IR")} تومان`; }

export default function AdminStorePage() {
  const [tab, setTab] = useState<Tab>("kyc");
  const [kyc, setKyc] = useState<KycRow[]>([]);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "kyc") {
        const r = await fetch("/api/admin/store/kyc?status=pending", { cache: "no-store", credentials: "include" });
        const d = await r.json(); setKyc(Array.isArray(d.items) ? d.items : []);
      } else if (tab === "listings") {
        const r = await fetch("/api/admin/store/listings?status=pending_review", { cache: "no-store", credentials: "include" });
        const d = await r.json(); setListings(Array.isArray(d.items) ? d.items : []);
      } else {
        const r = await fetch("/api/admin/store/orders?status=disputed", { cache: "no-store", credentials: "include" });
        const d = await r.json(); setOrders(Array.isArray(d.items) ? d.items : []);
      }
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t); }, [msg]);

  async function reviewKyc(id: string, decision: "verified" | "rejected") {
    const rejectionReason = decision === "rejected" ? window.prompt("دلیل رد:") || "" : undefined;
    if (decision === "rejected" && !rejectionReason) return;
    const r = await fetch("/api/admin/store/kyc", {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, decision, rejectionReason }),
    });
    setMsg(r.ok ? "انجام شد" : "خطا"); load();
  }
  async function reviewListing(id: string, decision: "approve" | "reject") {
    const rejectionReason = decision === "reject" ? window.prompt("دلیل رد:") || "" : undefined;
    if (decision === "reject" && !rejectionReason) return;
    const r = await fetch("/api/admin/store/listings", {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, decision, rejectionReason }),
    });
    setMsg(r.ok ? "انجام شد" : "خطا"); load();
  }
  async function resolveOrder(id: string, resolution: "refund_buyer" | "release_seller") {
    const reason = window.prompt("یادداشت (اختیاری):") || undefined;
    const r = await fetch("/api/admin/store/orders", {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, resolution, reason }),
    });
    setMsg(r.ok ? "انجام شد" : "خطا"); load();
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "kyc", label: "احراز هویت" },
    { id: "listings", label: "آگهی‌های در انتظار" },
    { id: "orders", label: "اختلافات" },
  ];

  return (
    <>
      <Navbar />
      <main className="min-h-[100dvh] bg-[#06060f] px-4 py-6 text-white sm:px-6">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-2xl font-black">مدیریت فروشگاه</h1>

          <div className="mt-4 flex gap-2">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${tab === t.id ? "bg-purple-600" : "border border-white/10 bg-white/5 text-gray-300"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="mt-8 text-gray-400">در حال بارگذاری...</p>
          ) : (
            <div className="mt-6 space-y-3">
              {tab === "kyc" && (kyc.length === 0 ? <Empty /> : kyc.map((k) => (
                <div key={k.id} className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black">{k.fullName} <span className="text-xs text-gray-500">({k.displayName})</span></h3>
                      <p className="mt-1 text-xs text-gray-400">کد ملی: {k.nationalId} · {k.phoneNumber} · {k.gamentId}</p>
                      <div className="mt-2 flex gap-2 text-xs">
                        <a href={k.idCardImageUrl} target="_blank" rel="noreferrer" className="text-cyan-300 underline">کارت ملی</a>
                        <a href={k.selfieImageUrl} target="_blank" rel="noreferrer" className="text-cyan-300 underline">سلفی</a>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => reviewKyc(k.id, "verified")} className="rounded-xl bg-green-600 px-3 py-1.5 text-xs font-black">تأیید</button>
                      <button onClick={() => reviewKyc(k.id, "rejected")} className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-black">رد</button>
                    </div>
                  </div>
                </div>
              )))}

              {tab === "listings" && (listings.length === 0 ? <Empty /> : listings.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                  <div>
                    <h3 className="font-black">{l.title}</h3>
                    <p className="mt-1 text-xs text-gray-400">{l.kind} · {toman(l.priceToman)} · موجودی {l.stock} · فروشنده: {l.sellerName || "—"}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => reviewListing(l.id, "approve")} className="rounded-xl bg-green-600 px-3 py-1.5 text-xs font-black">تأیید</button>
                    <button onClick={() => reviewListing(l.id, "reject")} className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-black">رد</button>
                  </div>
                </div>
              )))}

              {tab === "orders" && (orders.length === 0 ? <Empty /> : orders.map((o) => (
                <div key={o.id} className="rounded-3xl border border-orange-500/30 bg-orange-500/5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black">{o.title || "کالا"}</h3>
                      <p className="mt-1 text-xs text-gray-400">خریدار: {o.buyerName || "—"} · {toman(o.totalPriceToman)}</p>
                      {o.disputeReason && <p className="mt-2 rounded-xl bg-black/40 p-2 text-xs text-orange-200">دلیل: {o.disputeReason}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => resolveOrder(o.id, "refund_buyer")} className="rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-black">بازپرداخت خریدار</button>
                      <button onClick={() => resolveOrder(o.id, "release_seller")} className="rounded-xl bg-green-600 px-3 py-1.5 text-xs font-black">آزادسازی به فروشنده</button>
                    </div>
                  </div>
                </div>
              )))}
            </div>
          )}

          {msg && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-2xl bg-purple-600 px-5 py-3 text-sm font-bold shadow-2xl">{msg}</div>}
        </div>
      </main>
    </>
  );
}

function Empty() {
  return <div className="rounded-3xl border border-white/10 bg-white/[0.03] py-12 text-center text-gray-400">موردی برای نمایش نیست.</div>;
}
