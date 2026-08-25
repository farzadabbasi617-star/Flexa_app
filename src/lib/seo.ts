import type { Metadata } from "next";

export const SITE_URL = "https://www.gament1.ir";
export const SITE_NAME = "Gament | گیمنت";
export const DEFAULT_OG_IMAGE = "/icons/gament-icon-192.png";

const RAW_SOCIAL_LINKS: string[] = [];
export const SOCIAL_LINKS: string[] = RAW_SOCIAL_LINKS.filter(
  (url) => url && !url.includes("your_")
);
export const CONTACT_EMAIL = "support@gament1.ir";

export function absoluteUrl(path = "/") {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Keywords are not a Google ranking lever, but Next still supports the metadata
 * field and some secondary engines consume it. Keep it compact and relevant;
 * injecting the old 50-keyword list into every URL made unrelated pages look
 * identical and keyword-stuffed.
 */
export const GLOBAL_KEYWORDS = [
  "گیمنت",
  "Gament",
  "تورنومنت گیمینگ",
  "مسابقات بازی آنلاین",
  "فروشگاه امن بازی",
];

export function cleanSeoText(value: unknown, maxLength = 180) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function uniqueKeywords(values: Array<string | null | undefined>, max = 14) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = cleanSeoText(value, 70);
    if (!cleaned) continue;
    const key = cleaned.toLocaleLowerCase("fa-IR");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= max) break;
  }
  return result;
}

/** Escape characters that can terminate a JSON-LD script element. */
export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function createPageMetadata({
  title,
  description,
  path,
  keywords = [],
  image = DEFAULT_OG_IMAGE,
  noIndex = false,
}: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  image?: string;
  noIndex?: boolean;
}): Metadata {
  const url = absoluteUrl(path);
  const safeTitle = cleanSeoText(title, 90);
  const safeDescription = cleanSeoText(description, 190);
  const safeImage = image.startsWith("http://") || image.startsWith("https://") || image.startsWith("/")
    ? image
    : DEFAULT_OG_IMAGE;

  return {
    title: safeTitle,
    description: safeDescription,
    keywords: uniqueKeywords([...keywords, ...GLOBAL_KEYWORDS]),
    alternates: { canonical: url },
    robots: noIndex
      ? { index: false, follow: false, nocache: true }
      : {
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
      title: safeTitle,
      description: safeDescription,
      url,
      siteName: SITE_NAME,
      images: [{ url: absoluteUrl(safeImage), width: 512, height: 512, alt: safeTitle }],
      locale: "fa_IR",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: safeTitle,
      description: safeDescription,
      images: [absoluteUrl(safeImage)],
    },
  };
}

export const gameNamesFa: Record<string, string> = {
  clash_royale: "کلش رویال",
  cod_mobile: "کالاف دیوتی موبایل",
  fortnite: "فورتنایت",
};
