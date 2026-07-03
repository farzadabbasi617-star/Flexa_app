"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ImageUploader from "@/components/ImageUploader";
import BottomNav from "@/components/BottomNav";

type KycStatus = "none" | "pending" | "verified" | "rejected";

interface KycState {
  status: KycStatus;
  rejectionReason?: string | null;
}

const KINDS = [
  { id: "currency", label: "ارز داخل بازی (جم، CP، UC، وی‌باکس)" },
  { id: "account", label: "اکانت بازی" },
  { id: "item", label: "آیتم داخل بازی" },
  { id: "service", label: "خدمات (بوست، رنک و...)" },
];
const GAMES = [
  { id: "", label: "— انتخاب بازی (اختیاری) —" },
  { id: "clash_royale", label: "کلش رویال" },
  { id: "cod_mobile", label: "کالاف دیوتی موبایل" },
  { id: "fortnite", label: "فورتنایت" },
];
const CURRENCIES = [
  { id: "gem", label: "جم (Gem)" },
  { id: "cp", label: "CP" },
  { id: "uc", label: "UC" },
  { id: "vbucks", label: "وی‌باکس (V-Bucks)" },
  { id: "coin", label: "سکه" },
  { id: "gold", label: "طلا" },
  { id: "other", label: "سایر" },
];

const inputCls =
  "w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition placeholder:text-gray-600 focus:border-purple-400";

