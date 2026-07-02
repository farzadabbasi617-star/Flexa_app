"use client";

import { ReactNode, useEffect } from "react";
import dynamic from "next/dynamic";
import { useLanguage } from "@/contexts/LanguageContext";

const PWAInstall = dynamic(() => import("./PWAInstall"), { 
  ssr: false,
  loading: () => null 
});

const ThemeRuntime = dynamic(() => import("./ThemeRuntime"), {
  ssr: false,
  loading: () => null,
});

const AIAssistant = dynamic(() => import("./AIAssistant"), {
  ssr: false,
  loading: () => null,
});

const SplashScreen = dynamic(() => import("./SplashScreen"), {
  ssr: false,
  loading: () => null,
});

const PageTransition = dynamic(() => import("./fx/PageTransition"), {
  ssr: false,
  loading: () => null,
});

const GlobalCardFX = dynamic(() => import("./fx/GlobalCardFX"), {
  ssr: false,
  loading: () => null,
});

const AmbientBackdrop = dynamic(() => import("./fx/AmbientBackdrop"), {
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
    <>
      <SplashScreen />
      <ThemeRuntime />
      <AmbientBackdrop />
      <GlobalCardFX />
      <PageTransition>{children}</PageTransition>
      <AIAssistant />
      <PWAInstall />
    </>
  );
}
