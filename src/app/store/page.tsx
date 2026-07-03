"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";

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
  warrantyDays?: number;
  images: string[];
  sellerName: string | null;
}

// A unified filter. Currency types (gem/cp/uc/vbucks/...) are shown as their own
// chips so users immediately understand what they're browsing, while non-currency
// kinds (account/item/service) sit alongside them.
type FilterId = "all" | "gem" | "cp" | "uc" | "vbucks" | "account" | "item" | "service";

// Per-currency image icons (square 96x96, center-cropped) for crisp, uniform display.
const CURRENCY_ICONS: Record<string, string> = {
  gem: "/icons/currencies/gem.png",
  uc: "/icons/currencies/uc.png",
  cp: "/icons/currencies/cp.png",
  vbucks: "/icons/currencies/vbucks.png",
};

const FILTERS: Array<{ id: FilterId; label: string; emoji: string; img?: string; param: "kind" | "currencyKind" | null }> = [
  { id: "all", label: "همه", emoji: "🛍️", param: null },
  { id: "gem", label: "جم (Gem)", emoji: "💎", img: CURRENCY_ICONS.gem, param: "currencyKind" },
  { id: "uc", label: "UC", emoji: "🔷", img: CURRENCY_ICONS.uc, param: "currencyKind" },
  { id: "cp", label: "CP", emoji: "🟡", img: CURRENCY_ICONS.cp, param: "currencyKind" },
  { id: "vbucks", label: "وی‌باکس (V-Bucks)", emoji: "🟣", img: CURRENCY_ICONS.vbucks, param: "currencyKind" },
  { id: "account", label: "اکانت بازی", emoji: "🎮", param: "kind" },
  { id: "item", label: "آیتم", emoji: "🎁", param: "kind" },
  { id: "service", label: "خدمات", emoji: "⚙️", param: "kind" },
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
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "cheapest" | "expensive" | "bestselling">("newest");
  const [minToman, setMinToman] = useState("");
  const [maxToman, setMaxToman] = useState("");
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Debounce the search box so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    const active = FILTERS.find((f) => f.id === filter);
    if (active && active.param) params.set(active.param, filter);
    if (source !== "all") params.set("source", source);
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (sort !== "newest") params.set("sort", sort);
    if (minToman) params.set("minToman", minToman);
    if (maxToman) params.set("maxToman", maxToman);
    try {
      const res = await fetch(`/api/store/listings?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter, source, debouncedSearch, sort, minToman, maxToman]);

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
              <Link href="/store/price-estimate" className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-bold transition hover:bg-white/10">
                🧮 تخمین قیمت
              </Link>
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
              className={`flex items-center gap-2 rounded-2xl py-2 pl-4 pr-2.5 text-sm font-bold transition ${
                filter === f.id ? "bg-purple-600 text-white" : "border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              {f.img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.img} alt="" className="h-6 w-6 shrink-0 rounded-md object-cover" loading="lazy" decoding="async" />
              ) : (
                <span className="inline-grid h-6 w-6 shrink-0 place-items-center text-base">{f.emoji}</span>
              )}
              <span>{f.label}</span>
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

        {/* Search + sort + price range */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو در عنوان آگهی‌ها..."
            className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm outline-none transition placeholder:text-gray-600 focus:border-purple-400"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-purple-400"
          >
            <option value="newest">جدیدترین</option>
            <option value="cheapest">ارزان‌ترین</option>
            <option value="expensive">گران‌ترین</option>
            <option value="bestselling">پرفروش‌ترین</option>
          </select>
          <div className="flex items-center gap-2">
            <input
              value={minToman}
              onChange={(e) => setMinToman(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="از (تومان)"
              inputMode="numeric"
              dir="ltr"
              className="w-28 rounded-2xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-purple-400"
            />
            <span className="text-gray-500">—</span>
            <input
              value={maxToman}
              onChange={(e) => setMaxToman(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="تا (تومان)"
              inputMode="numeric"
              dir="ltr"
              className="w-28 rounded-2xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-purple-400"
            />
          </div>
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
                    <img src={it.images[0]} alt={it.title} className="h-full w-full object-cover" loading="lazy" decoding="async" />
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
                    <span className="mt-1.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-purple-500/20 py-0.5 pl-2.5 pr-1 text-[11px] font-black text-purple-200 ring-1 ring-purple-400/30">
                      {CURRENCY_ICONS[it.currencyKind || ""] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={CURRENCY_ICONS[it.currencyKind || ""]} alt="" className="h-4 w-4 shrink-0 rounded object-cover" loading="lazy" decoding="async" />
                      ) : (
                        <span>💎</span>
                      )}
                      {it.currencyAmount ? `${it.currencyAmount.toLocaleString("fa-IR")} ` : ""}{CURRENCY_LABELS[it.currencyKind || "other"]}
                    </span>
                  )}
                  {it.source === "user" && it.sellerName && (
                    <p className="mt-1 text-[10px] text-gray-500">فروشنده: {it.sellerName}</p>
                  )}
                  {it.warrantyDays ? (
                    <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-black text-green-300 ring-1 ring-green-500/30">
                      🛡️ {it.warrantyDays.toLocaleString("fa-IR")} روز گارانتی
                    </span>
                  ) : null}
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

      <BottomNav />
    </main>
  );
}
