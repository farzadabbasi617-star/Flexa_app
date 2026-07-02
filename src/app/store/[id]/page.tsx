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
  warrantyDays?: number;
  images: string[];
  sellerId: string | null;
  sellerName: string | null;
  sellerVerified: boolean | null;
}

interface SellerInfo {
  stats: {
    avgRating: number;
    reviewCount: number;
    completedSales: number;
    tierLabel: string;
  };
}

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  buyerName: string | null;
  createdAt: string;
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
const CURRENCY_ICONS: Record<string, string> = {
  gem: "/icons/currencies/gem.png",
  uc: "/icons/currencies/uc.png",
  cp: "/icons/currencies/cp.png",
  vbucks: "/icons/currencies/vbucks.png",
};

function toman(n: number) { return `${Math.round(n).toLocaleString("fa-IR")} تومان`; }

function roundNice(n: number, dir: "down" | "up" | "near" = "near"): number {
  if (n <= 0) return 0;
  let step = 1000;
  if (n >= 50_000_000) step = 1_000_000;
  else if (n >= 10_000_000) step = 500_000;
  else if (n >= 2_000_000) step = 100_000;
  else if (n >= 500_000) step = 50_000;
  else if (n >= 100_000) step = 10_000;
  else step = 5_000;
  const q = n / step;
  const r = dir === "down" ? Math.floor(q) : dir === "up" ? Math.ceil(q) : Math.round(q);
  return Math.max(step, r * step);
}

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
  const [seller, setSeller] = useState<SellerInfo | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  // Price-offer (negotiation) state.
  const [showOffer, setShowOffer] = useState(false);
  const [offerToman, setOfferToman] = useState("");
  const [offerMsg, setOfferMsg] = useState("");
  const [sendingOffer, setSendingOffer] = useState(false);

  useEffect(() => {
    fetch(`/api/store/listings/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        setListing(d.listing);
        // For user listings, load the seller's reputation + reviews.
        if (d.listing?.source === "user" && d.listing?.sellerId) {
          fetch(`/api/store/seller/${d.listing.sellerId}`, { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((s) => s && setSeller(s))
            .catch(() => {});
          fetch(`/api/store/reviews?sellerId=${d.listing.sellerId}`, { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : { items: [] }))
            .then((s) => setReviews(Array.isArray(s.items) ? s.items : []))
            .catch(() => {});
        }
      })
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

  async function sendOffer() {
    if (!listing || sendingOffer) return;
    const amount = Number(offerToman);
    if (!Number.isFinite(amount) || amount < 1000) {
      setMsg({ type: "err", text: "مبلغ پیشنهادی معتبر نیست." });
      return;
    }
    setSendingOffer(true);
    try {
      const res = await fetch("/api/store/offers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ listingId: listing.id, offerToman: Math.floor(amount), message: offerMsg || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setMsg({ type: "err", text: "برای پیشنهاد قیمت ابتدا وارد شوید." });
          setTimeout(() => router.push("/login"), 1200);
        } else {
          setMsg({ type: "err", text: data.error || "ثبت پیشنهاد ناموفق بود." });
        }
        return;
      }
      setMsg({ type: "ok", text: "پیشنهاد شما برای فروشنده ارسال شد. نتیجه را در «سفارش‌ها» می‌بینید." });
      setShowOffer(false);
      setOfferToman("");
      setOfferMsg("");
    } catch {
      setMsg({ type: "err", text: "خطای ارتباط با سرور." });
    } finally {
      setSendingOffer(false);
    }
  }

  async function reportListing() {
    if (!listing) return;
    const reasonKey = window.prompt(
      "دلیل گزارش را با شماره انتخاب کنید:\n1) کلاهبرداری\n2) آگهی جعلی\n3) قیمت نادرست\n4) محتوای نامناسب\n5) اکانت سرقتی\n6) سایر"
    );
    const map: Record<string, string> = {
      "1": "fraud", "2": "fake", "3": "wrong_price", "4": "inappropriate", "5": "stolen_account", "6": "other",
    };
    const reason = map[String(reasonKey || "").trim()];
    if (!reason) return;
    const details = window.prompt("توضیح (اختیاری):") || undefined;
    try {
      const res = await fetch("/api/store/reports", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ listingId: listing.id, sellerId: listing.sellerId, reason, details }),
      });
      if (res.status === 401) {
        setMsg({ type: "err", text: "برای گزارش ابتدا وارد شوید." });
        return;
      }
      setMsg(res.ok ? { type: "ok", text: "گزارش شما ثبت شد و بررسی می‌شود." } : { type: "err", text: "ثبت گزارش ناموفق بود." });
    } catch {
      setMsg({ type: "err", text: "خطای ارتباط." });
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
                <img src={images[activeImg]} alt={listing.title} className="h-full w-full object-cover" loading="lazy" decoding="async" />
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
                    <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 py-1 pl-3 pr-1.5 font-bold">
                {listing.kind === "currency" && CURRENCY_ICONS[listing.currencyKind || ""] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={CURRENCY_ICONS[listing.currencyKind || ""]} alt="" className="h-5 w-5 shrink-0 rounded object-cover" loading="lazy" decoding="async" />
                )}
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
              <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">
                    فروشنده: <span className="font-bold text-gray-100">{listing.sellerName || "کاربر"}</span>
                    {listing.sellerVerified && <span className="mr-1 text-green-400">✔ احراز‌شده</span>}
                  </span>
                  {seller && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-black text-amber-300 ring-1 ring-amber-500/30">
                      {seller.stats.tierLabel}
                    </span>
                  )}
                </div>
                {seller && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                    <span className="text-amber-300">
                      {seller.stats.avgRating > 0 ? `★ ${seller.stats.avgRating.toLocaleString("fa-IR")}` : "بدون امتیاز"}
                      {seller.stats.reviewCount > 0 && ` (${seller.stats.reviewCount.toLocaleString("fa-IR")} نظر)`}
                    </span>
                    <span>· {seller.stats.completedSales.toLocaleString("fa-IR")} فروش موفق</span>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 text-3xl font-black text-purple-200">{toman(listing.priceToman)}</div>
            <p className="mt-1 text-xs text-gray-500">
              {listing.stock > 0 ? `موجودی: ${listing.stock.toLocaleString("fa-IR")}` : "ناموجود"}
              {listing.soldCount > 0 && ` · ${listing.soldCount.toLocaleString("fa-IR")} فروش`}
            </p>
            {listing.warrantyDays ? (
              <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-500/15 px-3 py-1 text-xs font-black text-green-300 ring-1 ring-green-500/30">
                🛡️ {listing.warrantyDays.toLocaleString("fa-IR")} روز گارانتی
              </p>
            ) : null}

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

            {/* Price negotiation (only for user listings) */}
            {listing.source === "user" && listing.stock > 0 && (
              <div className="mt-3">
                {!showOffer ? (
                  <button
                    onClick={() => {
                      setShowOffer(true);
                      // Suggest a starting offer around 90% of the sticker price.
                      if (!offerToman) setOfferToman(String(Math.round((listing.priceToman * 0.9) / 1000) * 1000));
                    }}
                    className="w-full rounded-2xl border border-cyan-400/40 bg-cyan-500/10 py-3 text-sm font-black text-cyan-200 transition hover:bg-cyan-500/20"
                  >
                    💬 پیشنهاد قیمت به فروشنده
                  </button>
                ) : (
                  <div className="rounded-2xl border border-cyan-400/30 bg-black/30 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black text-cyan-200">پیشنهاد قیمت شما</span>
                      <button onClick={() => setShowOffer(false)} className="text-xs text-gray-400 hover:text-white">بستن ✕</button>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-400">
                      بازه‌ی پیشنهادی: {toman(roundNice(listing.priceToman * 0.8, "down"))} تا {toman(listing.priceToman)}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        value={offerToman}
                        onChange={(e) => setOfferToman(e.target.value.replace(/[^\d]/g, ""))}
                        inputMode="numeric"
                        dir="ltr"
                        placeholder="مبلغ به تومان"
                        className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-left outline-none focus:border-cyan-400"
                      />
                      <span className="shrink-0 text-xs text-gray-400">تومان</span>
                    </div>
                    <textarea
                      value={offerMsg}
                      onChange={(e) => setOfferMsg(e.target.value.slice(0, 500))}
                      placeholder="پیام برای فروشنده (اختیاری)"
                      rows={2}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm outline-none focus:border-cyan-400"
                    />
                    <button
                      onClick={sendOffer}
                      disabled={sendingOffer}
                      className="mt-3 w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-600 py-3 text-sm font-black text-white transition active:scale-95 hover:brightness-110 disabled:opacity-40"
                    >
                      {sendingOffer ? "در حال ارسال..." : "ارسال پیشنهاد"}
                    </button>
                    <p className="mt-2 text-[11px] leading-5 text-gray-500">
                      فروشنده می‌تواند پیشنهاد شما را بپذیرد یا رد کند. اگر بپذیرد، سفارش با همان مبلغ ثبت و از کیف پول شما کسر می‌شود.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 rounded-2xl bg-cyan-500/10 p-3 text-xs leading-6 text-cyan-200 ring-1 ring-cyan-400/30">
              🛡️ پرداخت شما به‌صورت امانی نزد گیمنت نگه داشته می‌شود و فقط پس از تأیید دریافت، به فروشنده پرداخت می‌شود.
            </div>

            {listing.source === "user" && (
              <button onClick={reportListing} className="mt-3 text-xs font-bold text-gray-500 underline hover:text-red-300">
                🚩 گزارش این آگهی
              </button>
            )}
          </div>
        </div>

        {/* Seller reviews */}
        {listing.source === "user" && reviews.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-lg font-black">نظرات خریداران درباره‌ی این فروشنده</h2>
            <div className="space-y-3">
              {reviews.map((r) => (
                <div key={r.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-200">{r.buyerName || "خریدار"}</span>
                    <span className="text-amber-300">{"★".repeat(r.rating)}<span className="text-gray-600">{"★".repeat(5 - r.rating)}</span></span>
                  </div>
                  {r.comment && <p className="mt-2 text-sm leading-7 text-gray-300">{r.comment}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {msg && (
        <div className={`fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-bold shadow-2xl ${msg.type === "ok" ? "bg-green-600" : "bg-red-600"}`}>
          {msg.text}
        </div>
      )}
    </main>
  );
}
