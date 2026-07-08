"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  /**
   * ISO date string for the next tournament start.
   * If null/undefined, a default 20-day countdown is generated so every game
   * card on the Arena tab always shows a live timer.
   */
  targetDate?: string | null;
  /** Fallback duration in days when no targetDate is provided. Default 20. */
  fallbackDays?: number;
}

/**
 * Convert a number to Persian digits (fa-IR), zero-padded to 2 digits.
 * We intentionally build the "X روز Y ساعت Z دقیقه" string ourselves
 * instead of using toLocaleString so the layout is fixed and stable.
 */
function toFa2(n: number): string {
  return n.toString().padStart(2, "0").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}
function toFa(n: number): string {
  return n.toString().replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

interface Parts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

function computeParts(targetMs: number): Parts {
  const diff = targetMs - Date.now();
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1000),
    expired: false,
  };
}

/**
 * Compact "تا شروع" countdown badge shown on each game card in the Arena tab.
 * Format: «تا شروع  ۱۹ روز ۲۳ ساعت ۵۹ دقیقه» — ticks every second so the
 * minute portion visibly updates.
 *
 * If no targetDate is supplied, we synthesise one at (now + fallbackDays)
 * so every card ALWAYS shows a live timer — this is a product requirement.
 * The synthesised target is memoised per-mount so it doesn't jump around.
 */
export default function GameCardCountdown({ targetDate, fallbackDays = 20 }: Props) {
  // Resolve the effective target once per prop change. When no real date is
  // provided we anchor a synthetic (now + fallbackDays) target for the
  // lifetime of this component instance so the timer counts down smoothly.
  const targetMs = useMemo(() => {
    if (targetDate) {
      const ms = new Date(targetDate).getTime();
      if (!Number.isNaN(ms)) return ms;
    }
    return Date.now() + fallbackDays * 86_400_000;
  }, [targetDate, fallbackDays]);

  const [parts, setParts] = useState<Parts>(() => computeParts(targetMs));
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function tick() {
      const next = computeParts(targetMs);
      setParts(next);
      if (next.expired) return;
      timeoutRef.current = setTimeout(tick, 1000);
    }
    tick();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [targetMs]);

  if (parts.expired) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 backdrop-blur-md border border-emerald-400/40 text-[10px] font-black text-emerald-200 shadow-[0_0_18px_rgba(16,185,129,.35)]"
        aria-label="در حال برگزاری"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        در حال برگزاری
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-md border border-purple-300/30 text-[10px] font-black text-purple-100 shadow-[0_0_14px_rgba(168,85,247,.28)] tabular-nums whitespace-nowrap"
      aria-label={`تا شروع ${parts.days} روز و ${parts.hours} ساعت و ${parts.minutes} دقیقه`}
    >
      <span className="text-purple-200/80 font-bold">تا شروع</span>
      <span className="text-white">
        {toFa(parts.days)} روز {toFa2(parts.hours)} ساعت {toFa2(parts.minutes)} دقیقه
      </span>
    </span>
  );
}
