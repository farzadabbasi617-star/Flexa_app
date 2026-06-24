import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { QueryProvider } from "@/components/QueryProvider";
import { LayoutWrapper } from "@/components/LayoutWrapper";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo";

export const viewport: Viewport = {
  themeColor: "#a855f7",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const title = "گیمنت | Gament — پلتفرم هوشمند تورنومنت گیمینگ";
const description =
  "گیمنت (Gament) پلتفرم حرفه‌ای برگزاری و مدیریت تورنومنت‌های آنلاین کالاف دیوتی موبایل، فورتنایت و کلش رویال با داوری هوشمند، جدول رتبه‌بندی و جوایز واقعی است.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: title,
    template: "%s | گیمنت",
  },
  description,
  keywords: [
    "گیمنت",
    "gament",
    "gament1",
    "تورنومنت گیمینگ",
    "مسابقات بازی آنلاین",
    "مسابقات کالاف دیوتی موبایل",
    "تورنومنت کالاف موبایل",
    "مسابقات فورتنایت",
    "تورنومنت فورتنایت",
    "مسابقات کلش رویال",
    "تورنومنت کلش رویال",
    "داوری هوشمند بازی",
    "لیگ گیمینگ ایران",
    "رقابت‌های گیمینگ",
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
    canonical: SITE_URL,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title,
    description,
    url: SITE_URL,
    siteName: SITE_NAME,
    images: [
      {
        url: absoluteUrl("/icons/arena_icon.png"),
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
    title,
    description,
    images: [absoluteUrl("/icons/arena_icon.png")],
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  alternateName: ["Gament", "گیمنت"],
  url: SITE_URL,
  logo: absoluteUrl("/icons/arena_icon.png"),
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  alternateName: ["Gament", "گیمنت"],
  url: SITE_URL,
  inLanguage: "fa-IR",
};

const webApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  applicationCategory: "GameApplication",
  operatingSystem: "Web, Android, iOS",
  inLanguage: "fa-IR",
  description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/arena_icon.png" />
        <link rel="icon" href="/icons/arena_icon.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webApplicationJsonLd) }}
        />
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
