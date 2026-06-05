import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { QueryProvider } from "@/components/QueryProvider";

export const viewport: Viewport = {
  themeColor: "#a855f7",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Flexa — پلتفرم تورنومنت گیمینگ",
  description:
    "پلتفرم حرفه‌ای تورنومنت بازی برای کلش رویال، کالاف موبایل و فورتنایت با داوری هوش مصنوعی",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Flexa",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
      </head>
      <body className="bg-dark-900 text-white antialiased font-gaming min-h-screen">
        <QueryProvider>
          <AuthProvider>
            <LanguageProvider>
              <LayoutWrapper>{children}</LayoutWrapper>
            </LanguageProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
