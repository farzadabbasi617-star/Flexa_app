import { eq } from "drizzle-orm";
import { db } from "@/db";
import { honors, telegramSentNotifications } from "@/db/schema";
import { fetchAIResponse } from "@/lib/ai-provider-manager";
import { gamentSystemPrompt } from "@/lib/ai-prompts";
import { safeParseAIJson } from "@/lib/ai-utils";
import logger from "@/lib/logger";

type NewsItem = {
  title: string;
  link: string;
  source: string;
  pubDate: string | null;
  game: "clash_royale" | "cod_mobile" | "fortnite";
};

type GeneratedNews = {
  title: string;
  description: string;
  game: "clash_royale" | "cod_mobile" | "fortnite" | string;
  icon?: string;
  seoKeywords?: string[];
};

const NEWS_QUERIES: Array<{ game: NewsItem["game"]; query: string }> = [
  { game: "clash_royale", query: "Clash Royale update balance changes esports" },
  { game: "cod_mobile", query: "Call of Duty Mobile season update esports" },
  { game: "fortnite", query: "Fortnite update patch notes esports" },
];

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractTag(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function normalizeGoogleNewsUrl(value: string) {
  try {
    const url = new URL(value);
    const direct = url.searchParams.get("url");
    return direct || value;
  } catch {
    return value;
  }
}

async function fetchGoogleNewsItems(query: string, game: NewsItem["game"]): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "GamentBot/1.0 (+https://www.gament1.ir)",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
    return itemBlocks.slice(0, 5).map((block) => {
      const title = extractTag(block, "title");
      const link = normalizeGoogleNewsUrl(extractTag(block, "link"));
      const pubDate = extractTag(block, "pubDate") || null;
      const source = extractTag(block, "source") || "Google News";
      return { title, link, source, pubDate, game };
    }).filter((item) => item.title && item.link);
  } catch (err) {
    logger.warn({ err, query, game }, "Failed to fetch Google News RSS");
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function collectGamingNewsItems() {
  const results = await Promise.all(NEWS_QUERIES.map((entry) => fetchGoogleNewsItems(entry.query, entry.game)));
  const seen = new Set<string>();
  return results.flat().filter((item) => {
    const key = `${item.title.toLowerCase()}|${item.link}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

async function hasGenerated(dedupeKey: string) {
  const [row] = await db
    .select({ id: telegramSentNotifications.id })
    .from(telegramSentNotifications)
    .where(eq(telegramSentNotifications.dedupeKey, dedupeKey))
    .limit(1);
  return Boolean(row);
}

async function markGenerated(dedupeKey: string) {
  await db
    .insert(telegramSentNotifications)
    .values({ dedupeKey, type: "daily_gaming_news" })
    .onConflictDoNothing({ target: telegramSentNotifications.dedupeKey });
}

function localFallbackNews(items: NewsItem[]): GeneratedNews {
  const first = items[0] || {
    title: "به‌روزرسانی‌های جدید دنیای گیمینگ",
    link: "https://www.gament1.ir/honors",
    source: "Gament",
    pubDate: null,
    game: "cod_mobile" as const,
  };

  const gameLabel: Record<string, string> = {
    clash_royale: "کلش رویال",
    cod_mobile: "کالاف دیوتی موبایل",
    fortnite: "فورتنایت",
  };

  return {
    title: `تازه‌ترین خبر ${gameLabel[first.game] || "گیمینگ"} برای گیمرهای گیمنت`,
    description: `در تازه‌ترین موج اخبار گیمینگ، گزارش‌هایی درباره ${gameLabel[first.game] || "بازی‌های رقابتی"} منتشر شده که می‌تواند برای بازیکنان رقابتی گیمنت مهم باشد. منبع اصلی این خبر با عنوان «${first.title}» توسط ${first.source} منتشر شده و نشان می‌دهد دنبال‌کردن تغییرات بازی‌ها برای شرکت در تورنومنت گیمینگ اهمیت زیادی دارد.\n\nگیمنت تلاش می‌کند اخبار مهم کالاف دیوتی موبایل، کلش رویال و فورتنایت را با نگاه رقابتی و کاربردی پوشش دهد تا بازیکنان قبل از ورود به مسابقات، از تغییرات متا، آپدیت‌ها و فضای رقابت آگاه باشند.`,
    game: first.game,
    icon: "📰",
    seoKeywords: ["گیمنت", "تورنومنت گیمینگ", gameLabel[first.game] || "گیمینگ"],
  };
}

export async function generateDailyGamingNews({ force = false } = {}) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
  const key = `daily-gaming-news:${today}`;
  if (!force && await hasGenerated(key)) return { generated: false, reason: "already_today" };

  const items = await collectGamingNewsItems();
  const sourcesText = items.length
    ? items.map((item, index) => `${index + 1}. [${item.game}] ${item.title} — ${item.source} — ${item.pubDate || "no date"} — ${item.link}`).join("\n")
    : "No external RSS items were available. Create a safe evergreen gaming news analysis without pretending a specific breaking event happened.";

  const prompt = `تو خبرنگار فارسی گیمنت هستی. بر اساس منابع زیر، یک خبر فارسی حرفه‌ای و سئوشده برای تالار افتخارات Gament بساز.

منابع واقعی RSS/Google News:
${sourcesText}

قوانین مهم:
- اگر منبع واقعی وجود دارد، خبر باید به همان منابع تکیه کند و چیزی را قطعی‌تر از منبع ننویسد.
- اگر منابع کافی نبودند، خبر را به شکل تحلیل کلی/evergreen بنویس و خبر فوری جعلی نساز.
- متن باید برای گیمرهای ایرانی و مخاطبان تورنومنت گیمینگ مفید باشد.
- کلمات کلیدی را طبیعی استفاده کن: گیمنت، gament، تورنومنت گیمینگ، کالاف دیوتی موبایل، کلش رویال، فورتنایت.
- خروجی فقط JSON معتبر باشد.

Schema:
{
  "title": "عنوان کوتاه فارسی و مناسب SEO",
  "description": "۲ تا ۴ پاراگراف فارسی کامل، خبری و حرفه‌ای",
  "game": "clash_royale" | "cod_mobile" | "fortnite",
  "icon": "📰" | "🔥" | "👑" | "⚡",
  "seoKeywords": ["..."]
}`;

  const systemPrompt = gamentSystemPrompt("honors", "Respond ONLY with valid JSON. No markdown. Never invent fake breaking news.");
  const ai = await fetchAIResponse(prompt, systemPrompt);
  const parsed = ai ? safeParseAIJson<GeneratedNews>(ai.content) : null;
  const news = parsed?.title && parsed?.description ? parsed : localFallbackNews(items);

  const [created] = await db.insert(honors).values({
    type: "news",
    title: String(news.title).slice(0, 255),
    description: String(news.description),
    icon: String(news.icon || "📰").slice(0, 20),
    game: String(news.game || items[0]?.game || "cod_mobile").slice(0, 50),
    status: "approved",
    highlight: false,
    publishedAt: new Date(),
    source: "ai_news",
    metadata: {
      provider: ai?.provider || "local_fallback",
      model: ai?.model || null,
      sources: items,
      seoKeywords: news.seoKeywords || [],
      dedupeKey: key,
    },
  }).returning();

  await markGenerated(key);
  logger.info({ honorId: created.id, title: created.title, sources: items.length }, "Generated daily gaming news");

  return {
    generated: true,
    honorId: created.id,
    title: created.title,
    game: created.game,
    sources: items.length,
    provider: ai?.provider || "local_fallback",
  };
}
