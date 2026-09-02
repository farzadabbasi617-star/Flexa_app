"use client";

import { useEffect, useState } from "react";

type Cell = { v: string; label: string };

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function Box({ cell }: { cell: Cell }) {
  return (
    <div className="min-w-[52px] rounded-xl border border-amber-300/30 bg-black/55 px-2 py-1.5 text-center shadow-[0_0_18px_rgba(251,191,36,.16)] backdrop-blur-sm">
      <div className="text-lg sm:text-xl font-black leading-6 text-amber-200 tabular-nums drop-shadow-[0_0_10px_rgba(251,191,36,.55)]">
        {cell.v}
      </div>
      <div className="text-[8px] font-bold text-gray-300 -mt-0.5">{cell.label}</div>
    </div>
  );
}

function Sep() {
  return (
    <span className="text-amber-300/90 font-black text-lg animate-pulse" aria-hidden>
      :
    </span>
  );
}

/**
 * شمارش معکوس تا شروع تورنومنت — فقط سمت کلاینت.
 * تا زمان mount (و روی سرور) «--» نشان می‌دهد تا hydration سالم بماند.
 */
export default function TournamentCountdown({ target }: { target?: string | null }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!target) return null;
  const targetMs = new Date(target).getTime();
  if (Number.isNaN(targetMs)) return null;

  const diff = now === null ? null : targetMs - now;

  if (diff !== null && diff <= 0) {
    return (
      <div className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-emerald-300/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-black text-emerald-200 shadow-[0_0_20px_rgba(52,211,153,.25)]">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        در حال اجرا — شروع شد! 🔥
      </div>
    );
  }

  let cells: Cell[];
  if (diff === null) {
    cells = [
      { v: "--", label: "ساعت" },
      { v: "--", label: "دقیقه" },
      { v: "--", label: "ثانیه" },
    ];
  } else {
    cells = [
      { v: pad(Math.floor(diff / 3_600_000)), label: "ساعت" },
      { v: pad(Math.floor((diff % 3_600_000) / 60_000)), label: "دقیقه" },
      { v: pad(Math.floor((diff % 60_000) / 1000)), label: "ثانیه" },
    ];
  }

  return (
    <div className="mt-3">
      <div className="text-[9px] font-black tracking-[0.18em] text-amber-200/85 mb-1.5 drop-shadow-[0_0_8px_rgba(251,191,36,.4)]">
        ⏱️ تا شروع:
      </div>
      <div className="flex items-center gap-1.5" dir="ltr">
        <Box cell={cells[0]} />
        <Sep />
        <Box cell={cells[1]} />
        <Sep />
        <Box cell={cells[2]} />
      </div>
    </div>
  );
}
