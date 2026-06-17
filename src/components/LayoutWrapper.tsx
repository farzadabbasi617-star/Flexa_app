"use client";

import { ReactNode, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useLanguage } from "@/contexts/LanguageContext";

interface BackgroundResponse {
  url: string | null;
  slug?: string;
}

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

  useEffect(() => {
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lang);
  }, [dir, lang]);

  useEffect(() => {
    const fetchBackground = async () => {
      try {
        const res = await fetch("/api/public/background", {
          cache: "no-store",
        });
        const data: BackgroundResponse = await res.json();
        
        if (data.url) {
          setBgImage(data.url);
        } else {
          setBgImage("/background.jpg");
        }
      } catch {
        setBgImage("/background.jpg");
      }
    };

    fetchBackground();
  }, []);

  return (
    <div dir={dir} className="relative min-h-screen overflow-x-hidden">
      {/* بک‌گراند - با opacity کمتر تا تصویر مشخص باشه */}
      <div 
        className="fixed inset-0"
        style={{ 
          backgroundImage: `url(${bgImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
          backgroundAttachment: "fixed",
          zIndex: -2,
        }}
      />
      
      {/* گرادیان ملایم روی بک‌گراند - فقط برای خوانایی */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          background: `
            linear-gradient(to bottom, 
              rgba(5, 5, 16, 0.6) 0%, 
              rgba(5, 5, 16, 0.3) 40%, 
              rgba(5, 5, 16, 0.4) 70%, 
              rgba(5, 5, 16, 0.7) 100%
            )
          `,
          zIndex: -1,
        }}
      />
      
      <ThemeRuntime />
      {children}
      <AIAssistant />
      <PWAInstall />
    </div>
  );
}
