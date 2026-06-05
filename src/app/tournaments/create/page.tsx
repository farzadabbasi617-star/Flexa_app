"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";

export default function CreateTournamentPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const [loading, setLoading] = useState(false);
  const L = (fa: string, en: string) => lang === "fa" ? fa : en;

  const [form, setForm] = useState({
    name: "",
    game: "clash_royale",
    format: "single_elimination",
    description: "",
    maxPlayers: 16,
    entryFee: "رایگان",
    prizePool: "",
    prize1st: "",
    prize2nd: "",
    prize3rd: "",
    prize4to10: "",
    gameMode: "",
    mapName: "",
    serverSlots: 16,
    rules: "",
    startDate: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, startDate: form.startDate || null }),
      });
      if (res.ok) {
        const t = await res.json();
        router.push(`/tournaments/${t.id}`);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  const games = [
    { id: "clash_royale", icon: "⚔️", name: L("کلش رویال", "Clash Royale") },
    { id: "cod_mobile", icon: "🎯", name: L("کالاف موبایل", "COD Mobile") },
    { id: "fortnite", icon: "🏗️", name: L("فورتنایت", "Fortnite") },
  ];

  const formats = [
    { id: "single_elimination", icon: "🏆", name: L("حذفی", "Single Elimination") },
    { id: "double_elimination", icon: "🔄", name: L("حذفی دوگانه", "Double Elimination") },
    { id: "round_robin", icon: "🔁", name: L("دوره‌ای", "Round Robin") },
  ];

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold mb-1">🏆 <span className="neon-text-purple">{L("ساخت تورنومنت", "Create Tournament")}</span></h1>
        <p className="text-gray-400 text-sm mb-8">{L("فیلدهای ستاره‌دار الزامی هستند", "Fields marked with * are required")}</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">{L("نام تورنومنت", "Tournament Name")} *</label>
            <input type="text" required className="gaming-input" placeholder={L("مثال: جام قهرمانان", "e.g., Champions Cup")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>

          {/* Game */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">{L("بازی", "Game")} *</label>
            <div className="grid grid-cols-3 gap-3">
              {games.map((g) => (
                <button key={g.id} type="button" onClick={() => setForm({ ...form, game: g.id })}
                  className={`p-4 rounded-xl border text-center transition-all ${form.game === g.id ? "border-neon-purple bg-neon-purple/10" : "border-gaming-border bg-dark-700 hover:border-neon-purple/30"}`}>
                  <div className="text-3xl mb-2">{g.icon}</div>
                  <div className="text-xs font-bold">{g.name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Format + Mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">{L("فرمت", "Format")}</label>
              <select className="gaming-select" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>
                {formats.map((f) => (<option key={f.id} value={f.id}>{f.icon} {f.name}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">{L("مود بازی", "Game Mode")}</label>
              <input type="text" className="gaming-input" placeholder={L("مثال: Search & Destroy", "e.g., Search & Destroy")} value={form.gameMode} onChange={(e) => setForm({ ...form, gameMode: e.target.value })} />
            </div>
          </div>

          {/* Map + Server */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">{L("مپ", "Map")}</label>
              <input type="text" className="gaming-input" placeholder={L("مثال: Nuketown", "")} value={form.mapName} onChange={(e) => setForm({ ...form, mapName: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">{L("ظرفیت سرور", "Server Slots")}</label>
              <select className="gaming-select" value={form.serverSlots} onChange={(e) => setForm({ ...form, serverSlots: parseInt(e.target.value) })}>
                {[4, 8, 16, 32, 64, 100].map((n) => (<option key={n} value={n}>{n} {L("نفر", "players")}</option>))}
              </select>
            </div>
          </div>

          {/* Max Players + Start Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">{L("حداکثر بازیکنان", "Max Players")}</label>
              <select className="gaming-select" value={form.maxPlayers} onChange={(e) => setForm({ ...form, maxPlayers: parseInt(e.target.value) })}>
                {[4, 8, 16, 32, 64].map((n) => (<option key={n} value={n}>{n}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">{L("⏰ زمان شروع", "⏰ Start Time")}</label>
              <input type="datetime-local" className="gaming-input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
          </div>

          {/* Entry Fee */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">{L("💳 مبلغ ورودی", "💳 Entry Fee")}</label>
            <input type="text" className="gaming-input" placeholder={L("مثال: رایگان / ۵۰ هزار تومان", "e.g., Free / $5")} value={form.entryFee} onChange={(e) => setForm({ ...form, entryFee: e.target.value })} />
          </div>

          {/* Prizes */}
          <div className="gaming-card p-5">
            <h3 className="font-bold text-neon-yellow mb-4">🏆 {L("جوایز", "Prizes")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">🏆 {L("کل جایزه", "Prize Pool")}</label>
                <input type="text" className="gaming-input text-sm" placeholder={L("مثال: ۱ میلیون تومان", "e.g., $100")} value={form.prizePool} onChange={(e) => setForm({ ...form, prizePool: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">🥇 {L("نفر اول", "1st Place")}</label>
                <input type="text" className="gaming-input text-sm" placeholder={L("مثال: ۵۰۰ هزار", "e.g., $50")} value={form.prize1st} onChange={(e) => setForm({ ...form, prize1st: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">🥈 {L("نفر دوم", "2nd Place")}</label>
                <input type="text" className="gaming-input text-sm" value={form.prize2nd} onChange={(e) => setForm({ ...form, prize2nd: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">🥉 {L("نفر سوم", "3rd Place")}</label>
                <input type="text" className="gaming-input text-sm" value={form.prize3rd} onChange={(e) => setForm({ ...form, prize3rd: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">🏅 {L("نفرات ۴ تا ۱۰", "4th-10th Place")}</label>
                <input type="text" className="gaming-input text-sm" value={form.prize4to10} onChange={(e) => setForm({ ...form, prize4to10: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">{L("توضیحات", "Description")}</label>
            <textarea className="gaming-input min-h-[80px] resize-y" placeholder={L("توضیح تورنومنت...", "Tournament description...")} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          {/* Rules */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">{L("📜 قوانین", "📜 Rules")}</label>
            <textarea className="gaming-input min-h-[100px] resize-y" placeholder={L("قوانین و مقررات تورنومنت...", "Tournament rules...")} value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} />
          </div>

          {/* Submit */}
          <div className="flex gap-4">
            <button type="submit" disabled={loading} className="gaming-btn flex-1 py-3 disabled:opacity-50">
              {loading ? L("⏳ در حال ساخت...", "⏳ Creating...") : L("🏆 ساخت تورنومنت", "🏆 Create Tournament")}
            </button>
            <button type="button" onClick={() => router.back()} className="px-6 py-3 rounded-lg border border-gaming-border text-gray-400 hover:text-white transition-all">
              {L("انصراف", "Cancel")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
