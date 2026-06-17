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
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lang);
  }, [dir, lang]);

  // Fetch background image from dedicated API
  useEffect(() => {
    const fetchBackground = async () => {
      try {
        const res = await fetch("/api/public/background", {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        });
        const data: BackgroundResponse = await res.json();
        
        if (data.url) {
          setBgImage(data.url);
        } else {
          setBgImage(null); // Use default
        }
      } catch (error) {
        console.error("Failed to fetch background:", error);
        setBgImage(null); // Use default on error
      } finally {
        setLoading(false);
      }
    };

    fetchBackground();
  }, []);

  return (
    <div dir={dir} className="relative min-h-screen overflow-x-hidden">
      {/* بک‌گراند ثابت */}
      <div 
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{ 
          backgroundImage: bgImage 
            ? `url('${bgImage}')` 
            : "url('/background.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundAttachment: "fixed",
        }}
      />
      
      {/* Overlay gradient for depth - always on top */}
      <div className="fixed inset-0 -z-[5] pointer-events-none" 
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 30%, rgba(0,0,0,0.35) 70%, rgba(0,0,0,0.65) 100%)"
        }}
      />
      
      <ThemeRuntime />
      {children}
      <AIAssistant />
      <PWAInstall />
    </div>
  );
}
