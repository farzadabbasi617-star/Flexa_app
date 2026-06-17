"use client";

import { useEffect, useState } from "react";

interface ThemeSettings {
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  bg_color?: string;
  card_color?: string;
  font_family?: string;
  card_radius?: string;
  announcement_active?: string;
  announcement_text_fa?: string;
  announcement_color?: string;
}

interface BackgroundImage {
  url: string;
}

export default function ThemeRuntime() {
  const [settings, setSettings] = useState<ThemeSettings>({});
  const [bgImage, setBgImage] = useState<BackgroundImage | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTheme() {
      try {
        // Load theme settings
        const [settingsRes, bgRes] = await Promise.all([
          fetch("/api/public/settings", { cache: "no-store" }),
          fetch("/api/public/background", { cache: "no-store" })
        ]);

        const settingsData = await settingsRes.json();
        const bgData = await bgRes.json();

        if (cancelled) return;

        // Apply theme colors
        if (settingsData.primary_color) {
          document.documentElement.style.setProperty("--color-neon-purple", settingsData.primary_color);
        }
        if (settingsData.secondary_color) {
          document.documentElement.style.setProperty("--color-neon-blue", settingsData.secondary_color);
        }
        if (settingsData.accent_color) {
          document.documentElement.style.setProperty("--color-neon-pink", settingsData.accent_color);
        }
        if (settingsData.bg_color) {
          document.documentElement.style.setProperty("--bg-main", settingsData.bg_color);
        }
        if (settingsData.card_color) {
          document.documentElement.style.setProperty("--card-bg", settingsData.card_color);
        }
        if (settingsData.font_family) {
          document.documentElement.style.setProperty("--font-family-gaming", settingsData.font_family);
        }
        if (settingsData.card_radius) {
          document.documentElement.style.setProperty("--flexa-card-radius", `${settingsData.card_radius}px`);
        }

        // Set background image URL
        if (bgData?.url) {
          setBgImage({ url: bgData.url });
          // When custom bg is set, make page backgrounds semi-transparent
          document.documentElement.classList.add("has-custom-bg");
        } else {
          document.documentElement.classList.remove("has-custom-bg");
        }

        setSettings(settingsData);
      } catch (error) {
        console.error("Theme load error:", error);
      }
    }

    loadTheme();
    return () => { cancelled = true; };
  }, []);

  // Apply background image to body
  useEffect(() => {
    if (bgImage?.url) {
      document.body.style.backgroundImage = `url('${bgImage.url}')`;
      document.body.style.backgroundSize = "cover";
      document.body.style.backgroundPosition = "center center";
      document.body.style.backgroundRepeat = "no-repeat";
      document.body.style.backgroundAttachment = "fixed";
    } else {
      document.body.style.backgroundImage = "url('/background.jpg')";
      document.body.style.backgroundSize = "cover";
      document.body.style.backgroundPosition = "center center";
      document.body.style.backgroundRepeat = "no-repeat";
      document.body.style.backgroundAttachment = "fixed";
    }
  }, [bgImage]);

  const announcement = settings.announcement_active === "true" ? settings.announcement_text_fa : null;
  const announcementColor = settings.announcement_color || settings.primary_color || "#a855f7";

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
