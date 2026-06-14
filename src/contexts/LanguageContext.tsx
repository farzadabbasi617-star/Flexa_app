"use client";

import { createContext, useContext, ReactNode } from "react";
import { translations, Language, Translations } from "@/lib/i18n";

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: Translations;
  dir: "ltr" | "rtl";
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Flexa is Persian-only for now. Keeping setLang as a no-op preserves
  // compatibility with existing components while removing the language switcher.
  const lang: Language = "fa";
  const t = translations.fa;
  const dir = "rtl" as const;
  const setLang = () => undefined;

  return <LanguageContext.Provider value={{ lang, setLang, t, dir }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
