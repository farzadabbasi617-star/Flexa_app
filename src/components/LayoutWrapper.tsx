"use client";

import { ReactNode, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useLanguage } from "@/contexts/LanguageContext";

interface SiteImage {
  slug: string;
  url: string;
}

// Dynamic imports with SSR disabled for client-side only components
const AIAssistant = dynamic(() => import("./AIAssistant"), { 
  ssr: false,
  loading: () => null
});

const PWAInstall = dynamic(() => import("./PWAInstall"), { 
  ssr: false,
  loading: () => null 
});

const ThemeRuntime = dynamic(() => import("./ThemeRuntime"), {
  ssr: false,
  loading: () => null,
});

export function LayoutWrapper({ children }: { children: ReactNode }) {
  const { dir, lang } = useLanguage();
  const [bgImage, setBgImage] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lang);
  }, [dir, lang]);

  // Fetch background image from database
  useEffect(() => {
    fetch("/api/public/images", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const bg = data.find((img: SiteImage) => 
            img.slug === "app-background" || img.slug === "background"
          );
          if (bg) {
            setBgImage(bg.url);
          }
        }
      })
      .catch(() => {
        // Fallback to default background
        setBgImage(null);
      });
  }, []);

  return (
    <div dir={dir} className="relative min-h-screen overflow-x-hidden">
      {/* بک‌گراند از دیتابیس (primary) یا فایل پیش‌فرض (fallback) */}
      <div 
        className="fixed inset-0 -z-10 bg-fixed bg-center bg-cover pointer-events-none"
        style={{ 
          backgroundImage: bgImage 
            ? `url('${bgImage}')` 
            : "url('/background.jpg')",
          willChange: "transform"
        }}
      />
      
      <ThemeRuntime />
      {children}
      <AIAssistant />
      <PWAInstall />
    </div>
  );
}
