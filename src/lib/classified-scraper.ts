/**
 * Classified ads scraper for Divar and Sheypoor.
 *
 * IMPORTANT: This is a monitoring helper. Divar and Sheypoor do not provide a
 * public API for searching ads, so we parse their public HTML pages. Their
 * markup changes frequently, so the selectors below should be updated as needed.
 *
 * Rules:
 * - Respect robots.txt and rate limits.
 * - Only run from admin tools.
 * - Never send unsolicited automated messages; ads are presented for manual review.
 */

import { db } from "@/db";
import { classifiedAds, classifiedScrapeLogs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import logger from "@/lib/logger";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const DEFAULT_DELAY_MS = 2_000;

export const GAMING_KEYWORDS = [
  "اکانت کالاف",
  "اکانت کلش رویال",
  "اکانت فورتنایت",
  "کالاف موبایل",
  "call of duty mobile",
  "کلش رویال",
  "clash royale",
  "فورتنایت",
  "fortnite",
  "جم کلش",
  "cp کالاف",
  "cp call of duty",
  "v-bucks",
  "سکو کلش",
  "لول کلش",
  "ایونت فورتنایت",
  "بتل پس",
  "battle pass",
  "گیمر",
  "گیمینگ",
  "psn",
  "اکانت ps4",
  "اکانت ps5",
  "xbox",
  "استیم",
  "steam",
  "ریجن ترکیه",
  "ریجن آرژانتین",
];

export interface ScrapedAd {
  externalId: string;
  title: string;
  description?: string;
  url: string;
  price?: string;
  city?: string;
  district?: string;
  category?: string;
  imageUrl?: string;
  keywords: string[];
  rawPayload: Record<string, unknown>;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function containsGamingKeyword(text: string): string[] {
  const lower = text.toLowerCase();
  return GAMING_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase()));
}

function normalizeUrl(base: string, href: string) {
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return new URL(href, base).toString();
  return new URL(href, base).toString();
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      logger.warn({ url, status: response.status }, "Classified fetch failed");
      return null;
    }
    return await response.text();
  } catch (err) {
    logger.warn({ err, url }, "Classified fetch error");
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Divar scraper
// ─────────────────────────────────────────────────────────────

export async function scrapeDivar(options: { city?: string; query?: string; limit?: number } = {}): Promise<ScrapedAd[]> {
  const city = options.city || "tehran";
  const query = encodeURIComponent(options.query || "کالاف کلش فورتنایت گیمینگ");
  const searchUrl = `https://divar.ir/s/${city}?q=${query}`;
  const html = await fetchHtml(searchUrl);
  if (!html) return [];

  const ads: ScrapedAd[] = [];

  // Divar renders cards with JSON inside <script> or data attributes.
  // Try to extract ad post tokens from links first, then fetch detail pages.
  const tokenMatches = html.matchAll(/href="\/v\/([^"\/]+)"/g);
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const match of tokenMatches) {
    const token = match[1];
    if (!token || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
    if (tokens.length >= (options.limit || 10)) break;
  }

  for (const token of tokens) {
    const url = `https://divar.ir/v/${token}`;
    const detailHtml = await fetchHtml(url);
    if (!detailHtml) continue;
    await sleep(DEFAULT_DELAY_MS);

    // Extract title and description from title/description meta tags first.
    const titleMatch = detailHtml.match(/<title>([^<]+)<\/title>/);
    const metaDescMatch = detailHtml.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i);
    const title = (titleMatch?.[1] || "").replace(" - دیوار", "").trim();
    const description = metaDescMatch?.[1] || "";
    const fullText = `${title} ${description}`;
    const keywords = containsGamingKeyword(fullText);
    if (!keywords.length) continue;

    const priceMatch = detailHtml.match(/(\d{1,3}(?:,\d{3})+|\d+)\s*تومان/);
    const imageMatch = detailHtml.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*>/i);

    ads.push({
      externalId: token,
      title: title || "آگهی دیوار",
      description: description.slice(0, 1000),
      url,
      price: priceMatch?.[0] || undefined,
      city,
      keywords,
      rawPayload: { source: "divar", token, snippet: description.slice(0, 500) },
      imageUrl: imageMatch?.[1] || undefined,
    });
  }

  return ads;
}

