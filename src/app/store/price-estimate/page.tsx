"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Game = "cod_mobile" | "clash_royale" | "fortnite";

interface Field {
  key: string;
  label: string;
  min: number;
  hint: string | null;
  unitToman: number;
}

const GAMES: Array<{ id: Game; label: string; icon: string }> = [
  { id: "cod_mobile", label: "کالاف دیوتی موبایل", icon: "🔫" },
  { id: "clash_royale", label: "کلش رویال", icon: "👑" },
  { id: "fortnite", label: "فورتنایت", icon: "🛡️" },
];

const SOURCE_LABELS: Record<string, string> = {
  divar: "دیوار",
  sheypoor: "شیپور",
  torob: "ترب",
  getgame: "فروشگاه گیم",
  "iran-game": "ایران‌گیم",
};

const inputCls =
  "w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition placeholder:text-gray-600 focus:border-purple-400";

function toman(n: number) {
  return `${n.toLocaleString("fa-IR")} تومان`;
}

export default function PriceEstimatePage() {
  const [game, setGame] = useState<Game>("cod_mobile");
  const [fields, setFields] = useState<Field[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [ai, setAi] = useState<{
    priceToman: number;
    minToman: number;
    maxToman: number;
    rationale: string;
    source: "ai" | "formula";
    comparablesCount: number;
    sources?: string[];
    aiModel?: string;
  } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const loadFields = useCallback(async (g: Game) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/store/price-estimate?game=${g}`, { cache: "no-store" });
      const data = await res.json();
      setFields(Array.isArray(data.fields) ? data.fields : []);
    } catch {
      setFields([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setValues({});
    setAi(null);
    setAiError(null);
    loadFields(game);
  }, [game, loadFields]);

  // Live client-side estimate (mirrors the server formula: sum of count * unit).
  const totalToman = useMemo(() => {
    let sum = 0;
    for (const f of fields) {
      const n = Number(values[f.key]);
      if (Number.isFinite(n) && n > 0) sum += Math.floor(n) * f.unitToman;
    }
    return sum;
  }, [fields, values]);

  const hasInput = useMemo(
    () => fields.some((f) => Number(values[f.key]) > 0),
    [fields, values]
  );

  async function runAiEstimate() {
    if (aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    setAi(null);
    try {
      const numericValues: Record<string, number> = {};
      for (const f of fields) {
        const n = Number(values[f.key]);
        if (Number.isFinite(n) && n > 0) numericValues[f.key] = Math.floor(n);
      }
      const res = await fetch("/api/store/price-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ game, values: numericValues, mode: "ai" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error || "ارزیابی هوشمند ناموفق بود.");
        return;
      }
      setAi(data);
    } catch {
      setAiError("خطای ارتباط با سرور.");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[#06060f] px-4 py-6 text-white sm:px-6 pb-28">
      <div className="mx-auto max-w-2xl">
        <Link href="/store" className="text-sm text-gray-400 hover:text-white">← بازگشت به فروشگاه</Link>
        <h1 className="mt-3 text-2xl font-black sm:text-3xl">🧮 تخمین قیمت اکانت</h1>
        <p className="mt-2 text-sm text-gray-400">
          مشخصات اکانت خود را وارد کنید تا یک قیمت تخمینی دریافت کنید. این قیمت صرفاً راهنماست.
        </p>

        {/* Game selector */}
        <div className="mt-5 flex flex-wrap gap-2">
          {GAMES.map((g) => (
            <button
              key={g.id}
              onClick={() => setGame(g.id)}
              className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${
                game === g.id ? "bg-purple-600 text-white" : "border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              <span className="ml-1">{g.icon}</span> {g.label}
            </button>
          ))}
        </div>

        {/* Fields */}
        {loading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
            ))}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key}>
                <label className="mb-1 block text-xs font-bold text-gray-300">{f.label}</label>
                <input
                  className={inputCls}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value.replace(/[^\d]/g, "") }))}
                  inputMode="numeric"
                  placeholder="0"
                  dir="ltr"
                />
                {f.hint && <p className="mt-1 text-[11px] text-gray-500">{f.hint} · هر واحد {toman(f.unitToman)}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Result */}
        <div className="mt-8 rounded-3xl border border-purple-400/30 bg-gradient-to-br from-purple-700/30 to-fuchsia-700/20 p-5 text-center shadow-2xl backdrop-blur-xl">
          <div className="text-xs font-bold text-purple-200">قیمت تخمینی پایه</div>
          <div className="mt-1 text-3xl font-black text-white">{toman(totalToman)}</div>

          {/* AI smart valuation */}
          <button
            onClick={runAiEstimate}
            disabled={aiLoading || !hasInput}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-600 py-3 text-sm font-black text-white shadow-lg transition active:scale-95 hover:brightness-110 disabled:opacity-40"
          >
            {aiLoading ? "در حال ارزیابی هوشمند با بازار روز..." : "✨ ارزیابی هوشمند با هوش مصنوعی"}
          </button>
          {aiLoading && (
            <p className="mt-2 text-[11px] text-cyan-200/80">
              در حال بررسی آگهی‌های واقعی بازار ایران (دیوار، شیپور، ترب و فروشگاه‌های دیگر) و مقایسه با اکانت شما... (چند ثانیه)
            </p>
          )}
          {aiError && <p className="mt-2 text-[11px] font-bold text-red-300">{aiError}</p>}

          {ai && (
            <div className="mt-4 rounded-2xl border border-cyan-400/30 bg-black/30 p-4 text-right">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-200">
                  {ai.source === "ai" ? "💡 قیمت پیشنهادی هوش مصنوعی" : "قیمت پایه (AI در دسترس نبود)"}
                </span>
                {ai.comparablesCount > 0 && (
                  <span className="text-[10px] text-gray-400">بر پایه {ai.comparablesCount.toLocaleString("fa-IR")} آگهی بازار</span>
                )}
              </div>
              <div className="mt-2 text-center text-2xl font-black text-cyan-100">{toman(ai.priceToman)}</div>
              <div className="mt-1 text-center text-[11px] text-gray-400">
                بازه‌ی منصفانه: {toman(ai.minToman)} تا {toman(ai.maxToman)}
              </div>
              {ai.sources && ai.sources.length > 0 && (
                <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                  {ai.sources.map((s) => (
                    <span key={s} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-gray-300">
                      {SOURCE_LABELS[s] || s}
                    </span>
                  ))}
                </div>
              )}
              {ai.rationale && (
                <p className="mt-3 whitespace-pre-wrap text-xs leading-7 text-gray-200">{ai.rationale}</p>
              )}
            </div>
          )}

          <Link
            href="/store/sell"
            className="mt-4 inline-block rounded-2xl bg-purple-600 px-6 py-2.5 text-sm font-black transition hover:bg-purple-500"
          >
            ثبت آگهی فروش این اکانت
          </Link>
        </div>

        <p className="mt-4 text-center text-[11px] leading-6 text-gray-500">
          ⚠️ قیمت‌ها تخمینی هستند. ارزیابی هوشمند، آیتم‌ها و لول اکانت شما را با قیمت آگهی‌های واقعی و روز بازار (دیوار/شیپور) می‌سنجد، اما قیمت نهایی فروش ممکن است متفاوت باشد.
        </p>
      </div>
    </main>
  );
}
