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
  summary: string;
  description: string;
  game: "clash_royale" | "cod_mobile" | "fortnite" | string;
  icon?: string;
  seoKeywords?: string[];
  imageAlt?: string;
};

const NEWS_QUERIES: Array<{ game: NewsItem["game"]; query: string }> = [
  { game: "clash_royale", query: "Clash Royale update balance changes esports" },
  { game: "cod_mobile", query: "Call of Duty Mobile season update esports" },
  { game: "fortnite", query: "Fortnite update patch notes esports" },
];

const GAME_BRAND: Record<string, { label: string; icon: string; from: string; to: string; accent: string }> = {
  clash_royale: { label: "کلش رویال", icon: "👑", from: "#083344", to: "#1d4ed8", accent: "#22d3ee" },
  cod_mobile: { label: "کالاف دیوتی موبایل", icon: "🎯", from: "#431407", to: "#991b1b", accent: "#fb923c" },
  fortnite: { label: "فورتنایت", icon: "🏗️", from: "#2e1065", to: "#9d174d", accent: "#d946ef" },
};

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function escapeSvg(value: string) {
  return stripHtml(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function shortText(value: string, max = 72) {
  const clean = stripHtml(value);
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function readingTimeMinutes(description: string) {
  const words = stripHtml(description).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}

function createLightweightNewsImage(title: string, game: string, icon?: string) {
  const brand = GAME_BRAND[game] || { label: "Gament News", icon: icon || "📰", from: "#1e1b4b", to: "#020617", accent: "#a855f7" };
  const safeTitle = escapeSvg(shortText(title, 68));
  const safeLabel = escapeSvg(brand.label);
  const safeIcon = escapeSvg(icon || brand.icon || "📰");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540" direction="rtl"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${brand.from}"/><stop offset="1" stop-color="${brand.to}"/></linearGradient><radialGradient id="r" cx="22%" cy="18%" r="80%"><stop offset="0" stop-color="${brand.accent}" stop-opacity=".38"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><filter id="blur"><feGaussianBlur stdDeviation="18"/></filter></defs><rect width="960" height="540" fill="url(#g)"/><rect width="960" height="540" fill="url(#r)"/><circle cx="790" cy="90" r="170" fill="${brand.accent}" opacity=".16" filter="url(#blur)"/><path d="M0 410 C190 330 360 520 560 420 C720 340 815 355 960 300 L960 540 L0 540Z" fill="#020617" opacity=".42"/><rect x="56" y="54" width="848" height="432" rx="42" fill="#000" opacity=".22" stroke="#fff" stroke-opacity=".12"/><text x="840" y="126" text-anchor="end" font-family="Tahoma, Arial, sans-serif" font-size="30" font-weight="800" fill="${brand.accent}">${safeIcon} ${safeLabel}</text><text x="840" y="256" text-anchor="end" font-family="Tahoma, Arial, sans-serif" font-size="48" font-weight="900" fill="#fff"><tspan x="840" dy="0">${safeTitle.slice(0, 38)}</tspan><tspan x="840" dy="64">${safeTitle.slice(38)}</tspan></text><text x="840" y="420" text-anchor="end" font-family="Arial, sans-serif" font-size="26" font-weight="800" fill="#d8b4fe">GAMENT NEWS • SEO GAMING REPORT</text><circle cx="120" cy="420" r="38" fill="${brand.accent}" opacity=".9"/><text x="120" y="432" text-anchor="middle" font-family="Arial" font-size="30" font-weight="900" fill="#fff">G</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

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

  const title = `تازه‌ترین خبر ${gameLabel[first.game] || "گیمینگ"} برای گیمرهای گیمنت`;
  return {
    title,
    summary: `مروری کوتاه و کاربردی بر تازه‌ترین خبرهای ${gameLabel[first.game] || "گیمینگ"} برای بازیکنان رقابتی گیمنت.`,
    description: `در تازه‌ترین موج اخبار گیمینگ، گزارش‌هایی درباره ${gameLabel[first.game] || "بازی‌های رقابتی"} منتشر شده که می‌تواند برای بازیکنان رقابتی گیمنت مهم باشد. منبع اصلی این خبر با عنوان «${first.title}» توسط ${first.source} منتشر شده و نشان می‌دهد دنبال‌کردن تغییرات بازی‌ها برای شرکت در تورنومنت گیمینگ اهمیت زیادی دارد.\n\nگیمنت تلاش می‌کند اخبار مهم کالاف دیوتی موبایل، کلش رویال و فورتنایت را با نگاه رقابتی و کاربردی پوشش دهد تا بازیکنان قبل از ورود به مسابقات، از تغییرات متا، آپدیت‌ها و فضای رقابت آگاه باشند.`,
    game: first.game,
    icon: "📰",
    imageAlt: title,
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

چارچوب و لحن:
- تیتر کوتاه، واضح، کنجکاوی‌برانگیز و SEO محور باشد؛ نه اغراق زرد و نه خشک.
- لحن صمیمی، خبری و حرفه‌ای باشد؛ برای گیمر ایرانی قابل فهم و جذاب.
- پاراگراف اول لید خبری باشد: چه اتفاقی افتاده و چرا برای بازیکن مهم است.
- پاراگراف دوم تحلیل کاربردی برای تورنومنت‌ها، متا، تمرین یا رقابت باشد.
- پاراگراف آخر جمع‌بندی کوتاه با ارتباط طبیعی به گیمنت و تورنومنت گیمینگ باشد.
- اگر منبع واقعی وجود دارد، خبر باید به همان منابع تکیه کند و چیزی را قطعی‌تر از منبع ننویسد.
- اگر منابع کافی نبودند، خبر را به شکل تحلیل کلی/evergreen بنویس و خبر فوری جعلی نساز.
- کلمات کلیدی را طبیعی استفاده کن: گیمنت، gament، تورنومنت گیمینگ، کالاف دیوتی موبایل، کلش رویال، فورتنایت.
- از ایموجی زیاد استفاده نکن؛ نهایتاً یک حس خبری/گیمینگ کافی است.
- خروجی فقط JSON معتبر باشد.

Schema:
{
  "title": "عنوان کوتاه فارسی و مناسب SEO، حداکثر ۷۵ کاراکتر",
  "summary": "لید/خلاصه ۱ تا ۲ جمله‌ای برای کارت خبر، حداکثر ۱۸۰ کاراکتر",
  "description": "۳ پاراگراف فارسی کامل، خوش‌خوان، خبری و کاربردی",
  "game": "clash_royale" | "cod_mobile" | "fortnite",
  "icon": "📰" | "🔥" | "👑" | "⚡",
  "imageAlt": "متن alt فارسی برای تصویر خبر",
  "seoKeywords": ["..."]
}`;

  const systemPrompt = gamentSystemPrompt("honors", "Respond ONLY with valid JSON. No markdown. Never invent fake breaking news.");
  const ai = await fetchAIResponse(prompt, systemPrompt).catch(err => {
    logger.error({ err }, "AI Fetch failed in news generator");
    return null;
  });

  const parsed = ai ? safeParseAIJson<GeneratedNews>(ai.content) : null;
  const news = (parsed?.title && parsed?.description) ? parsed : localFallbackNews(items);
  
  // Ensure strings to prevent SVG encoding errors
  const game = String(news.game || (items.length > 0 ? items[0].game : "cod_mobile")).slice(0, 50);
  const title = shortText(String(news.title || "اخبار جدید گیمینگ"), 90);
  const description = String(news.description || "در حال حاضر جزییات بیشتری در دسترس نیست.").trim();
  const summary = shortText(String(news.summary || description.split("\n")[0] || title), 190);
  const icon = String(news.icon || GAME_BRAND[game]?.icon || "📰").slice(0, 20);
  
  let imageUrl = "";
  try {
    imageUrl = createLightweightNewsImage(title, game, icon);
  } catch (err) {
    logger.error({ err }, "SVG Generation failed");
    imageUrl = ""; // Fallback to empty or a default static URL
  }
  const seoKeywords = Array.isArray(news.seoKeywords) ? news.seoKeywords.map((k) => shortText(String(k), 40)).slice(0, 8) : [];

  const [created] = await db.insert(honors).values({
    type: "news",
    title,
    description,
    icon,
    imageUrl,
    game,
    status: "approved",
    highlight: false,
    publishedAt: new Date(),
    source: "ai_news",
    metadata: {
      summary,
      imageAlt: news.imageAlt || title,
      readTimeMinutes: readingTimeMinutes(description),
      provider: ai?.provider || "local_fallback",
      model: ai?.model || null,
      sources: items,
      seoKeywords,
      dedupeKey: key,
      contentFramework: "gament_news_v2",
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
