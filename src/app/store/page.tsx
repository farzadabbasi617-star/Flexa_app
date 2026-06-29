"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Kind = "currency" | "account" | "item" | "service";
type Source = "official" | "user";

interface Listing {
  id: string;
  source: Source;
  kind: Kind;
  game: string | null;
  title: string;
  description: string | null;
  priceToman: number;
  currencyKind: string | null;
  currencyAmount: number | null;
  stock: number;
  soldCount: number;
  images: string[];
  sellerName: string | null;
}

// A unified filter. Currency types (gem/cp/uc/vbucks/...) are shown as their own
// chips so users immediately understand what they're browsing, while non-currency
// kinds (account/item/service) sit alongside them.
type FilterId = "all" | "gem" | "cp" | "uc" | "vbucks" | "account" | "item" | "service";

const FILTERS: Array<{ id: FilterId; label: string; icon: string; param: "kind" | "currencyKind" | null }> = [
  { id: "all", label: "همه", icon: "🛍️", param: null },
  { id: "gem", label: "جم (Gem)", icon: "💎", param: "currencyKind" },
  { id: "uc", label: "UC", icon: "🔷", param: "currencyKind" },
  { id: "cp", label: "CP", icon: "🟡", param: "currencyKind" },
  { id: "vbucks", label: "وی‌باکس (V-Bucks)", icon: "🟣", param: "currencyKind" },
  { id: "account", label: "اکانت بازی", icon: "🎮", param: "kind" },
  { id: "item", label: "آیتم", icon: "🎁", param: "kind" },
  { id: "service", label: "خدمات", icon: "⚙️", param: "kind" },
];

const KIND_ICONS: Record<string, string> = {
  currency: "💎", account: "🎮", item: "🎁", service: "⚙️",
};

const SOURCES: Array<{ id: "all" | Source; label: string }> = [
  { id: "all", label: "همه" },
  { id: "official", label: "فروشگاه رسمی گیمنت" },
  { id: "user", label: "فروش کاربران" },
];

const CURRENCY_LABELS: Record<string, string> = {
  gem: "جم", cp: "CP", uc: "UC", vbucks: "وی‌باکس", coin: "سکه", gold: "طلا", other: "ارز",
};

function toman(n: number) {
  return `${n.toLocaleString("fa-IR")} تومان`;
}

export default function StorePage() {
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterId>("all");
  const [source, setSource] = useState<"all" | Source>("all");
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    const active = FILTERS.find((f) => f.id === filter);
    if (active && active.param) params.set(active.param, filter);
    if (source !== "all") params.set("source", source);
    try {
      const res = await fetch(`/api/store/listings?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter, source]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function buy(listing: Listing) {
    if (buyingId) return;
    setBuyingId(listing.id);
    try {
      const res = await fetch("/api/store/orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ listingId: listing.id, quantity: 1 }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setToast({ type: "err", text: "برای خرید ابتدا وارد شوید." });
        } else {
          setToast({ type: "err", text: data.error || "خرید ناموفق بود." });
        }
        return;
      }
      setToast({ type: "ok", text: "سفارش ثبت شد و مبلغ به‌صورت امانی نگه داشته شد. در «سفارش‌های من» پیگیری کنید." });
      load();
    } catch {
      setToast({ type: "err", text: "خطای ارتباط با سرور." });
    } finally {
      setBuyingId(null);
    }
  }

  const empty = useMemo(() => !loading && items.length === 0, [loading, items]);

  return (
    <main className="min-h-[100dvh] bg-[#06060f] text-white pb-28">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-white/10 bg-gradient-to-b from-purple-900/30 to-transparent px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-black sm:text-4xl">🛒 فروشگاه گیمنت</h1>
              <p className="mt-2 text-sm text-gray-400">
                خرید و فروش امن جم، UC، CP، وی‌باکس، اکانت و آیتم بازی‌ها — با پرداخت امانی (اسکرو)
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/store/orders" className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-bold transition hover:bg-white/10">
                📦 سفارش‌های من
              </Link>
              <Link href="/store/sell" className="rounded-2xl bg-purple-600 px-4 py-2.5 text-sm font-black shadow-lg shadow-purple-700/30 transition hover:bg-purple-500">
                + ثبت آگهی فروش
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Filters */}
        <div className="mb-5 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${
                filter === f.id ? "bg-purple-600 text-white" : "border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              <span className="ml-1">{f.icon}</span> {f.label}
            </button>
          ))}
        </div>
        <div className="mb-6 flex flex-wrap gap-2">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              onClick={() => setSource(s.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                source === s.id ? "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-56 animate-pulse rounded-3xl border border-white/10 bg-white/[0.04]" />
            ))}
          </div>
        ) : empty ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] py-16 text-center">
            <div className="text-5xl">🗃️</div>
            <p className="mt-4 font-bold text-gray-300">فعلاً محصولی در این دسته وجود ندارد.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((it) => (
              <article key={it.id} className="flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] transition hover:border-purple-400/40">
                <Link href={`/store/${it.id}`} className="relative block aspect-square w-full overflow-hidden bg-gradient-to-br from-purple-900/40 to-cyan-900/20">
                  {it.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.images[0]} alt={it.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-5xl opacity-60">
                      {KIND_ICONS[it.kind] || "🛍️"}
                    </div>
                  )}
                  <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black ${
                    it.source === "official" ? "bg-yellow-500/90 text-black" : "bg-black/60 text-cyan-200"
                  }`}>
                    {it.source === "official" ? "رسمی گیمنت" : "فروش کاربر"}
                  </span>
                </Link>
                <div className="flex flex-1 flex-col p-3">
                  <Link href={`/store/${it.id}`} className="line-clamp-2 text-sm font-black leading-6 hover:text-purple-200">{it.title}</Link>
                  {it.kind === "currency" && (
                    <span className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-purple-500/20 px-2 py-0.5 text-[11px] font-black text-purple-200 ring-1 ring-purple-400/30">
                      💎 {it.currencyAmount ? `${it.currencyAmount.toLocaleString("fa-IR")} ` : ""}{CURRENCY_LABELS[it.currencyKind || "other"]}
                    </span>
                  )}
                  {it.source === "user" && it.sellerName && (
                    <p className="mt-1 text-[10px] text-gray-500">فروشنده: {it.sellerName}</p>
                  )}
                  <div className="mt-auto pt-3">
                    <div className="text-base font-black text-purple-200">{toman(it.priceToman)}</div>
                    <button
                      onClick={() => buy(it)}
                      disabled={buyingId === it.id || it.stock <= 0}
                      className="mt-2 w-full rounded-2xl bg-purple-600 py-2.5 text-xs font-black text-white transition active:scale-95 hover:bg-purple-500 disabled:opacity-40"
                    >
                      {it.stock <= 0 ? "ناموجود" : buyingId === it.id ? "در حال ثبت..." : "خرید"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-bold shadow-2xl ${
          toast.type === "ok" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.text}
        </div>
      )}
    </main>
  );
}
