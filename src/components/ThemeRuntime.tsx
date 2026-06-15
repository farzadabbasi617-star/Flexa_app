"use client";

import { useEffect, useState } from "react";

const COLOR_MAP: Record<string, string> = {
  primary_color: "--color-neon-purple",
  secondary_color: "--color-neon-blue",
  accent_color: "--color-neon-pink",
  bg_color: "--color-dark-900",
  card_color: "--color-gaming-card",
};

export default function ThemeRuntime() {
  const [announcement, setAnnouncement] = useState("");
  const [announcementColor, setAnnouncementColor] = useState("#a855f7");

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        const res = await fetch("/api/public/settings", { cache: "no-store" });
        const settings = await res.json();
        if (cancelled || !settings || typeof settings !== "object") return;

        for (const [key, cssVar] of Object.entries(COLOR_MAP)) {
          const value = settings[key];
          if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
            document.documentElement.style.setProperty(cssVar, value);
          }
        }

        if (settings.font_family) document.documentElement.style.setProperty("--font-family-gaming", settings.font_family);
        if (settings.card_radius) document.documentElement.style.setProperty("--flexa-card-radius", `${settings.card_radius}px`);
        if (settings.announcement_active === "true" && settings.announcement_text_fa) {
          setAnnouncement(settings.announcement_text_fa);
          setAnnouncementColor(settings.announcement_color || settings.primary_color || "#a855f7");
        } else {
          setAnnouncement("");
        }
      } catch {
        // Public settings are cosmetic; ignore errors.
      }
    }

    loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!announcement) return null;

  return (
    <div
      className="fixed top-0 inset-x-0 z-[90] text-white text-xs sm:text-sm font-black text-center py-2 px-4 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
      style={{ background: announcementColor }}
    >
      📢 {announcement}
    </div>
  );
}
