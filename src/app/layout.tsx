import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { QueryProvider } from "@/components/QueryProvider";
import { LayoutWrapper } from "@/components/LayoutWrapper";

export const viewport: Viewport = {
  themeColor: "#a855f7",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "گیمنت | Gament — پلتفرم هوشمند تورنومنت گیمینگ",
  description:
    "گیمنت (Gament) پلتفرم حرفه‌ای برگزاری و مدیریت تورنومنت‌های آنلاین بازی‌های موبایلی (کالاف دیوتی موبایل، فورتنایت و کلش رویال) همراه با سیستم داوری هوشمند و هوش مصنوعی است.",
  keywords: [
    "گیمنت",
    "gament",
    "gament app",
    "تورنومنت گیمینگ",
    "مسابقات کالاف دیوتی موبایل",
    "مسابقات فورتنایت",
    "مسابقات کلش رویال",
    "داوری هوشمند بازی",
    "لیگ گیمینگ",
    "بازی آنلاین موبایل",
    "رقابت‌های گیمینگ"
  ],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Gament",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  alternates: {
    canonical: "https://gament.app",
  },
  openGraph: {
    title: "گیمنت | Gament — پلتفرم هوشمند تورنومنت گیمینگ",
    description: "گیمنت (Gament) پلتفرم حرفه‌ای برگزاری و مدیریت تورنومنت‌های آنلاین بازی‌های موبایلی با سیستم داوری هوشمند و هوش مصنوعی است.",
    url: "https://gament.app",
    siteName: "Gament",
    images: [
      {
        url: "/icons/arena_icon.png",
        width: 512,
        height: 512,
        alt: "Gament - گیمنت",
      },
    ],
    locale: "fa_IR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "گیمنت | Gament — پلتفرم هوشمند تورنومنت گیمینگ",
    description: "گیمنت (Gament) pلتفرم حرفه‌ای برگزاری و مدیریت تورنومنت‌های آنلاین بازی‌های موبایلی با سیستم داوری هوشمند و هوش مصنوعی است.",
    images: ["/icons/arena_icon.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/arena_icon.png" />
        <link rel="icon" href="/icons/arena_icon.png" />
        {/* Load Telegram WebApp Javascript library securely */}
        <script src="https://telegram.org/js/telegram-web-app.js" async></script>
      </head>
      <body className="text-white antialiased font-gaming min-h-screen">
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
