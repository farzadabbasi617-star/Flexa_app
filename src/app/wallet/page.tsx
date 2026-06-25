"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";

interface WalletData {
  wallet: {
    balanceToman: number;
    balanceRial: string;
    usableToman: number;
    usableRial: string;
    withdrawableToman: number;
    withdrawableRial: string;
    nonWithdrawableToman: number;
    nonWithdrawableRial: string;
    currency: string;
  };
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

const WALLET_TERMS =
  "شارژ کیف پول گیمنت فعلاً از طریق کارت‌به‌کارت انجام می‌شود. پس از انتقال وجه به کارت اعلام‌شده، رسید/شماره پیگیری را ثبت کنید تا مدیریت پرداخت را بررسی و موجودی قابل استفاده داخل سایت را تأیید کند. مبالغ شارژ شده صرفاً برای خدمات داخل پلتفرم مثل ثبت‌نام تورنومنت قابل استفاده است و به‌صورت مستقیم قابل برداشت نیست. مبالغ قابل برداشت شامل جوایز، پاداش‌های رسمی و مبالغی است که طبق قوانین گیمنت قابل تسویه اعلام شده‌اند. درخواست‌های برداشت پس از ثبت اطلاعات بانکی معتبر و بررسی توسط تیم پشتیبانی، طی ۲۴ تا ۷۲ ساعت کاری پرداخت می‌شوند.";

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

const QUICK_DEPOSIT_AMOUNTS = [50_000, 100_000, 200_000, 500_000, 1_000_000];
const DEPOSIT_CARD_NUMBER = "5892101742614775";
const DEPOSIT_CARD_OWNER = "فرزاد عباسی";
const DEPOSIT_BANK_NAME = "بانک سپه";
const MAX_RECEIPT_SIZE_MB = 1.2;

function formatTomanInput(value: string) {
  const digits = value.replace(/[^\d۰-۹٠-٩]/g, "");
  if (!digits) return "";
  const englishDigits = digits
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  return Number(englishDigits).toLocaleString("en-US");
}

function txSign(type: string) {
  return type === "entry_fee" || type === "withdrawal" ? "-" : "+";
}

function txColor(type: string) {
  return type === "entry_fee" || type === "withdrawal" ? "text-red-400" : "text-emerald-400";
}

export default function WalletPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<WalletData | null>(null);
  const [busy, setBusy] = useState(true);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositTrackingNumber, setDepositTrackingNumber] = useState("");
  const [depositNote, setDepositNote] = useState("");
  const [depositReceiptFile, setDepositReceiptFile] = useState<File | null>(null);
  const [depositReceiptPreview, setDepositReceiptPreview] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [accountOwner, setAccountOwner] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [iban, setIban] = useState("");
  const [withdrawNote, setWithdrawNote] = useState("");
  const [submitting, setSubmitting] = useState<"deposit" | "withdrawal" | "">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setAcceptedTerms(localStorage.getItem("gament_wallet_terms_accepted") === "true");
  }, []);

  function toggleTerms(value: boolean) {
    setAcceptedTerms(value);
    localStorage.setItem("gament_wallet_terms_accepted", value ? "true" : "false");
  }

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
  const pendingWithdrawals = useMemo(() => data?.transactions.filter((tx) => tx.type === "withdrawal" && tx.status === "pending") || [], [data]);


  function handleDepositReceiptChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setDepositReceiptFile(null);
    setDepositReceiptPreview("");

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("فقط تصویر رسید قابل ارسال است.");
      e.target.value = "";
      return;
    }

    if (file.size > MAX_RECEIPT_SIZE_MB * 1024 * 1024) {
      setError(`حجم تصویر رسید باید کمتر از ${MAX_RECEIPT_SIZE_MB} مگابایت باشد.`);
      e.target.value = "";
      return;
    }

    setError("");
    setDepositReceiptFile(file);

    const reader = new FileReader();
    reader.onload = () => setDepositReceiptPreview(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  }

  async function requestDeposit(e: FormEvent) {
    e.preventDefault();
    setSubmitting("deposit");
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.append("action", "deposit");
      form.append("amountToman", depositAmount);
      form.append("trackingNumber", depositTrackingNumber);
      form.append("note", depositNote);
      form.append("acceptTerms", String(acceptedTerms));
      if (depositReceiptFile) form.append("receipt", depositReceiptFile);

      const res = await fetch("/api/wallet/transactions", {
        method: "POST",
        credentials: "include",
        headers: { "X-Requested-With": "XMLHttpRequest" },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "درخواست شارژ ثبت نشد");
      setMessage(json.message || "رسید کارت‌به‌کارت ثبت شد و پس از تأیید مدیریت، موجودی کیف پول افزایش می‌یابد.");
      setDepositAmount("");
      setDepositTrackingNumber("");
      setDepositNote("");
      setDepositReceiptFile(null);
      setDepositReceiptPreview("");
      const receiptInput = document.getElementById("wallet-deposit-receipt") as HTMLInputElement | null;
      if (receiptInput) receiptInput.value = "";
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "درخواست شارژ ثبت نشد");
    } finally {
      setSubmitting("");
    }
  }

  async function requestWithdrawal(e: FormEvent) {
    e.preventDefault();
    setSubmitting("withdrawal");
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/wallet/transactions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({
          action: "withdrawal",
          amountToman: withdrawAmount,
          accountOwner,
          nationalId,
          iban,
          note: withdrawNote,
          acceptTerms: acceptedTerms,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "درخواست برداشت ثبت نشد");
      setMessage(json.message || "درخواست برداشت ثبت شد");
      setWithdrawAmount("");
      setAccountOwner("");
      setNationalId("");
      setIban("");
      setWithdrawNote("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "درخواست برداشت ثبت نشد");
    } finally {
      setSubmitting("");
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
      <main className="relative z-10 max-w-[760px] mx-auto px-4 sm:px-6 py-8 pb-32" dir="rtl">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-black neon-text-purple">💳 کیف پول</h1>
            <p className="text-gray-500 text-sm mt-2">موجودی قابل استفاده، قابل برداشت و تاریخچه تراکنش‌ها</p>
          </div>
          <button onClick={load} className="px-4 py-3 rounded-xl bg-dark-700 text-sm font-bold">🔄</button>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 mb-5 text-sm leading-7">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 rounded-xl p-3 mb-5 text-sm leading-7">{message}</div>}

        <section className="glass-panel p-7 mb-6 bg-gradient-to-br from-purple-900/30 to-[#0a0a0e] border-purple-500/20">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-purple-400">موجودی کل / قابل استفاده داخل سایت</p>
            <div className="flex gap-2">
              {pendingDeposits.length > 0 && <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">{pendingDeposits.length} شارژ در انتظار</span>}
              {pendingWithdrawals.length > 0 && <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-300 border border-orange-500/20">{pendingWithdrawals.length} برداشت در انتظار</span>}
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-5">
            <span className="text-5xl sm:text-6xl font-black tracking-tighter num-en">{(data?.wallet.usableToman || 0).toLocaleString("fa-IR")}</span>
            <span className="text-xl font-bold text-purple-400">تومان</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="text-xs text-gray-500 mb-1">موجودی قابل برداشت</div>
              <div className="text-2xl font-black text-yellow-300">{(data?.wallet.withdrawableToman || 0).toLocaleString("fa-IR")} تومان</div>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="text-xs text-gray-500 mb-1">شارژ/موجودی غیرقابل برداشت مستقیم</div>
              <div className="text-2xl font-black text-neon-blue">{(data?.wallet.nonWithdrawableToman || 0).toLocaleString("fa-IR")} تومان</div>
            </div>
          </div>
        </section>

        <section className="glass-panel p-5 mb-6 border border-yellow-500/20 bg-yellow-500/5">
          <h2 className="font-black text-yellow-200 mb-3">قوانین مهم کیف پول</h2>
          <p className="text-sm leading-8 text-gray-200 mb-4">{WALLET_TERMS}</p>
          <label className="flex items-start gap-3 rounded-2xl bg-dark-800/70 border border-white/10 p-4 cursor-pointer">
            <input type="checkbox" checked={acceptedTerms} onChange={(e) => toggleTerms(e.target.checked)} className="mt-1 w-5 h-5 accent-purple-600" />
            <span className="text-sm font-bold leading-7">قوانین کیف پول را خوانده‌ام و قبول دارم. پس از تأیید این گزینه امکان ثبت درخواست شارژ یا برداشت فعال می‌شود.</span>
          </label>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <form onSubmit={requestDeposit} className="glass-panel p-5 space-y-5 overflow-hidden relative">
            <div className="absolute -top-16 -left-16 w-44 h-44 bg-purple-600/20 rounded-full blur-3xl" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-400/20 text-[11px] font-black text-purple-200 mb-3">
                فقط کارت‌به‌کارت
              </div>
              <h2 className="font-black text-xl mb-1">افزایش موجودی</h2>
              <p className="text-xs text-gray-400 leading-6">مبلغ را وارد کن، به کارت گیمنت واریز کن و تصویر فیش را از گالری ارسال کن تا ادمین بررسی و شارژ را تأیید کند.</p>
            </div>

            <div className="relative rounded-[2rem] bg-gradient-to-br from-purple-950/80 via-[#17101f]/90 to-cyan-950/40 border border-purple-400/25 p-4 shadow-[0_0_45px_rgba(139,92,246,.15)] space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] text-purple-200 font-black mb-1">مبلغ واریزی</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black num-en">{depositAmount || "0"}</span>
                    <span className="text-sm font-bold text-purple-300">تومان</span>
                  </div>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center text-2xl">💳</div>
              </div>

              <input
                className="gaming-input text-left num-en bg-white/10"
                dir="ltr"
                inputMode="numeric"
                placeholder="مثلاً 200,000 تومان"
                value={depositAmount}
                onChange={(e) => setDepositAmount(formatTomanInput(e.target.value))}
              />
              <div className="flex flex-wrap gap-2">
                {QUICK_DEPOSIT_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setDepositAmount(amount.toLocaleString("en-US"))}
                    className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] font-black text-purple-100 hover:border-purple-400/40"
                  >
                    {amount.toLocaleString("fa-IR")}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] bg-white/[.04] border border-white/10 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 text-xs text-gray-300">
                <span className="font-black text-white">کارت مقصد</span>
                <span>{DEPOSIT_BANK_NAME} • به نام <b className="text-yellow-200">{DEPOSIT_CARD_OWNER}</b></span>
              </div>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(DEPOSIT_CARD_NUMBER)}
                className="w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-4 text-center text-xl sm:text-2xl font-black tracking-[0.12em] num-en text-white hover:border-cyan-300/40"
                dir="ltr"
                title="کپی شماره کارت"
              >
                {DEPOSIT_CARD_NUMBER.replace(/(\d{4})(?=\d)/g, "$1 ")}
              </button>
              <div className="text-[10px] text-cyan-200/80 leading-5">با لمس شماره کارت، کپی می‌شود.</div>
            </div>

            <input className="gaming-input text-left num-en" dir="ltr" placeholder="شماره پیگیری / ۴ رقم آخر کارت مبدأ" value={depositTrackingNumber} onChange={(e) => setDepositTrackingNumber(e.target.value.slice(0, 80))} />

            <label htmlFor="wallet-deposit-receipt" className="block rounded-[2rem] border border-dashed border-purple-400/40 bg-purple-500/10 p-4 cursor-pointer hover:bg-purple-500/15 transition-colors">
              <input
                id="wallet-deposit-receipt"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleDepositReceiptChange}
              />
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-black/30 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                  {depositReceiptPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={depositReceiptPreview} alt="پیش‌نمایش فیش واریز" className="w-full h-full object-cover" />
                  ) : <span className="text-3xl">🧾</span>}
                </div>
                <div className="min-w-0">
                  <div className="font-black text-white">انتخاب فیش از گالری</div>
                  <div className="text-xs text-gray-400 leading-6 truncate">
                    {depositReceiptFile ? depositReceiptFile.name : `JPG/PNG/WEBP تا ${MAX_RECEIPT_SIZE_MB}MB`}
                  </div>
                </div>
              </div>
            </label>

            <textarea className="gaming-input min-h-20" placeholder="توضیح اختیاری" value={depositNote} onChange={(e) => setDepositNote(e.target.value)} />
            <button disabled={!acceptedTerms || submitting === "deposit"} className="gaming-btn w-full disabled:opacity-40 disabled:cursor-not-allowed">{submitting === "deposit" ? "در حال ثبت..." : "ثبت و ارسال فیش کارت‌به‌کارت"}</button>
          </form>

          <form onSubmit={requestWithdrawal} className="glass-panel p-5 space-y-4">
            <div>
              <h2 className="font-black mb-1">درخواست برداشت</h2>
              <p className="text-xs text-gray-500 leading-6">برداشت فقط از موجودی قابل برداشت مثل جوایز و پاداش‌های رسمی امکان‌پذیر است. حداقل برداشت ۵۰٬۰۰۰ تومان.</p>
            </div>
            <input className="gaming-input text-left num-en" dir="ltr" inputMode="numeric" placeholder="مبلغ برداشت (مثلاً 200,000 تومان)" value={withdrawAmount} onChange={(e) => setWithdrawAmount(formatTomanInput(e.target.value))} />
            <input className="gaming-input" placeholder="نام و نام خانوادگی صاحب حساب" value={accountOwner} onChange={(e) => setAccountOwner(e.target.value)} />
            <input className="gaming-input" placeholder="کد ملی صاحب حساب" value={nationalId} onChange={(e) => setNationalId(e.target.value)} dir="ltr" />
            <input className="gaming-input" placeholder="شماره شبا مثل IRxxxxxxxxxxxxxxxxxxxxxxxx" value={iban} onChange={(e) => setIban(e.target.value)} dir="ltr" />
            <textarea className="gaming-input min-h-20" placeholder="توضیح اختیاری" value={withdrawNote} onChange={(e) => setWithdrawNote(e.target.value)} />
            <button disabled={!acceptedTerms || submitting === "withdrawal" || (data?.wallet.withdrawableToman || 0) <= 0} className="gaming-btn w-full disabled:opacity-40 disabled:cursor-not-allowed">{submitting === "withdrawal" ? "در حال ثبت..." : "ثبت درخواست برداشت"}</button>
          </form>
        </div>

        <section className="glass-panel overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <span className="font-black">تاریخچه تراکنش‌ها</span>
            <span className="text-xs text-gray-500">{data?.transactions.length || 0} مورد</span>
          </div>
          {data?.transactions.length ? (
            <div className="divide-y divide-white/10 text-sm">
              {data.transactions.map((tx) => (
                <div key={tx.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-bold">{TYPE_LABELS[tx.type] || tx.type}</div>
                    <div className="text-xs text-gray-500 mt-0.5 leading-6">
                      {new Date(tx.createdAt).toLocaleString("fa-IR")} • {STATUS_LABELS[tx.status] || tx.status}
                    </div>
                  </div>
                  <div className={`font-black num-en ${txColor(tx.type)}`}>
                    {txSign(tx.type)}{tx.amountToman.toLocaleString("fa-IR")}
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="p-8 text-center text-gray-500 text-sm">هنوز تراکنشی ثبت نشده است.</div>}
        </section>
      </main>
      <BottomNav />
    </div>
  );
}
