"use client";

import React, { memo, useEffect, useState } from "react";
import Link from "next/link";

interface Tournament {
  id: string;
  name: string;
  game: string;
  maxPlayers: number;
  registeredCount: number;
  prizePool: string | null;
  winnersCount?: number;
  entryFee: string | null;
  startDate: string | null;
  bannerUrl?: string | null;
}

function useCountdown(targetDate: string | null) {
  const [value, setValue] = useState("");
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!targetDate) {
      setValue("");
      setExpired(false);
      return;
    }

    function update() {
      const diff = new Date(targetDate!).getTime() - Date.now();
      if (diff <= 0) {
        setValue("شروع شده");
        setExpired(true);
        return;
      }

      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      if (days > 0) setValue(`${days.toLocaleString("fa-IR")} روز و ${hours.toLocaleString("fa-IR")} ساعت`);
      else if (hours > 0) setValue(`${hours.toLocaleString("fa-IR")} ساعت و ${minutes.toLocaleString("fa-IR")} دقیقه`);
      else setValue(`${minutes.toLocaleString("fa-IR")}:${seconds.toString().padStart(2, "0")}`);
      setExpired(false);
    }

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  return { value, expired };
}

const GAME_FALLBACK: Record<string, string> = {
  cod_mobile: "radial-gradient(circle at 75% 28%, rgba(255,140,0,.45), transparent 22%), linear-gradient(135deg,#090a10,#3a220d)",
  fortnite: "radial-gradient(circle at 75% 28%, rgba(188,0,255,.42), transparent 22%), linear-gradient(135deg,#090a10,#28103a)",
  clash_royale: "radial-gradient(circle at 75% 28%, rgba(0,210,255,.38), transparent 22%), linear-gradient(135deg,#080a12,#09283a)",
};

const TournamentCardLuxury = ({ t }: { t: Tournament }) => {
  const spotsLeft = Math.max(0, t.maxPlayers - (t.registeredCount || 0));
  const { value: countdown, expired } = useCountdown(t.startDate);

  const formatTournamentDate = (dateStr: string | null) => {
    if (!dateStr) return "زمان نامشخص";
    const date = new Date(dateStr);
    return date.toLocaleString("fa-IR", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="relative overflow-hidden rounded-[35px] bg-[#111115] border border-white/5 shadow-2xl mb-6 fx-card">
      <div className="relative h-44 w-full">
        <div className="absolute inset-0" style={{ background: GAME_FALLBACK[t.game] || GAME_FALLBACK.clash_royale }} />
        {t.bannerUrl && <img src={t.bannerUrl} alt={t.name} className="absolute inset-0 w-full h-full object-cover opacity-70" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#111115] via-black/15 to-transparent" />
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-purple-500/20 blur-3xl animate-float-slow" />

        <div className="absolute bottom-4 left-6 right-6 text-right">
          <h3 className="text-2xl font-black en-font tracking-tighter text-white drop-shadow-md">
            {t.name}
          </h3>
        </div>

        <div className="absolute top-4 right-4 bg-black/45 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-white/10">
          <span className="text-[10px] font-black text-white">
            {spotsLeft === 0 ? "تکمیل ظرفیت" : `${spotsLeft.toLocaleString("fa-IR")} نفر باقی مانده`}
          </span>
        </div>
      </div>

      <div className="p-6 pt-3 space-y-4">
        <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-2xl flex items-center justify-between">
          <div className="text-right">
            <p className="text-sm font-black text-yellow-500">
              {t.prizePool || "بدون جایزه نقدی"} {t.prizePool ? `برای ${t.winnersCount || 1} نفر` : ""}
            </p>
          </div>
          <span className="text-xl">🏆</span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div className="bg-white/5 border border-white/5 p-3 rounded-2xl flex items-center justify-center gap-3">
            <span className="text-xs font-bold text-gray-300">{formatTournamentDate(t.startDate)}</span>
            <span className="opacity-40">📅</span>
          </div>

          {countdown && (
            <div className={`p-3 rounded-2xl border flex items-center justify-between ${expired ? "bg-green-500/10 border-green-500/20" : "bg-purple-500/10 border-purple-500/20"}`}>
              <span className="text-xs font-black text-gray-400">⏳ تا شروع</span>
              <span className={`text-sm font-black ${expired ? "text-green-400" : "text-purple-300 animate-neon-pulse"}`}>{countdown}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-right">
            <span className="text-lg font-black num-en">{t.entryFee || "رایگان"}</span>
            {t.entryFee && t.entryFee !== "رایگان" && <span className="text-[10px] font-bold text-gray-500 mr-1">تومان</span>}
          </div>
          <Link href={`/tournaments/${t.id}`} className="bg-gradient-to-r from-purple-600 to-blue-600 px-8 py-3 rounded-2xl font-black text-sm flex items-center gap-2 shadow-lg shadow-purple-500/20 active:scale-95 transition-all">
            مشاهده
            <span className="text-xs">❮</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default memo(TournamentCardLuxury);
