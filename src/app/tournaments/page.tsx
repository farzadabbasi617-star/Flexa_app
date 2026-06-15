"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import TournamentCardLuxury from "@/components/TournamentCardLuxury";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

interface Tournament {
  id: string;
  name: string;
  game: string;
  gameMode: string | null;
  maxPlayers: number;
  registeredCount: number;
  prizePool: string | null;
  winnersCount?: number;
  entryFee: string | null;
  startDate: string | null;
  bannerUrl?: string | null;
}

const GAME_META: Record<string, { fa: string; en: string; icon: string; accent: string }> = {
  clash_royale: { fa: "کلش رویال", en: "Clash Royale", icon: "⚔️", accent: "from-cyan-500 to-blue-700" },
  cod_mobile: { fa: "کالاف موبایل", en: "COD Mobile", icon: "🎯", accent: "from-orange-500 to-red-700" },
  fortnite: { fa: "فورتنایت", en: "Fortnite", icon: "🏗️", accent: "from-purple-500 to-pink-700" },
};

const DEFAULT_MODE_LABEL: Record<string, string> = {
  clash_royale: "دوئل / لیگ کلش",
  cod_mobile: "روم‌های کالاف",
  fortnite: "بتل رویال / کریتیو",
};

function normalizeMode(tournament: Tournament) {
  const value = tournament.gameMode?.trim();
  return value || DEFAULT_MODE_LABEL[tournament.game] || "سایر مودها";
}

function TournamentsContent({ canCreate }: { canCreate: boolean }) {
  const { lang } = useLanguage();
  const searchParams = useSearchParams();
  const gameFilter = searchParams.get("game");
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState(gameFilter || "all");

  const L = (fa: string, en: string) => (lang === "fa" ? fa : en);

  const fetchTournaments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (activeFilter !== "all") params.set("game", activeFilter);
      const res = await fetch(`/api/tournaments?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      setTournaments(Array.isArray(data) ? data : Array.isArray(data.data) ? data.data : []);
    } catch {
      setTournaments([]);
    }
    setLoading(false);
  }, [activeFilter]);

  useEffect(() => {
    fetchTournaments();
  }, [fetchTournaments]);

  const games = [
    { id: "all", name: L("همه", "All"), icon: "🎮" },
    ...Object.entries(GAME_META).map(([id, meta]) => ({ id, name: L(meta.fa, meta.en), icon: meta.icon })),
  ];

  const grouped = useMemo(() => {
    const result = new Map<string, Map<string, Tournament[]>>();

    for (const tournament of tournaments) {
      if (!result.has(tournament.game)) result.set(tournament.game, new Map());
      const mode = normalizeMode(tournament);
      const gameModes = result.get(tournament.game)!;
      if (!gameModes.has(mode)) gameModes.set(mode, []);
      gameModes.get(mode)!.push(tournament);
    }

    // Stable ordering: known games first, then custom/unknown.
    return Array.from(result.entries()).sort(([a], [b]) => {
      const order = ["cod_mobile", "fortnite", "clash_royale"];
      return (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b));
    });
  }, [tournaments]);

  return (
    <>
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2 snap-x">
        {games.map((g) => (
          <button
            key={g.id}
            onClick={() => setActiveFilter(g.id)}
            className={`snap-start whitespace-nowrap px-4 py-2.5 rounded-2xl text-sm font-black transition-all border ${
              activeFilter === g.id
                ? "bg-neon-purple/20 text-neon-purple border-neon-purple/50 shadow-[0_0_25px_rgba(168,85,247,.18)]"
                : "bg-dark-700 text-gray-400 border-gaming-border hover:border-neon-purple/30"
            }`}
          >
            {g.icon} {g.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-4xl animate-neon-pulse">🎮</div>
        </div>
      ) : tournaments.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">🏟️</div>
          <h3 className="text-xl font-bold mb-2">{L("هنوز تورنومنتی نیست", "No Tournaments Yet")}</h3>
          <p className="text-gray-400 mb-6">
            {canCreate
              ? L("اولین تورنومنت رو بساز!", "Create the first tournament!")
              : L("به‌زودی تورنومنت‌های جدید توسط مدیرها ساخته می‌شود.", "Admins will create tournaments soon.")}
          </p>
          {canCreate && (
            <Link href="/tournaments/create" className="gaming-btn">
              {L("ساخت تورنومنت", "Create Tournament")}
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-12">
          {grouped.map(([gameId, modeMap]) => {
            const meta = GAME_META[gameId] || { fa: gameId, en: gameId, icon: "🎮", accent: "from-purple-500 to-blue-700" };
            const modes = Array.from(modeMap.entries()).sort(([a], [b]) => a.localeCompare(b, "fa"));

            return (
              <section key={gameId} className="relative">
                <div className="flex items-center justify-between gap-4 mb-5">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${meta.accent} grid place-items-center text-2xl shadow-[0_0_28px_rgba(168,85,247,.18)]`}>
                      {meta.icon}
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-white">{L(meta.fa, meta.en)}</h2>
                      <p className="text-xs text-gray-500 mt-1">اسکرول افقی تورنومنت‌ها بر اساس مود بازی</p>
                    </div>
                  </div>
                  <Link href={`/tournaments?game=${gameId}`} className="text-xs font-black text-purple-300 whitespace-nowrap">
                    همه {L(meta.fa, meta.en)} ←
                  </Link>
                </div>

                <div className="space-y-8">
                  {modes.map(([mode, list]) => (
                    <div key={`${gameId}-${mode}`} className="gaming-card p-4 sm:p-5 overflow-hidden border-white/5">
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <div>
                          <h3 className="font-black text-neon-blue text-lg">{mode}</h3>
                          <p className="text-xs text-gray-500 mt-1">{list.length.toLocaleString("fa-IR")} تورنومنت فعال/ثبت‌شده</p>
                        </div>
                        <span className="text-xs px-3 py-1 rounded-full bg-white/5 text-gray-400 border border-white/10">
                          ← اسکرول کن
                        </span>
                      </div>

                      <div className="flex gap-5 overflow-x-auto snap-x pb-4 -mx-1 px-1">
                        {list.map((tournament) => (
                          <div key={tournament.id} className="snap-start shrink-0 w-[310px] sm:w-[340px]">
                            <TournamentCardLuxury t={tournament} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function TournamentsPage() {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const L = (fa: string, en: string) => (lang === "fa" ? fa : en);
  const canCreate = user?.role === "admin" || user?.role === "super_admin";

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              🏆 <span className="neon-text-purple">{L("تورنومنت‌ها", "Tournaments")}</span>
            </h1>
            <p className="text-gray-400 mt-1 text-sm">
              {L("هر بازی در مودهای خودش، با اسکرول افقی تورنومنت‌ها", "Browse tournaments by game and mode")}
            </p>
          </div>
          {canCreate && (
            <Link href="/tournaments/create" className="gaming-btn text-sm">
              + {L("تورنومنت جدید", "New Tournament")}
            </Link>
          )}
        </div>
        <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="text-4xl animate-neon-pulse">🎮</div></div>}>
          <TournamentsContent canCreate={Boolean(canCreate)} />
        </Suspense>
      </div>
    </div>
  );
}
