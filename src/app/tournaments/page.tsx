"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import TournamentCard from "@/components/TournamentCard";
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
  registeredCount: number;
}

function TournamentsContent() {
  const { t, lang } = useLanguage();
  const searchParams = useSearchParams();
  const gameFilter = searchParams.get("game");
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState(gameFilter || "all");

  const L = (fa: string, en: string) => lang === "fa" ? fa : en;

  const fetchTournaments = useCallback(async () => {
    setLoading(true);
    try {
      const url = activeFilter !== "all" ? `/api/tournaments?game=${activeFilter}` : "/api/tournaments";
      const res = await fetch(url);
      const data = await res.json();
      setTournaments(Array.isArray(data) ? data : []);
    } catch { setTournaments([]); }
    setLoading(false);
  }, [activeFilter]);

  useEffect(() => { fetchTournaments(); }, [fetchTournaments]);

  const games = [
    { id: "clash_royale", name: L("کلش رویال", "Clash Royale"), icon: "⚔️" },
    { id: "cod_mobile", name: L("کالاف موبایل", "COD Mobile"), icon: "🎯" },
    { id: "fortnite", name: L("فورتنایت", "Fortnite"), icon: "🏗️" },
  ];

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button onClick={() => setActiveFilter("all")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeFilter === "all" ? "bg-neon-purple/20 text-neon-purple border border-neon-purple/50" : "bg-dark-700 text-gray-400 border border-gaming-border hover:border-neon-purple/30"}`}>
          🎮 {L("همه", "All")}
        </button>
        {games.map((g) => (
          <button key={g.id} onClick={() => setActiveFilter(g.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeFilter === g.id ? "bg-neon-purple/20 text-neon-purple border border-neon-purple/50" : "bg-dark-700 text-gray-400 border border-gaming-border hover:border-neon-purple/30"}`}>
            {g.icon} {g.name}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-4xl animate-neon-pulse">🎮</div>
        </div>
      ) : tournaments.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">🏟️</div>
          <h3 className="text-xl font-bold mb-2">{L("هنوز تورنومنتی نیست", "No Tournaments Yet")}</h3>
          <p className="text-gray-400 mb-6">{L("اولین تورنومنت رو بساز!", "Create the first tournament!")}</p>
          <Link href="/tournaments/create" className="gaming-btn">{L("ساخت تورنومنت", "Create Tournament")}</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {tournaments.map((t) => (
            <TournamentCard key={t.id} tournament={t} />
          ))}
        </div>
      )}
    </>
  );
}

export default function TournamentsPage() {
  const { t, lang } = useLanguage();
  const L = (fa: string, en: string) => lang === "fa" ? fa : en;

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              🏆 <span className="neon-text-purple">{L("تورنومنت‌ها", "Tournaments")}</span>
            </h1>
            <p className="text-gray-400 mt-1 text-sm">{L("مرور و پیوستن به تورنومنت‌های فعال", "Browse and join active tournaments")}</p>
          </div>
          <Link href="/tournaments/create" className="gaming-btn text-sm">
            + {L("تورنومنت جدید", "New Tournament")}
          </Link>
        </div>
        <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="text-4xl animate-neon-pulse">🎮</div></div>}>
          <TournamentsContent />
        </Suspense>
      </div>
    </div>
  );
}
