"use client";

import { ReactNode, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useLanguage } from "@/contexts/LanguageContext";

interface BackgroundResponse {
  url: string | null;
  slug?: string;
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
  const [bgImage, setBgImage] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lang);
  }, [dir, lang]);

  // Fetch background image from dedicated API
  useEffect(() => {
    const fetchBackground = async () => {
      try {
        console.log("🔍 Fetching background from API...");
        const res = await fetch("/api/public/background", {
          cache: "no-store",
        });
        const data: BackgroundResponse = await res.json();
        
        console.log("📦 Background API response:", data);
        
        if (data.url) {
          console.log("✅ Custom background URL:", data.url);
          setBgImage(data.url);
        } else {
          console.log("ℹ️ No custom background, using default");
          setBgImage("");
        }
      } catch (error) {
        console.error("❌ Failed to fetch background:", error);
        setBgImage("");
      } finally {
        setLoading(false);
      }
    };

    fetchBackground();
  }, []);

  // Determine background URL
  const backgroundUrl = bgImage || "/background.jpg";

  return (
    <div dir={dir} className="relative min-h-screen overflow-x-hidden">
      {/* بک‌گراند اصلی - با opacity برای نمایش */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{ 
          backgroundImage: `url('${backgroundUrl}')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundAttachment: "fixed",
          opacity: 0.85, // اضافه کردن opacity برای نمایش بهتر
          zIndex: -1,
        }}
      />
      
      {/* لایه تیره روی بک‌گراند - فقط برای خوانایی متن */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.2) 70%, rgba(0,0,0,0.5) 100%)",
          zIndex: -0.5,
        }}
      />
      
      <ThemeRuntime />
      {children}
      <AIAssistant />
      <PWAInstall />
    </div>
  );
}