// ─────────────────────────────────────────────────────────────
// Sheypoor scraper
// ─────────────────────────────────────────────────────────────

export async function scrapeSheypoor(options: { query?: string; limit?: number } = {}): Promise<ScrapedAd[]> {
  const query = encodeURIComponent(options.query || "کالاف کلش فورتنایت گیمینگ");
  const searchUrl = `https://www.sheypoor.com/search?q=${query}`;
  const html = await fetchHtml(searchUrl);
  if (!html) return [];

  const ads: ScrapedAd[] = [];

  // Extract ad detail paths from search results.
  const tokenMatches = html.matchAll(/href="(\/item\/[^"]+)"/g);
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const match of tokenMatches) {
    const path = match[1].split("?")[0];
    if (!path || seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
    if (paths.length >= (options.limit || 10)) break;
  }

  for (const path of paths) {
    const url = normalizeUrl("https://www.sheypoor.com", path);
    const detailHtml = await fetchHtml(url);
    if (!detailHtml) continue;
    await sleep(DEFAULT_DELAY_MS);

    const titleMatch = detailHtml.match(/<title>([^<]+)<\/title>/);
    const metaDescMatch = detailHtml.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i);
    const title = (titleMatch?.[1] || "").replace(" - شیپور", "").trim();
    const description = metaDescMatch?.[1] || "";
    const fullText = `${title} ${description}`;
    const keywords = containsGamingKeyword(fullText);
    if (!keywords.length) continue;

    const priceMatch = detailHtml.match(/(\d{1,3}(?:,\d{3})+|\d+)\s*تومان/);
    const imageMatch = detailHtml.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*>/i);

    ads.push({
      externalId: path.replace(/\//g, "_"),
      title: title || "آگهی شیپور",
      description: description.slice(0, 1000),
      url,
      price: priceMatch?.[0] || undefined,
      keywords,
      rawPayload: { source: "sheypoor", path, snippet: description.slice(0, 500) },
      imageUrl: imageMatch?.[1] || undefined,
    });
  }

  return ads;
}

// ─────────────────────────────────────────────────────────────
// Storage
// ─────────────────────────────────────────────────────────────

export async function storeScrapedAds(ads: ScrapedAd[], platform: string) {
  let newCount = 0;
  for (const ad of ads) {
    const [existing] = await db
      .select({ id: classifiedAds.id })
      .from(classifiedAds)
      .where(and(eq(classifiedAds.platform, platform), eq(classifiedAds.externalId, ad.externalId)))
      .limit(1);
    if (existing) continue;

    await db.insert(classifiedAds).values({
      platform,
      externalId: ad.externalId,
      title: ad.title,
      description: ad.description || null,
      url: ad.url,
      price: ad.price || null,
      city: ad.city || null,
      district: ad.district || null,
      category: ad.category || null,
      imageUrl: ad.imageUrl || null,
      keywords: ad.keywords,
      rawPayload: ad.rawPayload,
      status: "new",
    });
    newCount += 1;
  }
  return newCount;
}

export async function logScrape(platform: string, status: string, itemsFound: number, itemsNew: number, errorMessage?: string) {
  await db.insert(classifiedScrapeLogs).values({ platform, status, itemsFound, itemsNew, errorMessage: errorMessage || null });
}

// ─────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────

export async function runClassifiedScrape(options: { platforms?: ("divar" | "sheypoor")[]; limit?: number } = {}) {
  const platforms = options.platforms || ["divar", "sheypoor"];
  const results: { platform: string; found: number; new: number; status: string; error?: string }[] = [];

  for (const platform of platforms) {
    try {
      let ads: ScrapedAd[] = [];
      if (platform === "divar") ads = await scrapeDivar({ limit: options.limit });
      if (platform === "sheypoor") ads = await scrapeSheypoor({ limit: options.limit });
      const newCount = await storeScrapedAds(ads, platform);
      await logScrape(platform, "success", ads.length, newCount);
      results.push({ platform, found: ads.length, new: newCount, status: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logScrape(platform, "error", 0, 0, message);
      results.push({ platform, found: 0, new: 0, status: "error", error: message });
      logger.error({ err, platform }, "Classified scrape failed");
    }
  }

  return results;
}
