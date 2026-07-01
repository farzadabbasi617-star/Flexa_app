import type { Metadata } from "next";

export const SITE_URL = "https://www.gament1.ir";
export const SITE_NAME = "Gament | گیمنت";
export const DEFAULT_OG_IMAGE = "/icons/gament-icon-192.png";

// Official brand profiles. Fill these in with your REAL, active handles — each
// should link back to the site. They power the Organization `sameAs` entity web
// (the single biggest brand-disambiguation signal for Google). Leave a value
// empty ("") to omit it; empty/placeholder entries are filtered out.
const RAW_SOCIAL_LINKS: string[] = [
  // "https://www.instagram.com/your_handle",
  // "https://t.me/your_channel",
  // "https://www.aparat.com/your_channel",
  // "https://www.youtube.com/@your_channel",
  // "https://x.com/your_handle",
  // "https://www.linkedin.com/company/your_company",
];
export const SOCIAL_LINKS: string[] = RAW_SOCIAL_LINKS.filter(
  (u) => u && !u.includes("your_")
);

// Contact email on the brand's own domain (stronger trust signal than gmail).
export const CONTACT_EMAIL = "support@gament1.ir";

export function absoluteUrl(path = "/") {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
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

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: url,
    },
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
      title,
      description,
      url,
      siteName: SITE_NAME,
      images: [{ url: absoluteUrl(image), width: 512, height: 512, alt: title }],
      locale: "fa_IR",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [absoluteUrl(image)],
    },
  };
}

export const gameNamesFa: Record<string, string> = {
  clash_royale: "کلش رویال",
  cod_mobile: "کالاف دیوتی موبایل",
  fortnite: "فورتنایت",
};
