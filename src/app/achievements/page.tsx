"use client";

import { useCallback, useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

interface Achievement {
  id: string;
  name: string;
  nameFA: string;
  description: string;
  descriptionFA: string;
  icon: string;
  category: string;
  requirement: number;
  points: number;
  unlocked: boolean;
  progress?: number;
  progressPercent?: number;
}

const CATEGORY_LABELS = {
  en: { wins: "Wins", tournaments: "Tournaments", rating: "Rating", special: "Special" },
  fa: { wins: "بردها", tournaments: "تورنومنت‌ها", rating: "امتیاز", special: "ویژه" },
};

export default function AchievementsPage() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const fetchAchievements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/achievements");
      const data = await res.json();
      setAchievements(Array.isArray(data) ? data : []);
    } catch {
      setAchievements([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAchievements();
  }, [fetchAchievements]);

  const categories = ["all", "wins", "tournaments", "rating", "special"];
  const filteredAchievements =
    filter === "all"
      ? achievements
      : achievements.filter((a) => a.category === filter);

  const totalPoints = achievements
    .filter((a) => a.unlocked)
    .reduce((sum, a) => sum + a.points, 0);

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">
            🏅 <span className="neon-text-purple">{t.achievementsPage.title}</span>
          </h1>
          <p className="text-gray-400">{t.achievementsPage.subtitle}</p>
          {user && (
            <button onClick={fetchAchievements} className="mt-4 px-4 py-2 rounded-xl bg-dark-700 text-xs font-black text-neon-blue hover:bg-dark-600">
              🔄 بروزرسانی دستاوردها
            </button>
          )}
        </div>

        {/* Stats */}
        {user && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
            <div className="gaming-card p-4 text-center">
              <div className="text-2xl font-bold text-neon-purple">
                {unlockedCount}/{achievements.length}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {t.achievementsPage.unlocked}
              </div>
            </div>
            <div className="gaming-card p-4 text-center">
              <div className="text-2xl font-bold text-neon-blue">{totalPoints}</div>
              <div className="text-xs text-gray-500 mt-1">{t.achievementsPage.points}</div>
            </div>
            <div className="gaming-card p-4 text-center col-span-2 sm:col-span-1">
              <div className="text-2xl font-bold text-neon-green">
                {achievements.length > 0
                  ? Math.round((unlockedCount / achievements.length) * 100)
                  : 0}
                %
              </div>
              <div className="text-xs text-gray-500 mt-1">{t.achievementsPage.progress}</div>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="flex flex-wrap gap-2 justify-center mb-8">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === cat
                  ? "bg-neon-purple/20 text-neon-purple border border-neon-purple/50"
                  : "bg-dark-700 text-gray-400 border border-gaming-border hover:border-neon-purple/30"
              }`}
            >
              {cat === "all"
                ? lang === "fa"
                  ? "همه"
                  : "All"
                : CATEGORY_LABELS[lang === "fa" ? "fa" : "en"][cat as keyof typeof CATEGORY_LABELS.en]}
            </button>
          ))}
        </div>

        {/* Achievements Grid */}
        {loading ? (
          <div className="text-center py-20">
            <div className="text-4xl animate-neon-pulse mb-4">🏅</div>
            <p className="text-gray-400">{lang === "fa" ? "در حال بارگذاری..." : "Loading..."}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAchievements.map((achievement) => (
              <div
                key={achievement.id}
                className={`gaming-card p-5 relative overflow-hidden ${
                  achievement.unlocked
                    ? "border-neon-green/50"
                    : "opacity-60 grayscale"
                }`}
              >
                {achievement.unlocked && (
                  <div className="absolute top-2 end-2">
                    <span className="text-neon-green text-xl">✓</span>
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <div
                    className={`w-14 h-14 rounded-xl flex items-center justify-center text-3xl ${
                      achievement.unlocked
                        ? "bg-gradient-to-br from-neon-purple to-neon-blue"
                        : "bg-dark-600"
                    }`}
                  >
                    {achievement.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold">
                      {lang === "fa" ? achievement.nameFA : achievement.name}
                    </h3>
                    <p className="text-sm text-gray-400">
                      {lang === "fa" ? achievement.descriptionFA : achievement.description}
                    </p>
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                        <span>پیشرفت</span>
                        <span>{(achievement.progress || 0).toLocaleString("fa-IR")} / {achievement.requirement.toLocaleString("fa-IR")}</span>
                      </div>
                      <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${achievement.unlocked ? "bg-neon-green" : "bg-gradient-to-r from-neon-purple to-neon-blue"}`}
                          style={{ width: `${achievement.progressPercent || 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-neon-purple/20 text-neon-purple">
                        {achievement.points} {t.achievementsPage.points}
                      </span>
                      <span className="text-xs text-gray-500">
                        {CATEGORY_LABELS[lang === "fa" ? "fa" : "en"][
                          achievement.category as keyof typeof CATEGORY_LABELS.en
                        ]}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
