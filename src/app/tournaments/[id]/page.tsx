"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";

interface Player {
  id: string;
  username: string;
  displayName: string;
  rating: number;
  wins: number;
  losses: number;
}

interface Match {
  id: string;
  round: number;
  matchNumber: number;
  player1Id: string | null;
  player2Id: string | null;
  winnerId: string | null;
  player1Score: number | null;
  player2Score: number | null;
  status: "pending" | "in_progress" | "awaiting_judgment" | "completed" | "disputed";
}

interface Registration {
  registration: { id: string; playerId: string };
  player: Player | null;
}

interface Tournament {
  id: string;
  name: string;
  game: "clash_royale" | "cod_mobile" | "fortnite";
  format: string;
  status: "registration" | "in_progress" | "completed" | "cancelled";
  description: string | null;
  maxPlayers: number;
  prizePool: string | null;
  rules: string | null;
  registrations: Registration[];
  matches: Match[];
}

const GAMES_DATA = {
  clash_royale: { icon: "⚔️", bgGradient: "from-blue-600 to-cyan-500" },
  cod_mobile: { icon: "🎯", bgGradient: "from-orange-600 to-red-500" },
  fortnite: { icon: "🏗️", bgGradient: "from-purple-600 to-pink-500" },
};

const STATUS_STYLES = {
  registration: { color: "text-neon-blue", bg: "bg-blue-900/30" },
  in_progress: { color: "text-neon-green", bg: "bg-green-900/30" },
  completed: { color: "text-gray-400", bg: "bg-gray-700" },
  cancelled: { color: "text-neon-pink", bg: "bg-red-900/30" },
};

const MATCH_STATUS_STYLES = {
  pending: { color: "text-gray-400", bg: "bg-gray-700" },
  in_progress: { color: "text-neon-yellow", bg: "bg-yellow-900/30" },
  awaiting_judgment: { color: "text-neon-orange", bg: "bg-orange-900/30" },
  completed: { color: "text-neon-green", bg: "bg-green-900/30" },
  disputed: { color: "text-neon-pink", bg: "bg-red-900/30" },
};

