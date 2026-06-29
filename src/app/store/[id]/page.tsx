"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Listing {
  id: string;
  source: "official" | "user";
  kind: string;
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
  sellerVerified: boolean | null;
}

const KIND_LABELS: Record<string, string> = {
  currency: "ارز داخل بازی", account: "اکانت بازی", item: "آیتم", service: "خدمات",
};
const GAME_LABELS: Record<string, string> = {
  clash_royale: "کلش رویال", cod_mobile: "کالاف دیوتی موبایل", fortnite: "فورتنایت",
};
const CURRENCY_LABELS: Record<string, string> = {
  gem: "جم", cp: "CP", uc: "UC", vbucks: "وی‌باکس", coin: "سکه", gold: "طلا", other: "ارز",
};

function toman(n: number) { return `${n.toLocaleString("fa-IR")} تومان`; }

export default function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [buying, setBuying] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch(`/api/store/listings/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setListing(d.listing))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 4000); return () => clearTimeout(t); }, [msg]);

  async function buy() {
    if (!listing || buying) return;
    setBuying(true);
    try {
      const res = await fetch("/api/store/orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ listingId: listing.id, quantity: qty }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setMsg({ type: "err", text: "برای خرید ابتدا وارد شوید." });
          setTimeout(() => router.push("/login"), 1200);
        } else {
          setMsg({ type: "err", text: data.error || "خرید ناموفق بود." });
        }
        return;
      }
      setMsg({ type: "ok", text: "سفارش ثبت شد و مبلغ امانی نگه داشته شد." });
      setTimeout(() => router.push("/store/orders"), 1200);
    } catch {
      setMsg({ type: "err", text: "خطای ارتباط با سرور." });
    } finally {
      setBuying(false);
    }
  }

  if (loading) {
    return <main className="grid min-h-[60dvh] place-items-center bg-[#06060f] text-white">در حال بارگذاری...</main>;
  }
  if (notFound || !listing) {
    return (
      <main className="grid min-h-[60dvh] place-items-center bg-[#06060f] px-6 text-center text-white">
        <div>
          <div className="text-5xl">🔍</div>
          <p className="mt-4 font-bold">این محصول یافت نشد یا غیرفعال شده است.</p>
          <Link href="/store" className="mt-4 inline-block rounded-2xl bg-purple-600 px-5 py-2.5 text-sm font-black">بازگشت به فروشگاه</Link>
        </div>
      </main>
    );
  }

  const images = listing.images?.length ? listing.images : [];
  const totalToman = listing.priceToman * qty;

  return (
    <main className="min-h-[100dvh] bg-[#06060f] px-4 py-6 text-white sm:px-6 pb-28">
      <div className="mx-auto max-w-5xl">
        <Link href="/store" className="text-sm text-gray-400 hover:text-white">← بازگشت به فروشگاه</Link>

        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          {/* Gallery */}
          <div>
            <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-purple-900/40 to-cyan-900/20">
              {images[activeImg] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={images[activeImg]} alt={listing.title} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-7xl opacity-50">🛍️</div>
              )}
              <span className={`absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-black ${listing.source === "official" ? "bg-yellow-500/90 text-black" : "bg-black/60 text-cyan-200"}`}>
                {listing.source === "official" ? "رسمی گیمنت" : "فروش کاربر"}
              </span>
            </div>
            {images.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {images.map((img, i) => (
                  <button key={i} onClick={() => setActiveImg(i)} className={`h-16 w-16 shrink-0 overflow-hidden rounded-2xl border ${activeImg === i ? "border-purple-400" : "border-white/10"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white/10 px-3 py-1 font-bold">
                {listing.kind === "currency"
                  ? CURRENCY_LABELS[listing.currencyKind || "other"]
                  : KIND_LABELS[listing.kind] || listing.kind}
              </span>
              {listing.game && <span className="rounded-full bg-white/10 px-3 py-1 font-bold">{GAME_LABELS[listing.game] || listing.game}</span>}
            </div>

            <h1 className="mt-3 text-2xl font-black leading-9 sm:text-3xl">{listing.title}</h1>

            {listing.kind === "currency" && listing.currencyAmount && (
              <p className="mt-2 text-purple-300">
                {listing.currencyAmount.toLocaleString("fa-IR")} {CURRENCY_LABELS[listing.currencyKind || "other"]}
              </p>
            )}

            {listing.source === "user" && (
              <p className="mt-2 text-sm text-gray-400">
                فروشنده: <span className="font-bold text-gray-200">{listing.sellerName || "کاربر"}</span>
                {listing.sellerVerified && <span className="mr-1 text-green-400">✔ احراز‌شده</span>}
              </p>
            )}

            <div className="mt-4 text-3xl font-black text-purple-200">{toman(listing.priceToman)}</div>
            <p className="mt-1 text-xs text-gray-500">
              {listing.stock > 0 ? `موجودی: ${listing.stock.toLocaleString("fa-IR")}` : "ناموجود"}
              {listing.soldCount > 0 && ` · ${listing.soldCount.toLocaleString("fa-IR")} فروش`}
            </p>

            {listing.description && (
              <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-gray-200">
                {listing.description}
              </div>
            )}

            {/* Quantity + buy */}
            {listing.stock > 0 && (
              <div className="mt-5 flex items-center gap-3">
                {listing.kind !== "account" && (
                  <div className="flex items-center rounded-2xl border border-white/15">
                    <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-4 py-2.5 text-lg font-black">−</button>
                    <span className="min-w-[3rem] text-center font-black">{qty.toLocaleString("fa-IR")}</span>
                    <button onClick={() => setQty((q) => Math.min(listing.stock, q + 1))} className="px-4 py-2.5 text-lg font-black">＋</button>
                  </div>
                )}
                <button onClick={buy} disabled={buying} className="flex-1 rounded-2xl bg-purple-600 py-3.5 text-sm font-black shadow-lg shadow-purple-700/30 transition active:scale-95 hover:bg-purple-500 disabled:opacity-40">
                  {buying ? "در حال ثبت..." : `خرید · ${toman(totalToman)}`}
                </button>
              </div>
            )}

            <div className="mt-4 rounded-2xl bg-cyan-500/10 p-3 text-xs leading-6 text-cyan-200 ring-1 ring-cyan-400/30">
              🛡️ پرداخت شما به‌صورت امانی نزد گیمنت نگه داشته می‌شود و فقط پس از تأیید دریافت، به فروشنده پرداخت می‌شود.
            </div>
          </div>
        </div>
      </div>

      {msg && (
        <div className={`fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-bold shadow-2xl ${msg.type === "ok" ? "bg-green-600" : "bg-red-600"}`}>
          {msg.text}
        </div>
      )}
    </main>
  );
}
