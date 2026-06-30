"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Game = "cod_mobile" | "clash_royale" | "fortnite";

interface ChoiceOption {
  value: string;
  label: string;
  multiplier: number;
}

interface Field {
  key: string;
  label: string;
  kind: "number" | "choice";
  min: number;
  hint: string | null;
  unitToman: number;
  options?: ChoiceOption[];
  defaultValue?: string;
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
  arzangem: "ارزان‌جم",
  subgame: "ساب‌گیم",
  teleplayer: "تله‌پلیر",
  "iran-game": "ایران‌گیم",
  memory: "اکانت‌های مشابه",
};

const inputCls =
  "w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition placeholder:text-gray-600 focus:border-purple-400";

function toman(n: number) {
  return `${Math.round(n).toLocaleString("fa-IR")} تومان`;
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
    source: "memory" | "ai" | "formula";
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
      const fs: Field[] = Array.isArray(data.fields) ? data.fields : [];
      setFields(fs);
      // Seed choice fields with their default selection.
      const seed: Record<string, string> = {};
      for (const f of fs) if (f.kind === "choice" && f.defaultValue) seed[f.key] = f.defaultValue;
      setValues(seed);
    } catch {
      setFields([]);
      setValues({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setAi(null);
    setAiError(null);
    loadFields(game);
  }, [game, loadFields]);

  const numberFields = useMemo(() => fields.filter((f) => f.kind === "number"), [fields]);
  const choiceFields = useMemo(() => fields.filter((f) => f.kind === "choice"), [fields]);

  // Live client-side estimate: sum(count * unit) for number fields, then
  // multiply by the selected choice multipliers (mirrors the server formula).
  const totalToman = useMemo(() => {
    let sum = 0;
    for (const f of numberFields) {
      const n = Number(values[f.key]);
      if (Number.isFinite(n) && n > 0) sum += Math.floor(n) * f.unitToman;
    }
    let mult = 1;
    for (const f of choiceFields) {
      const sel = values[f.key] ?? f.defaultValue;
      const opt = f.options?.find((o) => o.value === sel) ?? f.options?.[0];
      if (opt) mult *= opt.multiplier;
    }
    return sum * mult;
  }, [numberFields, choiceFields, values]);

  const hasInput = useMemo(
    () => numberFields.some((f) => Number(values[f.key]) > 0),
    [numberFields, values]
  );

  async function runAiEstimate() {
    if (aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    setAi(null);
    try {
      const payload: Record<string, number | string> = {};
      for (const f of numberFields) {
        const n = Number(values[f.key]);
        if (Number.isFinite(n) && n > 0) payload[f.key] = Math.floor(n);
      }
      for (const f of choiceFields) {
        payload[f.key] = values[f.key] ?? f.defaultValue ?? f.options?.[0]?.value ?? "";
      }
      const res = await fetch("/api/store/price-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ game, values: payload, mode: "ai" }),
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
          مشخصات اکانت خود را وارد کنید تا قیمت تخمینی دریافت کنید. برای قیمت دقیق‌تر و مطابق بازار روز، دکمه‌ی «ارزیابی هوشمند» را بزنید.
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

        {loading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
            ))}
          </div>
        ) : (
          <>
            {/* Numeric item fields */}
            <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-black text-purple-200">مشخصات و آیتم‌های اکانت</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {numberFields.map((f) => (
                  <div key={f.key}>
                    <label className="mb-1 block text-xs font-bold text-gray-300">
                      {f.label}
                      <span className="text-red-400"> *</span>
                    </label>
                    <input
                      className={inputCls}
                      value={values[f.key] ?? ""}
                      onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value.replace(/[^\d]/g, "") }))}
                      inputMode="numeric"
                      placeholder={f.min > 0 ? `حداقل ${f.min.toLocaleString("fa-IR")}` : "0"}
                      dir="ltr"
                    />
                    {f.hint && <p className="mt-1 text-[11px] text-gray-500">{f.hint}</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* Choice (modifier) fields: region / security / access */}
            {choiceFields.length > 0 && (
              <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                <h2 className="mb-3 text-sm font-black text-purple-200">وضعیت اکانت (ریجن / امنیت / دسترسی)</h2>
                <div className="space-y-4">
                  {choiceFields.map((f) => {
                    const sel = values[f.key] ?? f.defaultValue;
                    return (
                      <div key={f.key}>
                        <label className="mb-2 block text-xs font-bold text-gray-300">{f.label}</label>
                        <div className="flex flex-wrap gap-2">
                          {(f.options ?? []).map((o) => (
                            <button
                              key={o.value}
                              type="button"
                              onClick={() => setValues((p) => ({ ...p, [f.key]: o.value }))}
                              className={`rounded-2xl px-3 py-2 text-xs font-bold transition ${
                                sel === o.value
                                  ? "bg-purple-600 text-white shadow-lg shadow-purple-900/40"
                                  : "border border-white/10 bg-black/40 text-gray-300 hover:bg-white/10"
                              }`}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                        {f.hint && <p className="mt-1.5 text-[11px] text-gray-500">{f.hint}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Result */}
        <div className="mt-6 rounded-3xl border border-purple-400/30 bg-gradient-to-br from-purple-700/30 to-fuchsia-700/20 p-5 text-center shadow-2xl backdrop-blur-xl">
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
              در حال بررسی آگهی‌های واقعی بازار ایران و مقایسه با اکانت شما... (چند ثانیه)
            </p>
          )}
          {aiError && <p className="mt-2 text-[11px] font-bold text-red-300">{aiError}</p>}

          {ai && (
            <div className="mt-4 rounded-2xl border border-cyan-400/30 bg-black/30 p-4 text-right">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-200">
                  {ai.source === "memory"
                    ? "🧠 قیمت بر پایه اکانت‌های مشابه"
                    : ai.source === "ai"
                      ? "💡 قیمت پیشنهادی هوش مصنوعی"
                      : "قیمت پایه (AI در دسترس نبود)"}
                </span>
                <span className="text-[10px] text-gray-400">
                  {ai.source === "memory"
                    ? `بر پایه ${ai.comparablesCount.toLocaleString("fa-IR")} اکانت مشابه`
                    : ai.comparablesCount > 0
                      ? `بر پایه ${ai.comparablesCount.toLocaleString("fa-IR")} آگهی بازار`
                      : "بر پایه تحلیل هوش مصنوعی از بازار روز"}
                </span>
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
          ⚠️ قیمت‌ها تخمینی هستند. ارزیابی هوشمند، آیتم‌ها و وضعیت اکانت شما (ریجن، سیو، دسترسی) را با قیمت بازار روز می‌سنجد، اما قیمت نهایی فروش ممکن است متفاوت باشد.
        </p>
      </div>
    </main>
  );
}
