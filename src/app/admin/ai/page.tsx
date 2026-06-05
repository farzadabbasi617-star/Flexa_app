"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

interface AIStats {
  totalJudgments: number;
  autoApplied: number;
  needsReview: number;
  avgConfidence: number;
  moderatedMessages: number;
  blockedMessages: number;
}

export default function AIAdminPage() {
  const { t, lang } = useLanguage();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<AIStats>({
    totalJudgments: 0,
    autoApplied: 0,
    needsReview: 0,
    avgConfidence: 0,
    moderatedMessages: 0,
    blockedMessages: 0,
  });
  const [testMessage, setTestMessage] = useState("");
  const [moderationResult, setModerationResult] = useState<{
    isAllowed: boolean;
    toxicityScore: number;
    categories: string[];
    suggestion: string | null;
  } | null>(null);
  const [testQuery, setTestQuery] = useState("");
  const [assistantResult, setAssistantResult] = useState<{
    response: string;
    suggestions: string[];
  } | null>(null);

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) {
      // Allow for demo purposes, but show warning
    }
  }, [loading, user, router]);

  async function testModeration() {
    if (!testMessage.trim()) return;
    
    try {
      const res = await fetch("/api/ai/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: testMessage }),
      });
      const data = await res.json();
      setModerationResult(data);
    } catch {
      // handle error
    }
  }

  async function testAssistant() {
    if (!testQuery.trim()) return;
    
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: testQuery, lang }),
      });
      const data = await res.json();
      setAssistantResult(data);
    } catch {
      // handle error
    }
  }

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-8">
          <span className="text-4xl">🤖</span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold neon-text-purple">
              {lang === "fa" ? "پنل مدیریت هوش مصنوعی" : "AI Control Panel"}
            </h1>
            <p className="text-gray-400">
              {lang === "fa"
                ? "مدیریت و نظارت بر سیستم‌های هوش مصنوعی"
                : "Manage and monitor AI systems"}
            </p>
          </div>
        </div>

        {/* AI Systems Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            {
              title: lang === "fa" ? "داوری AI" : "AI Judging",
              icon: "⚖️",
              status: "active",
              statusColor: "text-neon-green",
            },
            {
              title: lang === "fa" ? "مدریشن چت" : "Chat Moderation",
              icon: "🛡️",
              status: "active",
              statusColor: "text-neon-green",
            },
            {
              title: lang === "fa" ? "دستیار هوشمند" : "AI Assistant",
              icon: "💬",
              status: "active",
              statusColor: "text-neon-green",
            },
            {
              title: lang === "fa" ? "تحلیل بازیکنان" : "Player Analytics",
              icon: "📊",
              status: "active",
              statusColor: "text-neon-green",
            },
          ].map((system) => (
            <div key={system.title} className="gaming-card p-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{system.icon}</span>
                <div>
                  <h3 className="font-bold text-sm">{system.title}</h3>
                  <span className={`text-xs ${system.statusColor}`}>
                    ● {system.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Test Moderation */}
          <div className="gaming-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">🛡️</span>
              <h3 className="font-bold text-neon-blue">
                {lang === "fa" ? "تست مدریشن پیام" : "Test Message Moderation"}
              </h3>
            </div>

            <div className="space-y-4">
              <textarea
                className="gaming-input min-h-[80px] resize-none"
                placeholder={lang === "fa" ? "پیام تست..." : "Test message..."}
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
              />
              <button onClick={testModeration} className="gaming-btn text-sm">
                {lang === "fa" ? "تحلیل پیام" : "Analyze Message"}
              </button>

              {moderationResult && (
                <div
                  className={`p-4 rounded-lg ${
                    moderationResult.isAllowed
                      ? "bg-neon-green/10 border border-neon-green/30"
                      : "bg-neon-pink/10 border border-neon-pink/30"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">
                      {moderationResult.isAllowed ? "✅" : "🚫"}
                    </span>
                    <span
                      className={`font-bold ${
                        moderationResult.isAllowed ? "text-neon-green" : "text-neon-pink"
                      }`}
                    >
                      {moderationResult.isAllowed
                        ? lang === "fa"
                          ? "مجاز"
                          : "Allowed"
                        : lang === "fa"
                        ? "مسدود"
                        : "Blocked"}
                    </span>
                  </div>
                  <div className="text-sm space-y-1">
                    <p className="text-gray-400">
                      {lang === "fa" ? "سطح سمیت:" : "Toxicity:"}{" "}
                      <span className="text-white">{moderationResult.toxicityScore}%</span>
                    </p>
                    {moderationResult.categories.length > 0 && (
                      <p className="text-gray-400">
                        {lang === "fa" ? "دسته‌بندی:" : "Categories:"}{" "}
                        <span className="text-white">
                          {moderationResult.categories.join(", ")}
                        </span>
                      </p>
                    )}
                    {moderationResult.suggestion && (
                      <p className="text-neon-orange text-xs mt-2">
                        💡 {moderationResult.suggestion}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Test Assistant */}
          <div className="gaming-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">💬</span>
              <h3 className="font-bold text-neon-purple">
                {lang === "fa" ? "تست دستیار هوشمند" : "Test AI Assistant"}
              </h3>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                className="gaming-input"
                placeholder={lang === "fa" ? "سوال بپرس..." : "Ask a question..."}
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && testAssistant()}
              />
              <button onClick={testAssistant} className="gaming-btn text-sm">
                {lang === "fa" ? "ارسال سوال" : "Send Query"}
              </button>

              {assistantResult && (
                <div className="bg-dark-700 rounded-lg p-4">
                  <p className="text-gray-200 text-sm whitespace-pre-wrap">
                    {assistantResult.response}
                  </p>
                  {assistantResult.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {assistantResult.suggestions.map((sug, i) => (
                        <span
                          key={i}
                          className="text-xs px-2 py-1 rounded-full bg-dark-600 text-neon-blue"
                        >
                          {sug}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AI Judging Settings */}
        <div className="gaming-card p-6 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">⚖️</span>
            <h3 className="font-bold text-neon-blue">
              {lang === "fa" ? "تنظیمات داوری AI" : "AI Judging Settings"}
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                label: lang === "fa" ? "حداقل اطمینان برای تصمیم‌گیری خودکار" : "Min confidence for auto-decision",
                value: "70%",
                desc: lang === "fa"
                  ? "AI فقط با اطمینان بالای 70% تصمیم خودکار میگیره"
                  : "AI only auto-decides with 70%+ confidence",
              },
              {
                label: lang === "fa" ? "حداکثر سطح مشکوک" : "Max suspicion level",
                value: "30%",
                desc: lang === "fa"
                  ? "بالای این سطح، نیاز به بررسی انسانی"
                  : "Above this level, needs human review",
              },
              {
                label: lang === "fa" ? "وزن اختلاف امتیاز" : "Score diff weight",
                value: "35%",
                desc: lang === "fa"
                  ? "تأثیر اختلاف امتیاز در تصمیم‌گیری"
                  : "Impact of score difference on decision",
              },
            ].map((setting) => (
              <div key={setting.label} className="bg-dark-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">{setting.label}</span>
                  <span className="text-neon-purple font-bold">{setting.value}</span>
                </div>
                <p className="text-xs text-gray-500">{setting.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* AI Factors Explanation */}
        <div className="gaming-card p-6 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">📊</span>
            <h3 className="font-bold text-neon-green">
              {lang === "fa" ? "فاکتورهای تحلیل AI" : "AI Analysis Factors"}
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { name: lang === "fa" ? "اختلاف امتیاز" : "Score Differential", weight: "35%", icon: "📈" },
              { name: lang === "fa" ? "تاریخچه رتبه" : "Rating History", weight: "20%", icon: "📊" },
              { name: lang === "fa" ? "ثبات عملکرد" : "Consistency", weight: "15%", icon: "🎯" },
              { name: lang === "fa" ? "کیفیت مدارک" : "Evidence Quality", weight: "15%", icon: "📸" },
              { name: lang === "fa" ? "شاخص عدالت" : "Fairness Index", weight: "15%", icon: "⚖️" },
            ].map((factor) => (
              <div key={factor.name} className="bg-dark-700 rounded-lg p-4 text-center">
                <div className="text-2xl mb-2">{factor.icon}</div>
                <div className="font-bold text-sm">{factor.name}</div>
                <div className="text-neon-purple text-lg font-bold mt-1">{factor.weight}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