export default function SellPage() {
  const [kyc, setKyc] = useState<KycState | null>(null);
  const [loadingKyc, setLoadingKyc] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/kyc", { cache: "no-store", credentials: "include" })
      .then((r) => (r.ok ? r.json() : { kyc: null }))
      .then((d) => setKyc(d.kyc ? { status: d.kyc.status, rejectionReason: d.kyc.rejectionReason } : { status: "none" }))
      .catch(() => setKyc({ status: "none" }))
      .finally(() => setLoadingKyc(false));
  }, []);

  if (loadingKyc) {
    return <main className="grid min-h-[60dvh] place-items-center bg-[#06060f] text-white">در حال بارگذاری...</main>;
  }

  return (
    <main className="min-h-[100dvh] bg-[#06060f] px-4 py-8 text-white sm:px-6 pb-28">
      <div className="mx-auto max-w-2xl">
        <Link href="/store" className="text-sm text-gray-400 hover:text-white">← بازگشت به فروشگاه</Link>
        <h1 className="mt-3 text-2xl font-black sm:text-3xl">ثبت آگهی فروش</h1>

        {kyc?.status !== "verified" ? (
          <KycGate kyc={kyc} onMessage={setMsg} onUpdated={setKyc} />
        ) : (
          <ListingForm onMessage={setMsg} />
        )}

        {msg && (
          <div className={`mt-5 rounded-2xl px-4 py-3 text-sm font-bold ${msg.type === "ok" ? "bg-green-600/20 text-green-300 ring-1 ring-green-500/40" : "bg-red-600/20 text-red-300 ring-1 ring-red-500/40"}`}>
            {msg.text}
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}

function KycGate({
  kyc,
  onMessage,
  onUpdated,
}: {
  kyc: KycState | null;
  onMessage: (m: { type: "ok" | "err"; text: string }) => void;
  onUpdated: (k: KycState) => void;
}) {
  const [form, setForm] = useState({ fullName: "", nationalId: "", birthDate: "", idCardImageUrl: "", selfieImageUrl: "" });
  const [submitting, setSubmitting] = useState(false);

  if (kyc?.status === "pending") {
    return (
      <div className="mt-6 rounded-3xl border border-yellow-500/30 bg-yellow-500/10 p-6 text-center">
        <div className="text-4xl">⏳</div>
        <h2 className="mt-3 text-lg font-black text-yellow-200">احراز هویت در حال بررسی است</h2>
        <p className="mt-2 text-sm text-yellow-100/80">
          مدارک شما ارسال شد و توسط تیم گیمنت بررسی می‌شود. پس از تأیید، می‌توانید آگهی ثبت کنید.
        </p>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/kyc", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        onMessage({ type: "err", text: data.error || "ارسال ناموفق بود." });
        return;
      }
      onMessage({ type: "ok", text: "مدارک ارسال شد و در حال بررسی است." });
      onUpdated({ status: "pending" });
    } catch {
      onMessage({ type: "err", text: "خطای ارتباط با سرور." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="rounded-2xl bg-purple-600/15 p-4 text-sm leading-7 text-purple-100 ring-1 ring-purple-500/30">
        🛡️ برای فروش در فروشگاه، ابتدا باید هویت شما تأیید شود. لطفاً اطلاعات و تصاویر زیر را وارد کنید.
        {kyc?.status === "rejected" && kyc.rejectionReason && (
          <p className="mt-2 font-bold text-red-300">دلیل رد قبلی: {kyc.rejectionReason}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold text-gray-400">نام و نام خانوادگی</label>
        <input className={inputCls} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required maxLength={150} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold text-gray-400">کد ملی</label>
        <input className={inputCls} value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} inputMode="numeric" maxLength={10} required placeholder="مثال: 0012345678" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold text-gray-400">تاریخ تولد (اختیاری)</label>
        <input className={inputCls} value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} placeholder="مثال: 1375/03/21" />
      </div>
      <ImageUploader
        purpose="kyc"
        max={1}
        label="تصویر کارت ملی"
        hint="تصویر واضح از روی کارت ملی"
        value={form.idCardImageUrl ? [form.idCardImageUrl] : []}
        onChange={(urls) => setForm({ ...form, idCardImageUrl: urls[0] || "" })}
      />
      <ImageUploader
        purpose="kyc"
        max={1}
        label="سلفی با کارت ملی"
        hint="عکس از چهره خود در حالی که کارت ملی را در دست دارید"
        value={form.selfieImageUrl ? [form.selfieImageUrl] : []}
        onChange={(urls) => setForm({ ...form, selfieImageUrl: urls[0] || "" })}
      />

      <button disabled={submitting} className="w-full rounded-2xl bg-purple-600 py-3 text-sm font-black transition active:scale-95 hover:bg-purple-500 disabled:opacity-40">
        {submitting ? "در حال ارسال..." : "ارسال برای احراز هویت"}
      </button>
    </form>
  );
}

function ListingForm({ onMessage }: { onMessage: (m: { type: "ok" | "err"; text: string }) => void }) {
  const [images, setImages] = useState<string[]>([]);
  const [form, setForm] = useState({
    kind: "currency",
    game: "",
    title: "",
    description: "",
    priceToman: "",
    currencyKind: "gem",
    currencyAmount: "",
    stock: "1",
    warrantyDays: "",
    deliveryNotes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        kind: form.kind,
        title: form.title,
        description: form.description || undefined,
        priceToman: Number(form.priceToman),
        stock: Number(form.stock),
        images,
        deliveryNotes: form.deliveryNotes || undefined,
        warrantyDays: form.warrantyDays ? Number(form.warrantyDays) : undefined,
      };
      if (form.game) payload.game = form.game;
      if (form.kind === "currency") {
        payload.currencyKind = form.currencyKind;
        payload.currencyAmount = Number(form.currencyAmount);
      }
      const res = await fetch("/api/store/listings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        onMessage({ type: "err", text: data.error || "ثبت آگهی ناموفق بود." });
        return;
      }
      onMessage({ type: "ok", text: "آگهی ثبت شد و پس از تأیید ادمین در فروشگاه نمایش داده می‌شود." });
      setForm({ ...form, title: "", description: "", priceToman: "", currencyAmount: "", deliveryNotes: "" });
      setImages([]);
    } catch {
      onMessage({ type: "err", text: "خطای ارتباط با سرور." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="rounded-2xl bg-green-600/15 p-3 text-sm font-bold text-green-300 ring-1 ring-green-500/30">
        ✅ هویت شما تأیید شده است. می‌توانید آگهی ثبت کنید.
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-bold text-gray-400">نوع کالا</label>
          <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-gray-400">بازی</label>
          <select className={inputCls} value={form.game} onChange={(e) => setForm({ ...form, game: e.target.value })}>
            {GAMES.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold text-gray-400">عنوان آگهی</label>
        <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={200} placeholder="مثال: ۱۰۰۰ جم کلش رویال" />
      </div>

      {form.kind === "currency" && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-400">نوع ارز</label>
            <select className={inputCls} value={form.currencyKind} onChange={(e) => setForm({ ...form, currencyKind: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-400">مقدار</label>
            <input className={inputCls} value={form.currencyAmount} onChange={(e) => setForm({ ...form, currencyAmount: e.target.value })} inputMode="numeric" placeholder="مثال: 1000" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-bold text-gray-400">قیمت (تومان)</label>
          <input className={inputCls} value={form.priceToman} onChange={(e) => setForm({ ...form, priceToman: e.target.value })} inputMode="numeric" required placeholder="مثال: 150000" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-gray-400">موجودی</label>
          <input className={inputCls} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} inputMode="numeric" disabled={form.kind === "account"} />
          {form.kind === "account" && <p className="mt-1 text-[11px] text-gray-500">برای اکانت، موجودی همیشه ۱ است.</p>}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold text-gray-400">مدت گارانتی (روز) — اختیاری</label>
        <input className={inputCls} value={form.warrantyDays} onChange={(e) => setForm({ ...form, warrantyDays: e.target.value.replace(/[^\d]/g, "") })} inputMode="numeric" placeholder="مثال: 7 (در صورت نداشتن، خالی بگذارید)" dir="ltr" />
        <p className="mt-1 text-[11px] text-gray-500">گارانتی باعث افزایش اعتماد خریدار و شانس فروش می‌شود.</p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold text-gray-400">توضیحات</label>
        <textarea className={`${inputCls} min-h-[90px]`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={5000} />
      </div>

      <ImageUploader
        purpose="listing"
        max={8}
        label="تصاویر آگهی"
        hint="حداکثر ۸ تصویر. اولین تصویر به عنوان کاور نمایش داده می‌شود."
        value={images}
        onChange={setImages}
      />

      <div>
        <label className="mb-1 block text-xs font-bold text-gray-400">اطلاعات تحویل (محرمانه — فقط بعد از خرید به خریدار نشان داده می‌شود)</label>
        <textarea className={`${inputCls} min-h-[70px]`} value={form.deliveryNotes} onChange={(e) => setForm({ ...form, deliveryNotes: e.target.value })} placeholder="مثال: یوزرنیم و پسورد اکانت، کد تحویل و..." />
      </div>

      <button disabled={submitting} className="w-full rounded-2xl bg-purple-600 py-3 text-sm font-black transition active:scale-95 hover:bg-purple-500 disabled:opacity-40">
        {submitting ? "در حال ثبت..." : "ثبت آگهی"}
      </button>
    </form>
  );
}
