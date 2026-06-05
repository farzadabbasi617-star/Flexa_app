"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminCustomizePage() {
  const { lang } = useLanguage();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState("theme");

  const [settings, setSettings] = useState({
    // Theme
    primary_color: "#a855f7",
    secondary_color: "#00d4ff",
    accent_color: "#ff006e",
    bg_color: "#0a0a0f",
    card_color: "#16162a",
    // Logo
    logo_text: "Flexa",
    logo_icon: "⚡",
    logo_font_size: "24",
    // Hero
    hero_title_fa: "فلکسا",
    hero_title_en: "Flexa",
    hero_subtitle_fa: "گیمینگ",
    hero_subtitle_en: "Gaming",
    hero_image_url: "",
    hero_overlay_opacity: "20",
    // Nav Icons
    nav_home_icon: "🏠",
    nav_tournament_icon: "🏆",
    nav_leaderboard_icon: "📊",
    nav_judging_icon: "⚖️",
    nav_teams_icon: "🛡️",
    nav_achievements_icon: "🏅",
    // Game Icons
    game_clash_icon: "⚔️",
    game_cod_icon: "🎯",
    game_fortnite_icon: "🏗️",
    // Font
    font_family: "system-ui",
    font_size_base: "16",
    // Layout
    max_width: "1280",
    card_radius: "12",
    card_border: "true",
    // Winners
    winners_display: "true",
    winners_title_fa: "قهرمانان اخیر",
    winners_title_en: "Recent Champions",
    // Footer
    footer_text_fa: "پلتفرم تورنومنت با داوری هوش مصنوعی",
    footer_text_en: "Tournament platform with AI-assisted judging",
    footer_show_social: "true",
    // Announcement
    announcement_active: "false",
    announcement_text_fa: "",
    announcement_text_en: "",
    announcement_color: "#ff006e",
  });

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) router.push("/");
  }, [loading, user, router]);

  useEffect(() => {
    if (user?.role === "admin") fetchSettings();
  }, [user]);

  async function fetchSettings() {
    try {
      const res = await fetch("/api/admin/settings");
      const data = await res.json();
      if (data && typeof data === "object") {
        setSettings((prev) => ({ ...prev, ...data }));
      }
    } catch { /* ignore */ }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* ignore */ }
    setSaving(false);
  }

  if (loading || !user || user.role !== "admin") return null;

  const L = (fa: string, en: string) => lang === "fa" ? fa : en;

  const tabs = [
    { key: "theme", icon: "🎨", label: L("رنگ‌ها و تم", "Colors & Theme") },
    { key: "logo", icon: "⚡", label: L("لوگو و برند", "Logo & Brand") },
    { key: "hero", icon: "🖼️", label: L("هیرو و بنر", "Hero & Banner") },
    { key: "icons", icon: "😀", label: L("آیکون‌ها", "Icons") },
    { key: "font", icon: "🔤", label: L("فونت و متن", "Font & Text") },
    { key: "layout", icon: "📐", label: L("چینش و لایه‌بندی", "Layout") },
    { key: "winners", icon: "🏆", label: L("برندگان", "Winners") },
    { key: "footer", icon: "📎", label: L("فوتر", "Footer") },
    { key: "announce", icon: "📢", label: L("اطلاعیه", "Announcement") },
  ];

  function ColorInput({ label, settingKey }: { label: string; settingKey: string }) {
    return (
      <div>
        <label className="block text-xs text-gray-500 mb-1">{label}</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            className="w-10 h-10 rounded-lg border border-gaming-border cursor-pointer bg-transparent"
            value={settings[settingKey as keyof typeof settings] || "#ffffff"}
            onChange={(e) => setSettings({ ...settings, [settingKey]: e.target.value })}
          />
          <input
            type="text"
            className="gaming-input text-sm flex-1 font-mono"
            value={settings[settingKey as keyof typeof settings] || ""}
            onChange={(e) => setSettings({ ...settings, [settingKey]: e.target.value })}
          />
        </div>
      </div>
    );
  }

  function TextInput({ label, settingKey, placeholder, dir }: { label: string; settingKey: string; placeholder?: string; dir?: string }) {
    return (
      <div>
        <label className="block text-xs text-gray-500 mb-1">{label}</label>
        <input
          type="text"
          dir={dir}
          className="gaming-input text-sm"
          placeholder={placeholder}
          value={settings[settingKey as keyof typeof settings] || ""}
          onChange={(e) => setSettings({ ...settings, [settingKey]: e.target.value })}
        />
      </div>
    );
  }

  function NumberInput({ label, settingKey, min, max, suffix }: { label: string; settingKey: string; min?: number; max?: number; suffix?: string }) {
    return (
      <div>
        <label className="block text-xs text-gray-500 mb-1">{label} {suffix && <span className="text-gray-600">({suffix})</span>}</label>
        <input
          type="number"
          min={min}
          max={max}
          className="gaming-input text-sm"
          value={settings[settingKey as keyof typeof settings] || ""}
          onChange={(e) => setSettings({ ...settings, [settingKey]: e.target.value })}
        />
      </div>
    );
  }

  function ToggleInput({ label, settingKey }: { label: string; settingKey: string }) {
    const isOn = settings[settingKey as keyof typeof settings] === "true";
    return (
      <div className="flex items-center justify-between">
        <label className="text-sm text-gray-300">{label}</label>
        <button
          type="button"
          onClick={() => setSettings({ ...settings, [settingKey]: isOn ? "false" : "true" })}
          className={`w-12 h-6 rounded-full relative transition-colors ${isOn ? "bg-neon-green/30" : "bg-dark-600"}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${isOn ? "end-0.5 bg-neon-green" : "start-0.5 bg-gray-500"}`} />
        </button>
      </div>
    );
  }

  function EmojiInput({ label, settingKey }: { label: string; settingKey: string }) {
    return (
      <div>
        <label className="block text-xs text-gray-500 mb-1">{label}</label>
        <input
          type="text"
          className="gaming-input text-sm text-center text-2xl"
          maxLength={2}
          value={settings[settingKey as keyof typeof settings] || ""}
          onChange={(e) => setSettings({ ...settings, [settingKey]: e.target.value })}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/admin")} className="text-gray-500 hover:text-white text-xl">←</button>
            <div>
              <h1 className="text-2xl font-bold">
                🎨 <span className="neon-text-purple">{L("شخصی‌سازی ظاهر", "Customize UI")}</span>
              </h1>
              <p className="text-gray-500 text-sm">{L("تغییر ظاهر کامل سایت بدون کدنویسی", "Change the entire site look without coding")}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saved && <span className="text-neon-green text-sm animate-slide-up">✓ {L("ذخیره شد!", "Saved!")}</span>}
            <button onClick={handleSave} disabled={saving} className="gaming-btn text-sm disabled:opacity-50">
              {saving ? L("⏳ ذخیره...", "⏳ Saving...") : L("💾 ذخیره تغییرات", "💾 Save Changes")}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Tabs */}
          <div className="lg:col-span-1">
            <div className="gaming-card p-3 space-y-1 sticky top-20">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`w-full text-start px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                    activeTab === tab.key
                      ? "bg-neon-purple/20 text-neon-purple"
                      : "text-gray-400 hover:text-white hover:bg-dark-600"
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="lg:col-span-3">
            {/* Theme */}
            {activeTab === "theme" && (
              <div className="gaming-card p-6 animate-slide-up">
                <h2 className="text-lg font-bold mb-6 neon-text-blue">🎨 {L("رنگ‌ها و تم", "Colors & Theme")}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <ColorInput label={L("رنگ اصلی (بنفش)", "Primary Color")} settingKey="primary_color" />
                  <ColorInput label={L("رنگ دوم (آبی)", "Secondary Color")} settingKey="secondary_color" />
                  <ColorInput label={L("رنگ تأکید (صورتی)", "Accent Color")} settingKey="accent_color" />
                  <ColorInput label={L("رنگ پس‌زمینه", "Background Color")} settingKey="bg_color" />
                  <ColorInput label={L("رنگ کارت‌ها", "Card Color")} settingKey="card_color" />
                </div>
                <div className="mt-6 p-4 bg-dark-700 rounded-lg">
                  <p className="text-xs text-gray-500">💡 {L("پیش‌نمایش رنگ‌ها:", "Color Preview:")}</p>
                  <div className="flex gap-3 mt-3">
                    {["primary_color", "secondary_color", "accent_color", "bg_color", "card_color"].map((k) => (
                      <div key={k} className="w-12 h-12 rounded-lg border border-gaming-border" style={{ backgroundColor: settings[k as keyof typeof settings] }} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Logo */}
            {activeTab === "logo" && (
              <div className="gaming-card p-6 animate-slide-up">
                <h2 className="text-lg font-bold mb-6 neon-text-blue">⚡ {L("لوگو و برند", "Logo & Brand")}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <EmojiInput label={L("آیکون لوگو", "Logo Icon")} settingKey="logo_icon" />
                  <TextInput label={L("متن لوگو", "Logo Text")} settingKey="logo_text" />
                  <NumberInput label={L("اندازه فونت لوگو", "Logo Font Size")} settingKey="logo_font_size" min={16} max={48} suffix="px" />
                </div>
                <div className="mt-6 p-4 bg-dark-700 rounded-lg flex items-center gap-3">
                  <span style={{ fontSize: `${settings.logo_font_size}px` }}>{settings.logo_icon}</span>
                  <span className="font-bold bg-gradient-to-r from-neon-blue to-neon-purple bg-clip-text text-transparent" style={{ fontSize: `${settings.logo_font_size}px` }}>
                    {settings.logo_text}
                  </span>
                </div>
              </div>
            )}

            {/* Hero */}
            {activeTab === "hero" && (
              <div className="gaming-card p-6 animate-slide-up">
                <h2 className="text-lg font-bold mb-6 neon-text-blue">🖼️ {L("هیرو و بنر اصلی", "Hero & Banner")}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <TextInput label={L("عنوان فارسی خط ۱", "Title FA Line 1")} settingKey="hero_title_fa" dir="rtl" />
                  <TextInput label={L("عنوان انگلیسی خط ۱", "Title EN Line 1")} settingKey="hero_title_en" dir="ltr" />
                  <TextInput label={L("عنوان فارسی خط ۲", "Title FA Line 2")} settingKey="hero_subtitle_fa" dir="rtl" />
                  <TextInput label={L("عنوان انگلیسی خط ۲", "Title EN Line 2")} settingKey="hero_subtitle_en" dir="ltr" />
                  <div className="sm:col-span-2">
                    <TextInput label={L("لینک تصویر بکگراند هیرو", "Hero Background Image URL")} settingKey="hero_image_url" placeholder="https://i.ibb.co/..." />
                  </div>
                  <NumberInput label={L("شفافیت تصویر", "Image Overlay Opacity")} settingKey="hero_overlay_opacity" min={0} max={100} suffix="%" />
                </div>
              </div>
            )}

            {/* Icons */}
            {activeTab === "icons" && (
              <div className="gaming-card p-6 animate-slide-up">
                <h2 className="text-lg font-bold mb-6 neon-text-blue">😀 {L("آیکون‌ها", "Icons")}</h2>
                <h3 className="text-sm font-bold text-gray-400 mb-3">{L("آیکون‌های منو", "Navigation Icons")}</h3>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 mb-8">
                  <EmojiInput label={L("خانه", "Home")} settingKey="nav_home_icon" />
                  <EmojiInput label={L("تورنومنت", "Tournament")} settingKey="nav_tournament_icon" />
                  <EmojiInput label={L("رتبه‌بندی", "Leaderboard")} settingKey="nav_leaderboard_icon" />
                  <EmojiInput label={L("داوری", "Judging")} settingKey="nav_judging_icon" />
                  <EmojiInput label={L("تیم‌ها", "Teams")} settingKey="nav_teams_icon" />
                  <EmojiInput label={L("دستاوردها", "Achievements")} settingKey="nav_achievements_icon" />
                </div>
                <h3 className="text-sm font-bold text-gray-400 mb-3">{L("آیکون‌های بازی‌ها", "Game Icons")}</h3>
                <div className="grid grid-cols-3 gap-4">
                  <EmojiInput label={L("کلش رویال", "Clash Royale")} settingKey="game_clash_icon" />
                  <EmojiInput label={L("کالاف موبایل", "COD Mobile")} settingKey="game_cod_icon" />
                  <EmojiInput label={L("فورتنایت", "Fortnite")} settingKey="game_fortnite_icon" />
                </div>
              </div>
            )}

            {/* Font */}
            {activeTab === "font" && (
              <div className="gaming-card p-6 animate-slide-up">
                <h2 className="text-lg font-bold mb-6 neon-text-blue">🔤 {L("فونت و متن", "Font & Text")}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{L("فونت اصلی", "Main Font")}</label>
                    <select className="gaming-select text-sm" value={settings.font_family} onChange={(e) => setSettings({ ...settings, font_family: e.target.value })}>
                      <option value="system-ui">System UI</option>
                      <option value="'Segoe UI', sans-serif">Segoe UI</option>
                      <option value="Arial, sans-serif">Arial</option>
                      <option value="Tahoma, sans-serif">Tahoma</option>
                      <option value="Vazirmatn, sans-serif">Vazirmatn (فارسی)</option>
                    </select>
                  </div>
                  <NumberInput label={L("اندازه فونت پایه", "Base Font Size")} settingKey="font_size_base" min={12} max={20} suffix="px" />
                </div>
              </div>
            )}

            {/* Layout */}
            {activeTab === "layout" && (
              <div className="gaming-card p-6 animate-slide-up">
                <h2 className="text-lg font-bold mb-6 neon-text-blue">📐 {L("چینش و لایه‌بندی", "Layout")}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <NumberInput label={L("حداکثر عرض سایت", "Max Width")} settingKey="max_width" min={960} max={1920} suffix="px" />
                  <NumberInput label={L("گردی گوشه کارت‌ها", "Card Border Radius")} settingKey="card_radius" min={0} max={30} suffix="px" />
                  <ToggleInput label={L("نمایش حاشیه کارت‌ها", "Show Card Border")} settingKey="card_border" />
                </div>
              </div>
            )}

            {/* Winners */}
            {activeTab === "winners" && (
              <div className="gaming-card p-6 animate-slide-up">
                <h2 className="text-lg font-bold mb-6 neon-text-blue">🏆 {L("لیست برندگان", "Winners List")}</h2>
                <div className="space-y-6">
                  <ToggleInput label={L("نمایش بخش برندگان در صفحه اصلی", "Show Winners on Homepage")} settingKey="winners_display" />
                  <TextInput label={L("عنوان فارسی", "Title FA")} settingKey="winners_title_fa" dir="rtl" />
                  <TextInput label={L("عنوان انگلیسی", "Title EN")} settingKey="winners_title_en" dir="ltr" />
                </div>
              </div>
            )}

            {/* Footer */}
            {activeTab === "footer" && (
              <div className="gaming-card p-6 animate-slide-up">
                <h2 className="text-lg font-bold mb-6 neon-text-blue">📎 {L("فوتر", "Footer")}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <TextInput label={L("متن فوتر (فارسی)", "Footer Text (FA)")} settingKey="footer_text_fa" dir="rtl" />
                  <TextInput label={L("متن فوتر (انگلیسی)", "Footer Text (EN)")} settingKey="footer_text_en" dir="ltr" />
                  <ToggleInput label={L("نمایش لینک شبکه‌های اجتماعی", "Show Social Links")} settingKey="footer_show_social" />
                </div>
              </div>
            )}

            {/* Announcement */}
            {activeTab === "announce" && (
              <div className="gaming-card p-6 animate-slide-up">
                <h2 className="text-lg font-bold mb-6 neon-text-blue">📢 {L("نوار اطلاعیه", "Announcement Bar")}</h2>
                <div className="space-y-6">
                  <ToggleInput label={L("فعال کردن نوار اطلاعیه", "Enable Announcement Bar")} settingKey="announcement_active" />
                  <TextInput label={L("متن اطلاعیه (فارسی)", "Announcement (FA)")} settingKey="announcement_text_fa" dir="rtl" placeholder={L("مثال: تورنومنت جدید شروع شد!", "")} />
                  <TextInput label={L("متن اطلاعیه (انگلیسی)", "Announcement (EN)")} settingKey="announcement_text_en" dir="ltr" placeholder="e.g., New tournament starting!" />
                  <ColorInput label={L("رنگ نوار اطلاعیه", "Announcement Bar Color")} settingKey="announcement_color" />
                </div>
                {settings.announcement_active === "true" && settings.announcement_text_fa && (
                  <div className="mt-4 rounded-lg p-3 text-center text-sm text-white font-medium" style={{ backgroundColor: settings.announcement_color }}>
                    📢 {lang === "fa" ? settings.announcement_text_fa : settings.announcement_text_en}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
