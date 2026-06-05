"use client";

import { ReactNode, useEffect, lazy, Suspense } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

const AIAssistant = lazy(() => import("./AIAssistant"));
const PWAInstall = lazy(() => import("./PWAInstall"));

export function LayoutWrapper({ children }: { children: ReactNode }) {
  const { dir, lang } = useLanguage();

  useEffect(() => {
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lang);
  }, [dir, lang]);

  return (
    <div dir={dir}>
      {children}
      <Suspense fallback={null}>
        <AIAssistant />
      </Suspense>
      <Suspense fallback={null}>
        <PWAInstall />
      </Suspense>
    </div>
  );
}
