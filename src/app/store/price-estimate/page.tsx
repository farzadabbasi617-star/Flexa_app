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
        <div className="sticky bottom-24 mt-8 rounded-3xl border border-purple-400/30 bg-gradient-to-br from-purple-700/30 to-fuchsia-700/20 p-5 text-center shadow-2xl backdrop-blur-xl">
          <div className="text-xs font-bold text-purple-200">قیمت تخمینی اکانت</div>
          <div className="mt-1 text-3xl font-black text-white">{toman(totalToman)}</div>
          <Link
            href="/store/sell"
            className="mt-4 inline-block rounded-2xl bg-purple-600 px-6 py-2.5 text-sm font-black transition hover:bg-purple-500"
          >
            ثبت آگهی فروش این اکانت
          </Link>
        </div>

        <p className="mt-4 text-center text-[11px] leading-6 text-gray-500">
          ⚠️ قیمت محاسبه‌شده تخمینی و بر اساس میانگین بازار است و ممکن است با قیمت نهایی فروش متفاوت باشد.
        </p>
      </div>
    </main>
  );
}
