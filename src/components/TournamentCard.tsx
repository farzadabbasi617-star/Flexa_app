"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

interface Tournament {
  id: string;
  name: string;
  game: "clash_royale" | "cod_mobile" | "fortnite";
  format: string;
  status: string;
  description: string | null;
  maxPlayers: number;
  prizePool: string | null;
  entryFee: string | null;
  gameMode: string | null;
  mapName: string | null;
  serverSlots: number | null;
  prize1st: string | null;
  prize2nd: string | null;
  prize3rd: string | null;
  prize4to10: string | null;
  rules: string | null;
  startDate: string | null;
  registeredCount?: number;
}

const GAME_DATA: Record<string, { icon: string; gradient: string; color: string }> = {
  clash_royale: { icon: "⚔️", gradient: "from-blue-600 to-cyan-500", color: "text-cyan-400" },
  cod_mobile: { icon: "🎯", gradient: "from-orange-600 to-red-500", color: "text-orange-400" },
  fortnite: { icon: "🏗️", gradient: "from-purple-600 to-pink-500", color: "text-purple-400" },
};

const FORMAT_LABELS: Record<string, { fa: string; en: string }> = {
  single_elimination: { fa: "حذفی", en: "Single Elim" },
  double_elimination: { fa: "حذفی دوگانه", en: "Double Elim" },
  round_robin: { fa: "دوره‌ای", en: "Round Robin" },
};

const STATUS_DATA: Record<string, { fa: string; en: string; color: string; bg: string; dot: string }> = {
  registration: { fa: "ثبت‌نام باز", en: "Open", color: "text-neon-green", bg: "bg-neon-green/10", dot: "bg-neon-green" },
  in_progress: { fa: "در حال اجرا", en: "Live", color: "text-neon-orange", bg: "bg-neon-orange/10", dot: "bg-neon-orange" },
  completed: { fa: "پایان یافته", en: "Ended", color: "text-gray-500", bg: "bg-gray-800", dot: "bg-gray-500" },
  cancelled: { fa: "لغو شده", en: "Cancelled", color: "text-red-400", bg: "bg-red-900/20", dot: "bg-red-400" },
};

function useCountdown(targetDate: string | null) {
  const [timeLeft, setTimeLeft] = useState("");
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!targetDate) { setTimeLeft(""); return; }

    function update() {
      const diff = new Date(targetDate!).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("");
        setIsExpired(true);
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);

      if (d > 0) setTimeLeft(`${d}d ${h}h`);
      else if (h > 0) setTimeLeft(`${h}h ${m}m`);
      else setTimeLeft(`${m}:${s.toString().padStart(2, "0")}`);
      setIsExpired(false);
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return { timeLeft, isExpired };
}