export default function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useLanguage();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "bracket" | "players" | "rules">("overview");
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    fetchTournament();
    fetchPlayers();
  }, [id]);

  async function fetchTournament() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${id}`);
      const data = await res.json();
      setTournament(data);
    } catch {
      // handle error
    }
    setLoading(false);
  }

  async function fetchPlayers() {
    try {
      const res = await fetch("/api/players");
      const data = await res.json();
      setAllPlayers(Array.isArray(data) ? data : []);
    } catch {
      // handle error
    }
  }

  async function registerPlayer() {
    if (!selectedPlayer) return;
    setRegistering(true);
    try {
      await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: id, playerId: selectedPlayer }),
      });
      await fetchTournament();
      setSelectedPlayer("");
    } catch {
      // handle error
    }
    setRegistering(false);
  }

  async function generateBrackets() {
    try {
      await fetch(`/api/tournaments/${id}/generate-brackets`, { method: "POST" });
      await fetchTournament();
      setTab("bracket");
    } catch {
      // handle error
    }
  }

  async function updateMatchScore(matchId: string, p1Score: number, p2Score: number) {
    const winnerId =
      p1Score > p2Score
        ? tournament?.matches.find((m) => m.id === matchId)?.player1Id
        : tournament?.matches.find((m) => m.id === matchId)?.player2Id;

    try {
      await fetch(`/api/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player1Score: p1Score,
          player2Score: p2Score,
          winnerId,
          status: "completed",
        }),
      });
      await fetchTournament();
    } catch {
      // handle error
    }
  }

  function getPlayerName(playerId: string | null): string {
    if (!playerId) return t.tournamentDetail.tbd;
    const reg = tournament?.registrations.find((r) => r.player?.id === playerId);
    return reg?.player?.displayName || t.common.unknown;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-900">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-neon-pulse">🏆</div>
            <p className="text-gray-400">{t.tournamentDetail.loading}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-dark-900">
        <Navbar />
        <div className="text-center py-32">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-bold mb-4">{t.tournamentDetail.notFound}</h2>
          <Link href="/tournaments" className="gaming-btn">
            {t.tournamentDetail.backToTournaments}
          </Link>
        </div>
      </div>
    );
  }

  const gameData = GAMES_DATA[tournament.game];
  const gameName = t.games[tournament.game];
  const statusStyle = STATUS_STYLES[tournament.status];
  const statusLabel = t.statuses[tournament.status];
  const registeredIds = new Set(tournament.registrations.map((r) => r.registration.playerId));
  const availablePlayers = allPlayers.filter((p) => !registeredIds.has(p.id));

  const roundsMap = new Map<number, Match[]>();
  tournament.matches.forEach((m) => {
    if (!roundsMap.has(m.round)) roundsMap.set(m.round, []);
    roundsMap.get(m.round)!.push(m);
  });
  const rounds = Array.from(roundsMap.entries()).sort(([a], [b]) => a - b);

  const tabs = [
    { key: "overview", label: t.tournamentDetail.overview, icon: "📋" },
    { key: "bracket", label: t.tournamentDetail.bracket, icon: "🏆" },
    { key: "players", label: t.tournamentDetail.players, icon: "👥" },
    { key: "rules", label: t.tournamentDetail.rules, icon: "📜" },
  ] as const;

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Tournament Header */}
        <div className="gaming-card p-6 sm:p-8 mb-8">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <div className="text-6xl">{gameData.icon}</div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r ${gameData.bgGradient} text-white text-xs font-bold`}
                >
                  {gameName}
                </span>
                <span
                  className={`text-xs px-3 py-1 rounded-full ${statusStyle.bg} ${statusStyle.color} font-medium`}
                >
                  {statusLabel}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">{tournament.name}</h1>
              {tournament.description && (
                <p className="text-gray-400">{tournament.description}</p>
              )}
              <div className="flex flex-wrap gap-4 mt-4 text-sm">
                <span className="text-gray-400">
                  👥 {tournament.registrations.length}/{tournament.maxPlayers} {t.tournamentDetail.players}
                </span>
                {tournament.prizePool && (
                  <span className="text-neon-green font-bold">💰 {tournament.prizePool}</span>
                )}
                <span className="text-gray-400">
                  📋 {t.formats[tournament.format as keyof typeof t.formats] || tournament.format}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {tournament.status === "registration" && tournament.registrations.length >= 2 && (
                <button onClick={generateBrackets} className="gaming-btn text-sm">
                  ⚔️ {t.tournamentDetail.generateBrackets}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto">
          {tabs.map((tabItem) => (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize whitespace-nowrap transition-all ${
                tab === tabItem.key
                  ? "bg-neon-purple/20 text-neon-purple border border-neon-purple/50"
                  : "text-gray-400 hover:text-white hover:bg-dark-600"
              }`}
            >
              {tabItem.icon} {tabItem.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="gaming-card p-6">
              <h3 className="text-lg font-bold mb-4 neon-text-blue">{t.tournamentDetail.quickStats}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-dark-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-neon-purple">
                    {tournament.registrations.length}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{t.tournamentDetail.players}</div>
                </div>
                <div className="bg-dark-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-neon-blue">
                    {tournament.matches.length}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{t.home.matches}</div>
                </div>
                <div className="bg-dark-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-neon-green">
                    {tournament.matches.filter((m) => m.status === "completed").length}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{t.tournamentDetail.completed}</div>
                </div>
                <div className="bg-dark-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-neon-orange">{rounds.length}</div>
                  <div className="text-xs text-gray-400 mt-1">{t.tournamentDetail.rounds}</div>
                </div>
              </div>
            </div>

            {tournament.status === "registration" && (
              <div className="gaming-card p-6">
                <h3 className="text-lg font-bold mb-4 neon-text-purple">
                  {t.tournamentDetail.registerPlayer}
                </h3>
                {availablePlayers.length === 0 ? (
                  <p className="text-gray-400 text-sm">{t.tournamentDetail.noAvailablePlayers}</p>
                ) : (
                  <div className="flex gap-2">
                    <select
                      className="gaming-select flex-1"
                      value={selectedPlayer}
                      onChange={(e) => setSelectedPlayer(e.target.value)}
                    >
                      <option value="">{t.tournamentDetail.selectPlayer}</option>
                      {availablePlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.displayName} ({t.tournamentDetail.rating}: {p.rating})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={registerPlayer}
                      disabled={!selectedPlayer || registering}
                      className="gaming-btn disabled:opacity-50 text-sm"
                    >
                      {registering ? "..." : t.tournamentDetail.register}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="gaming-card p-6 lg:col-span-2">
              <h3 className="text-lg font-bold mb-4 neon-text-blue">{t.tournamentDetail.matchResults}</h3>
              {tournament.matches.length === 0 ? (
                <p className="text-gray-400 text-sm">{t.tournamentDetail.noMatchesYet}</p>
              ) : (
                <div className="space-y-2">
                  {tournament.matches
                    .filter((m) => m.player1Id && m.player2Id)
                    .slice(0, 10)
                    .map((match) => {
                      const mStatus = MATCH_STATUS_STYLES[match.status];
                      const mLabel = t.matchStatuses[match.status];
                      return (
                        <div
                          key={match.id}
                          className="flex items-center gap-3 bg-dark-700 rounded-lg p-3"
                        >
                          <span className="text-xs text-gray-500 w-16">
                            R{match.round} M{match.matchNumber}
                          </span>
                          <div className="flex-1 flex items-center gap-2">
                            <span
                              className={`font-medium text-sm ${
                                match.winnerId === match.player1Id
                                  ? "text-neon-green"
                                  : "text-gray-300"
                              }`}
                            >
                              {getPlayerName(match.player1Id)}
                            </span>
                            <span className="text-gray-500 text-xs">
                              {match.player1Score ?? "-"} : {match.player2Score ?? "-"}
                            </span>
                            <span
                              className={`font-medium text-sm ${
                                match.winnerId === match.player2Id
                                  ? "text-neon-green"
                                  : "text-gray-300"
                              }`}
                            >
                              {getPlayerName(match.player2Id)}
                            </span>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full ${mStatus.bg} ${mStatus.color}`}>
                            {mLabel}
                          </span>
                          {match.status === "pending" && match.player1Id && match.player2Id && (
                            <Link
                              href={`/judging?matchId=${match.id}`}
                              className="text-xs text-neon-blue hover:underline"
                            >
                              {t.tournamentDetail.judge} →
                            </Link>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "bracket" && (
          <div className="gaming-card p-6 overflow-x-auto">
            <h3 className="text-lg font-bold mb-6 neon-text-blue">{t.tournamentDetail.bracket}</h3>
            {rounds.length === 0 ? (
              <p className="text-gray-400 text-center py-12">
                {t.tournamentDetail.bracketsNotGenerated}
                {tournament.status === "registration" && ` ${t.tournamentDetail.registerAndGenerate}`}
              </p>
            ) : (
              <div className="flex gap-8 min-w-max pb-4">
                {rounds.map(([roundNum, roundMatches]) => (
                  <div key={roundNum} className="flex flex-col gap-4">
                    <div className="text-center text-sm font-bold text-neon-purple mb-2">
                      {roundNum === rounds.length
                        ? `🏆 ${t.tournamentDetail.final}`
                        : roundNum === rounds.length - 1
                        ? t.tournamentDetail.semiFinals
                        : `${t.tournamentDetail.round} ${roundNum}`}
                    </div>
                    <div
                      className="flex flex-col gap-4 justify-around"
                      style={{
                        minHeight: roundNum > 1 ? `${roundMatches.length * 120}px` : undefined,
                      }}
                    >
                      {roundMatches.map((match) => (
                        <BracketMatch
                          key={match.id}
                          match={match}
                          getPlayerName={getPlayerName}
                          onScore={updateMatchScore}
                          t={t}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "players" && (
          <div className="gaming-card p-6">
            <h3 className="text-lg font-bold mb-4 neon-text-blue">
              {t.tournamentDetail.registeredPlayers} ({tournament.registrations.length})
            </h3>
            {tournament.registrations.length === 0 ? (
              <p className="text-gray-400 text-center py-8">
                {t.tournamentDetail.noPlayersRegistered}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {tournament.registrations.map((reg, idx) => (
                  <div
                    key={reg.registration.id}
                    className="flex items-center gap-3 bg-dark-700 rounded-lg p-3"
                  >
                    <span className="w-8 h-8 rounded-full bg-neon-purple/20 flex items-center justify-center text-sm font-bold text-neon-purple">
                      {idx + 1}
                    </span>
                    <div className="flex-1">
                      <div className="font-medium text-sm">
                        {reg.player?.displayName || t.common.unknown}
                      </div>
                      <div className="text-xs text-gray-400">
                        @{reg.player?.username} · {t.tournamentDetail.rating}: {reg.player?.rating}
                      </div>
                    </div>
                    <div className="text-end text-xs">
                      <div className="text-neon-green">{reg.player?.wins}W</div>
                      <div className="text-neon-pink">{reg.player?.losses}L</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "rules" && (
          <div className="gaming-card p-6">
            <h3 className="text-lg font-bold mb-4 neon-text-blue">
              📜 {t.tournamentDetail.tournamentRules}
            </h3>
            {tournament.rules ? (
              <div className="text-gray-300 whitespace-pre-wrap">{tournament.rules}</div>
            ) : (
              <p className="text-gray-400">{t.tournamentDetail.noRulesSet}</p>
            )}

            <div className="mt-8 border-t border-gaming-border pt-6">
              <h4 className="font-bold mb-3 text-neon-purple">⚖️ {t.tournamentDetail.judgingSystem}</h4>
              <div className="text-gray-300 text-sm space-y-2">
                <p>{t.tournamentDetail.judgingSystemDesc}</p>
                <ul className="list-disc list-inside space-y-1 text-gray-400 ps-2">
                  <li>{t.tournamentDetail.judgingPoint1}</li>
                  <li>{t.tournamentDetail.judgingPoint2}</li>
                  <li>{t.tournamentDetail.judgingPoint3}</li>
                  <li>{t.tournamentDetail.judgingPoint4}</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BracketMatch({
  match,
  getPlayerName,
  onScore,
  t,
}: {
  match: Match;
  getPlayerName: (id: string | null) => string;
  onScore: (matchId: string, p1: number, p2: number) => void;
  t: ReturnType<typeof useLanguage>["t"];
}) {
  const [editing, setEditing] = useState(false);
  const [p1, setP1] = useState(match.player1Score?.toString() || "0");
  const [p2, setP2] = useState(match.player2Score?.toString() || "0");

  return (
    <div className="w-60 bg-dark-700 rounded-lg border border-gaming-border overflow-hidden">
      <div
        className={`flex items-center justify-between px-3 py-2 border-b border-gaming-border ${
          match.winnerId === match.player1Id ? "bg-neon-green/10" : ""
        }`}
      >
        <span
          className={`text-sm truncate flex-1 ${
            match.winnerId === match.player1Id
              ? "text-neon-green font-bold"
              : match.player1Id
              ? "text-gray-200"
              : "text-gray-500"
          }`}
        >
          {getPlayerName(match.player1Id)}
        </span>
        <span className="text-sm font-mono text-gray-400 ms-2">
          {match.player1Score ?? "-"}
        </span>
      </div>

      <div
        className={`flex items-center justify-between px-3 py-2 ${
          match.winnerId === match.player2Id ? "bg-neon-green/10" : ""
        }`}
      >
        <span
          className={`text-sm truncate flex-1 ${
            match.winnerId === match.player2Id
              ? "text-neon-green font-bold"
              : match.player2Id
              ? "text-gray-200"
              : "text-gray-500"
          }`}
        >
          {getPlayerName(match.player2Id)}
        </span>
        <span className="text-sm font-mono text-gray-400 ms-2">
          {match.player2Score ?? "-"}
        </span>
      </div>

      {match.status === "pending" && match.player1Id && match.player2Id && (
        <div className="border-t border-gaming-border p-2">
          {editing ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                className="w-12 bg-dark-800 text-center text-sm rounded px-1 py-0.5 text-white border border-gaming-border"
                value={p1}
                onChange={(e) => setP1(e.target.value)}
              />
              <span className="text-gray-500 text-xs">:</span>
              <input
                type="number"
                min="0"
                className="w-12 bg-dark-800 text-center text-sm rounded px-1 py-0.5 text-white border border-gaming-border"
                value={p2}
                onChange={(e) => setP2(e.target.value)}
              />
              <button
                onClick={() => {
                  onScore(match.id, parseInt(p1), parseInt(p2));
                  setEditing(false);
                }}
                className="text-xs bg-neon-green/20 text-neon-green px-2 py-0.5 rounded hover:bg-neon-green/30"
              >
                ✓
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-neon-blue hover:underline w-full text-center"
            >
              {t.tournamentDetail.enterScore}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
