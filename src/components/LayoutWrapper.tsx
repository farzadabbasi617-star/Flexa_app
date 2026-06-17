"use client";

import { ReactNode, useEffect } from "react";
import dynamic from "next/dynamic";
import { useLanguage } from "@/contexts/LanguageContext";

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

  useEffect(() => {
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lang);
  }, [dir, lang]);

  return (
    <div dir={dir} className="relative min-h-screen overflow-x-hidden">
      {/* بک‌گراند ثابت - با background-attachment: fixed */}
      {/* این تصویر با اسکرول تکون نمی‌خوره و فیکس میمونه */}
      <div 
        className="fixed inset-0 w-full h-full"
        style={{
          backgroundImage: "url(/background.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
          backgroundAttachment: "fixed",
          zIndex: -2,
        }}
      />
      
      {/* گرادیان ملایم روی بک‌گراند برای خوانایی متن */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          background: `
            linear-gradient(
              to bottom, 
              rgba(5, 5, 16, 0.7) 0%, 
              rgba(5, 5, 16, 0.4) 30%, 
              rgba(5, 5, 16, 0.3) 50%, 
              rgba(5, 5, 16, 0.5) 80%, 
              rgba(5, 5, 16, 0.8) 100%
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
