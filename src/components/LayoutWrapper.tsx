"use client";

import { ReactNode, useEffect } from "react";
import dynamic from "next/dynamic";
import { useLanguage } from "@/contexts/LanguageContext";

// Dynamic imports with SSR disabled for client-side only components
const AIAssistant = dynamic(() => import("./AIAssistant"), { 
  ssr: false,
  loading: () => null // Avoid flickering by returning null during load
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

  useEffect(() => {
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lang);
  }, [dir, lang]);

  return (
    <div dir={dir} className="relative min-h-screen overflow-x-hidden">
      {/* بک‌گراند ثابت و روان برای موبایل و دسکتاپ */}
      <img 
        src="/background.jpg" 
        alt=""
        className="fixed inset-0 w-full h-full object-cover z-[-1] pointer-events-none"
      />
      
      <ThemeRuntime />
      {children}
      <AIAssistant />
      <PWAInstall />
    </div>
  );
}