export default function TournamentCard({ tournament }: { tournament: Tournament }) {
  const { lang } = useLanguage();
  const [showRules, setShowRules] = useState(false);
  const { timeLeft, isExpired } = useCountdown(tournament.startDate);

  const L = (fa: string, en: string) => lang === "fa" ? fa : en;
  const game = GAME_DATA[tournament.game] || GAME_DATA.clash_royale;
  const gameName = L(
    tournament.game === "clash_royale" ? "کلش رویال" : tournament.game === "cod_mobile" ? "کالاف موبایل" : "فورتنایت",
    tournament.game === "clash_royale" ? "Clash Royale" : tournament.game === "cod_mobile" ? "COD Mobile" : "Fortnite"
  );
  const format = FORMAT_LABELS[tournament.format] || FORMAT_LABELS.single_elimination;
  const status = STATUS_DATA[tournament.status] || STATUS_DATA.registration;
  const regCount = tournament.registeredCount || 0;
  const spotsLeft = tournament.maxPlayers - regCount;
  const fillPercent = Math.min((regCount / tournament.maxPlayers) * 100, 100);
  const isFull = spotsLeft <= 0;

  return (
    <>
      <div className="gaming-card overflow-hidden group relative">
        {/* Top gradient bar */}
        <div className={`h-1.5 bg-gradient-to-r ${game.gradient}`} />

        <div className="p-5">
          {/* Row 1: Game badge + Status + Countdown */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r ${game.gradient} text-white text-xs font-bold`}>
                {game.icon} {gameName}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-dark-600 text-gray-400 font-medium">
                {L(format.fa, format.en)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${status.dot} ${tournament.status === "registration" ? "animate-neon-pulse" : ""}`} />
              <span className={`text-xs font-bold ${status.color}`}>{L(status.fa, status.en)}</span>
            </div>
          </div>

          {/* Row 2: Tournament Name */}
          <Link href={`/tournaments/${tournament.id}`} className="block">
            <h3 className="text-lg font-bold mb-1 group-hover:text-neon-blue transition-colors leading-tight">
              {tournament.name}
            </h3>
          </Link>

          {/* Row 3: Game Mode + Map */}
          {(tournament.gameMode || tournament.mapName) && (
            <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
              {tournament.gameMode && <span>🎮 {tournament.gameMode}</span>}
              {tournament.mapName && <span>🗺️ {tournament.mapName}</span>}
            </div>
          )}

          {/* Row 4: Countdown Timer */}
          {tournament.status === "registration" && timeLeft && (
            <div className="bg-dark-700 rounded-lg p-3 mb-3 flex items-center justify-between">
              <span className="text-xs text-gray-400">{L("⏳ تا شروع:", "⏳ Starts in:")}</span>
              <span className="text-lg font-bold font-mono text-neon-blue animate-neon-pulse">{timeLeft}</span>
            </div>
          )}
          {tournament.status === "registration" && isExpired && (
            <div className="bg-neon-green/10 rounded-lg p-3 mb-3 text-center">
              <span className="text-sm font-bold text-neon-green">🚀 {L("آماده شروع!", "Ready to start!")}</span>
            </div>
          )}

          {/* Row 5: Player Progress Bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-gray-400">
                👥 {L(`${regCount} ثبت‌نام`, `${regCount} joined`)}
              </span>
              <span className={isFull ? "text-neon-pink font-bold" : "text-gray-500"}>
                {isFull
                  ? L("🔴 تکمیل شد", "🔴 Full")
                  : L(`${spotsLeft} جای خالی`, `${spotsLeft} spots left`)}
              </span>
            </div>
            <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isFull
                    ? "bg-gradient-to-r from-neon-pink to-red-500"
                    : fillPercent > 70
                    ? "bg-gradient-to-r from-neon-orange to-neon-yellow"
                    : "bg-gradient-to-r from-neon-green to-neon-blue"
                }`}
                style={{ width: `${fillPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-gray-600">{regCount}/{tournament.maxPlayers}</span>
              {tournament.serverSlots && (
                <span className="text-gray-600">🖥️ {L(`${tournament.serverSlots} نفره`, `${tournament.serverSlots} slots`)}</span>
              )}
            </div>
          </div>

          {/* Row 6: Entry Fee + Prize */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-dark-700 rounded-lg p-2.5 text-center">
              <div className="text-xs text-gray-500 mb-0.5">{L("💳 ورودی", "💳 Entry")}</div>
              <div className={`text-sm font-bold ${tournament.entryFee === "رایگان" || tournament.entryFee === "Free" ? "text-neon-green" : "text-white"}`}>
                {tournament.entryFee || L("رایگان", "Free")}
              </div>
            </div>
            <div className="bg-dark-700 rounded-lg p-2.5 text-center">
              <div className="text-xs text-gray-500 mb-0.5">{L("🏆 کل جایزه", "🏆 Prize Pool")}</div>
              <div className="text-sm font-bold text-neon-yellow">
                {tournament.prizePool || "-"}
              </div>
            </div>
          </div>

          {/* Row 7: Prize Distribution */}
          {(tournament.prize1st || tournament.prize2nd || tournament.prize3rd) && (
            <div className="bg-dark-700/50 rounded-lg p-3 mb-3">
              <div className="text-xs text-gray-500 mb-2">{L("🎁 تقسیم جوایز:", "🎁 Prize Split:")}</div>
              <div className="grid grid-cols-4 gap-1.5 text-center">
                {tournament.prize1st && (
                  <div className="bg-yellow-500/10 rounded-lg p-1.5">
                    <div className="text-xs">🥇</div>
                    <div className="text-xs font-bold text-yellow-400">{tournament.prize1st}</div>
                  </div>
                )}
                {tournament.prize2nd && (
                  <div className="bg-gray-400/10 rounded-lg p-1.5">
                    <div className="text-xs">🥈</div>
                    <div className="text-xs font-bold text-gray-300">{tournament.prize2nd}</div>
                  </div>
                )}
                {tournament.prize3rd && (
                  <div className="bg-amber-700/10 rounded-lg p-1.5">
                    <div className="text-xs">🥉</div>
                    <div className="text-xs font-bold text-amber-500">{tournament.prize3rd}</div>
                  </div>
                )}
                {tournament.prize4to10 && (
                  <div className="bg-dark-600 rounded-lg p-1.5">
                    <div className="text-xs">4-10</div>
                    <div className="text-xs font-bold text-gray-400">{tournament.prize4to10}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Row 8: Actions */}
          <div className="flex gap-2">
            <Link href={`/tournaments/${tournament.id}`} className={`flex-1 text-center py-2.5 rounded-lg text-sm font-bold transition-all ${
              tournament.status === "registration" && !isFull
                ? "bg-gradient-to-r from-neon-purple to-neon-blue text-white hover:shadow-lg hover:shadow-neon-purple/30"
                : "bg-dark-600 text-gray-400"
            }`}>
              {tournament.status === "registration" && !isFull
                ? L("🎮 ثبت‌نام و ورود", "🎮 Join Now")
                : tournament.status === "in_progress"
                ? L("👁️ مشاهده", "👁️ Watch")
                : L("📋 جزئیات", "📋 Details")}
            </Link>
            {(tournament.rules || tournament.description) && (
              <button
                onClick={(e) => { e.preventDefault(); setShowRules(true); }}
                className="px-3 py-2.5 rounded-lg bg-dark-600 text-gray-400 hover:text-white text-sm transition-colors"
                title={L("قوانین", "Rules")}
              >
                📜
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Rules Modal */}
      {showRules && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setShowRules(false)}>
          <div className="gaming-card p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gradient-to-r ${game.gradient} text-white text-xs font-bold`}>
                  {game.icon} {gameName}
                </span>
                <h3 className="font-bold">{tournament.name}</h3>
              </div>
              <button onClick={() => setShowRules(false)} className="text-gray-500 hover:text-white text-xl">✕</button>
            </div>

            {/* Tournament Info */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-dark-700 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500">{L("فرمت", "Format")}</div>
                <div className="text-sm font-bold">{L(format.fa, format.en)}</div>
              </div>
              {tournament.gameMode && (
                <div className="bg-dark-700 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-500">{L("مود", "Mode")}</div>
                  <div className="text-sm font-bold">{tournament.gameMode}</div>
                </div>
              )}
              {tournament.mapName && (
                <div className="bg-dark-700 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-500">{L("مپ", "Map")}</div>
                  <div className="text-sm font-bold">{tournament.mapName}</div>
                </div>
              )}
              <div className="bg-dark-700 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500">{L("ظرفیت", "Capacity")}</div>
                <div className="text-sm font-bold">{tournament.maxPlayers} {L("نفر", "players")}</div>
              </div>
            </div>

            {/* Description */}
            {tournament.description && (
              <div className="mb-4">
                <h4 className="font-bold text-neon-blue text-sm mb-2">{L("📝 توضیحات", "📝 Description")}</h4>
                <p className="text-sm text-gray-300 leading-relaxed">{tournament.description}</p>
              </div>
            )}

            {/* Rules */}
            {tournament.rules && (
              <div className="mb-4">
                <h4 className="font-bold text-neon-purple text-sm mb-2">{L("📜 قوانین", "📜 Rules")}</h4>
                <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed bg-dark-700 rounded-lg p-4">
                  {tournament.rules}
                </div>
              </div>
            )}

            {/* Prize Details */}
            {(tournament.prize1st || tournament.prizePool) && (
              <div>
                <h4 className="font-bold text-neon-yellow text-sm mb-2">{L("🏆 جوایز", "🏆 Prizes")}</h4>
                <div className="space-y-2">
                  {tournament.prize1st && (
                    <div className="flex items-center justify-between bg-yellow-500/10 rounded-lg p-3">
                      <span className="text-sm">🥇 {L("نفر اول", "1st Place")}</span>
                      <span className="font-bold text-yellow-400">{tournament.prize1st}</span>
                    </div>
                  )}
                  {tournament.prize2nd && (
                    <div className="flex items-center justify-between bg-gray-400/10 rounded-lg p-3">
                      <span className="text-sm">🥈 {L("نفر دوم", "2nd Place")}</span>
                      <span className="font-bold text-gray-300">{tournament.prize2nd}</span>
                    </div>
                  )}
                  {tournament.prize3rd && (
                    <div className="flex items-center justify-between bg-amber-700/10 rounded-lg p-3">
                      <span className="text-sm">🥉 {L("نفر سوم", "3rd Place")}</span>
                      <span className="font-bold text-amber-500">{tournament.prize3rd}</span>
                    </div>
                  )}
                  {tournament.prize4to10 && (
                    <div className="flex items-center justify-between bg-dark-600 rounded-lg p-3">
                      <span className="text-sm">🏅 {L("نفرات ۴ تا ۱۰", "4th-10th Place")}</span>
                      <span className="font-bold text-gray-400">{tournament.prize4to10}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Close button */}
            <button onClick={() => setShowRules(false)} className="gaming-btn w-full mt-6 py-3">
              {L("بستن", "Close")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
