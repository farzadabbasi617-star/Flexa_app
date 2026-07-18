import crypto from "crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { honorContentLikes, honorContentViews, honorLikes, honorViews, honors, telegramSentNotifications } from "@/db/schema";
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
  imageUrl?: string;
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
  { game: "clash_royale", query: "site:supercell.com Clash Royale news OR site:royaleapi.com update" },
  { game: "cod_mobile", query: "site:callofduty.com mobile season update OR site:charlieintel.com codm" },
  { game: "fortnite", query: "site:fortnite.com news OR site:fnbr.co fortnite update" },
];

const GAME_BRAND: Record<string, { label: string; icon: string; from: string; to: string; accent: string }> = {
  clash_royale: { label: "کلش رویال", icon: "👑", from: "#083344", to: "#1d4ed8", accent: "#22d3ee" },
  cod_mobile: { label: "کالاف دیوتی موبایل", icon: "🎯", from: "#431407", to: "#991b1b", accent: "#fb923c" },
  fortnite: { label: "فورتنایت", icon: "🏗️", from: "#2e1065", to: "#9d174d", accent: "#d946ef" },
};

const GAME_TEMPLATE_IMAGES: Record<NewsItem["game"], string[]> = {
  clash_royale: [
    "/news/supercell-store-goblin-emote-freebie.jpg",
    "https://clashroyale.inbox.supercell.com/9jtsgmsiuthj/6RiSIAymrumYiP7YvqvrPN/f15b9acaca486955a753d634ca2fb3d5/March_Balance_changes.jpg",
  ],
  cod_mobile: ["/news/codm-season-6-arcade-weapons.jpg", "/news/codm-season-6-arcade-action.jpg"],
  fortnite: ["/icons/icon-fortnite.png"],
};

const GAME_SEO_KEYWORDS: Record<NewsItem["game"], string[]> = {
  clash_royale: ["اخبار کلش رویال", "آپدیت کلش رویال", "Clash Royale", "متای کلش رویال", "مسابقات کلش رویال Gament"],
  cod_mobile: ["اخبار کالاف دیوتی موبایل", "آپدیت COD Mobile", "فصل جدید کالاف موبایل", "متای CODM", "مسابقات کالاف موبایل Gament"],
  fortnite: ["اخبار فورتنایت", "آپدیت Fortnite", "فصل جدید فورتنایت", "متای فورتنایت", "مسابقات فورتنایت Gament"],
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
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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

      // بهبود استخراج تصویر از منابع مختلف
      let imageUrl = "";
      const description = extractTag(block, "description");
      const imgInDescription = description.match(/src="([^"]+)"/i) || description.match(/url="([^"]+)"/i);

      const imgMatch = block.match(/<media:content[^>]+url="([^"]+)"/i) ||
                       block.match(/<enclosure[^>]+url="([^"]+)"/i) ||
                       (imgInDescription ? imgInDescription : null);

      if (imgMatch) {
        imageUrl = imgMatch[1];
        if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
      }

      return { title, link, source, pubDate, game, imageUrl };
    }).filter((item) => item.title && item.link);
  } catch (err) {
    logger.warn({ err, query, game }, "Failed to fetch Google News RSS");
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchDiscordNewsItems(): Promise<NewsItem[]> {
  const token = process.env.DISCORD_BOT_TOKEN;
  const channelIds = (process.env.DISCORD_CHANNEL_IDS || "").split(",").filter(Boolean);

  if (!token || channelIds.length === 0) return [];

  const allMessages: NewsItem[] = [];

  for (const channelId of channelIds) {
    try {
      const res = await fetch(`https://discord.com/api/v10/channels/${channelId.trim()}/messages?limit=5`, {
        headers: { Authorization: `Bot ${token}` },
        cache: "no-store",
      });

      if (!res.ok) continue;

      const messages = await res.json();
      for (const msg of messages) {
        if (!msg.content && (!msg.attachments || msg.attachments.length === 0)) continue;

        // تشخیص بازی بر اساس محتوای کانال یا کلمات کلیدی
        let game: NewsItem["game"] = "cod_mobile";
        const content = msg.content.toLowerCase();
        if (content.includes("royale") || content.includes("king")) game = "clash_royale";
        else if (content.includes("fortnite") || content.includes("build")) game = "fortnite";

        allMessages.push({
          title: msg.content.slice(0, 100),
          link: `https://discord.com/channels/${msg.guild_id}/${channelId}/${msg.id}`,
          source: "Discord Official",
          pubDate: msg.timestamp,
          game,
          imageUrl: msg.attachments?.[0]?.url || "",
        });
      }
    } catch (err) {
      logger.warn({ err, channelId }, "Failed to fetch Discord messages");
    }
  }

  return allMessages;
}

export function isRecentNewsItem(item: NewsItem, maxAgeHours = 96) {
  if (!item.pubDate) return false;
  const published = new Date(item.pubDate).getTime();
  return Number.isFinite(published) && published <= Date.now() + 60 * 60 * 1000 && published >= Date.now() - maxAgeHours * 60 * 60 * 1000;
}

function validExternalImage(value?: string | null) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && !/googleusercontent\.com\/favicon/i.test(url.href);
  } catch {
    return false;
  }
}

async function fetchArticlePreviewImage(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GamentNews/1.0)", Accept: "text/html" },
      cache: "no-store",
    });
    if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return "";
    const html = (await response.text()).slice(0, 500_000);
    const match = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    if (!match?.[1]) return "";
    const absolute = new URL(match[1], response.url).href;
    return validExternalImage(absolute) ? absolute : "";
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function collectGamingNewsItems() {
  const discordResults = await fetchDiscordNewsItems();
  const rawItems = discordResults.length > 0
    ? discordResults.slice(0, 15)
    : (await Promise.all(NEWS_QUERIES.map((entry) => fetchGoogleNewsItems(entry.query, entry.game)))).flat().slice(0, 15);
  const recentItems = rawItems.filter((item) => isRecentNewsItem(item));
  const enriched = await Promise.all(recentItems.map(async (item) => ({
    ...item,
    imageUrl: validExternalImage(item.imageUrl) ? item.imageUrl : await fetchArticlePreviewImage(item.link),
  })));
  return enriched;
}

async function hasGenerated(dedupeKey: string) {
  try {
    const [row] = await db
      .select({ id: telegramSentNotifications.id })
      .from(telegramSentNotifications)
      .where(eq(telegramSentNotifications.dedupeKey, dedupeKey))
      .limit(1);
    return Boolean(row);
  } catch (err) {
    logger.warn({ err, dedupeKey }, "Failed to check hasGenerated, assuming false");
    return false;
  }
}

async function markGenerated(dedupeKey: string) {
  try {
    await db
      .insert(telegramSentNotifications)
      .values({ dedupeKey, type: "daily_gaming_news" })
      .onConflictDoNothing({ target: telegramSentNotifications.dedupeKey });
  } catch (err) {
    logger.error({ err, dedupeKey }, "Failed to markGenerated");
  }
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
    description: `در تازه‌ترین گزارش مربوط به ${gameLabel[first.game] || "بازی رقابتی"}، منبع «${first.source}» خبری با عنوان «${first.title}» منتشر کرده است. این خبر برای بازیکنان رقابتی اهمیت دارد، چون تغییرات رسمی، رویدادهای محدود و به‌روزرسانی‌های بازی می‌توانند روی تصمیم‌های روزانه و آمادگی برای مسابقات اثر بگذارند.\n\nگیمنت این گزارش را با تمرکز بر جامعه رقابتی ${gameLabel[first.game] || "گیمینگ"} منتشر می‌کند. برای جزئیات قطعی باید منبع اصلی خبر بررسی شود و بازیکنان پیش از تغییر استراتژی، تجهیزات یا برنامه مسابقه خود، اطلاعیه رسمی ناشر را مبنا قرار دهند.`,
    game: first.game,
    icon: "📰",
    imageAlt: title,
    seoKeywords: ["گیمنت", "تورنومنت گیمینگ", gameLabel[first.game] || "گیمینگ"],
  };
}

/**
 * Removes news older than N days to keep the database lean.
 */
export async function cleanupOldNews(days = 7) {
  try {
    const threshold = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000);
    const oldRows = await db.select({ id: honors.id }).from(honors).where(and(
      eq(honors.type, "news"),
      eq(honors.source, "ai_news"),
      sql`COALESCE(${honors.publishedAt}, ${honors.createdAt}) < ${threshold}`,
    ));
    const ids = oldRows.map((row) => row.id);
    if (!ids.length) return { deleted: 0 };

    await db.transaction(async (tx) => {
      await tx.delete(honorLikes).where(inArray(honorLikes.honorId, ids));
      await tx.delete(honorViews).where(inArray(honorViews.honorId, ids));
      await tx.delete(honorContentLikes).where(inArray(honorContentLikes.contentId, ids));
      await tx.delete(honorContentViews).where(inArray(honorContentViews.contentId, ids));
      await tx.delete(honors).where(inArray(honors.id, ids));
    });
    logger.info({ days, deleted: ids.length }, "Cleaned up expired AI news from honors table");
    return { deleted: ids.length };
  } catch (err) {
    logger.error({ err }, "Failed to cleanup old news");
    return { deleted: 0, error: true };
  }
}

function sourceFingerprint(items: NewsItem[]) {
  return crypto.createHash("sha256")
    .update(items.map((item) => `${item.game}:${item.link}`).sort().join("|"))
    .digest("hex")
    .slice(0, 24);
}

function templateImage(game: NewsItem["game"], fingerprint: string) {
  const images = GAME_TEMPLATE_IMAGES[game];
  if (!images?.length) return "";
  const index = Number.parseInt(fingerprint.slice(0, 8), 16) % images.length;
  return images[index];
}

async function generateNewsForGame(game: NewsItem["game"], items: NewsItem[], today: string, force: boolean) {
  if (!items.length) return { generated: false as const, game, reason: "no_recent_sources" };
  const dailyKey = `daily-gaming-news:${today}:${game}`;
  const fingerprint = sourceFingerprint(items);
  const sourceKey = `gaming-news-source:${fingerprint}`;
  if (!force) {
    const dayStart = new Date(`${today}T00:00:00+03:30`);
    const [existingToday] = await db.select({ id: honors.id }).from(honors).where(and(
      eq(honors.type, "news"),
      eq(honors.source, "ai_news"),
      eq(honors.game, game),
      sql`COALESCE(${honors.publishedAt}, ${honors.createdAt}) >= ${dayStart}`,
    )).limit(1);
    if (existingToday || await hasGenerated(dailyKey)) return { generated: false as const, game, reason: "already_today" };
  }
  if (!force && await hasGenerated(sourceKey)) return { generated: false as const, game, reason: "source_already_used" };

  const brand = GAME_BRAND[game];
  const sourcesText = items.map((item, index) =>
    `${index + 1}. ${item.title}\nمنبع: ${item.source}\nتاریخ: ${item.pubDate || "نامشخص"}\nلینک: ${item.link}`
  ).join("\n\n");
  const seo = GAME_SEO_KEYWORDS[game].join("، ");
  const prompt = `تو سردبیر فارسی Gament هستی. براساس منابع زیر یک خبر روز دقیق درباره ${brand.label} بنویس.

${sourcesText}

قواعد اجباری:
- فقط اطلاعاتی را بنویس که در تیتر/منابع قابل استناد است؛ خبر یا عدد نساز.
- نام هیچ بازی دیگری را وارد نکن.
- متن ۵۰۰ تا ۷۰۰ کلمه، روان، غیرتکراری و مناسب مخاطب ایرانی باشد.
- ساختار متن: مقدمه خبری، جزئیات اصلی، تأثیر روی بازیکنان رقابتی، جمع‌بندی.
- کلمات سئو را طبیعی و بدون Keyword Stuffing استفاده کن: ${seo}.
- لینک منابع را داخل متن تکرار نکن؛ منابع جداگانه نمایش داده می‌شوند.

فقط JSON معتبر بده:
{
  "title":"تیتر فارسی دقیق و جذاب بدون کلیک‌بیت دروغین",
  "summary":"خلاصه ۱۴۰ تا ۱۹۰ کاراکتری",
  "description":"متن کامل فارسی با پاراگراف‌بندی",
  "game":"${game}",
  "icon":"${brand.icon}",
  "imageAlt":"Alt فارسی دقیق برای تصویر خبر",
  "seoKeywords":["حداکثر ۸ عبارت مرتبط"]
}`;
  const systemPrompt = gamentSystemPrompt("honors", "You are a fact-grounded Persian gaming news editor. Return valid JSON only. Never fabricate facts.");
  const ai = await fetchAIResponse(prompt, systemPrompt).catch((error) => {
    logger.warn({ error, game }, "AI news generation failed; using source-grounded local template");
    return null;
  });
  const parsed = ai ? safeParseAIJson<GeneratedNews>(ai.content) : null;
  const news = parsed?.title && parsed?.description ? parsed : localFallbackNews(items);
  const title = shortText(String(news.title || items[0].title), 100);
  const description = String(news.description || "").trim();
  const summary = shortText(String(news.summary || description.split("\n")[0] || title), 190);
  const icon = String(news.icon || brand.icon).slice(0, 20);
  const sourceImage = items.find((item) => validExternalImage(item.imageUrl))?.imageUrl || "";
  const imageUrl = sourceImage || templateImage(game, fingerprint) || createLightweightNewsImage(title, game, icon);
  const generatedKeywords = Array.isArray(news.seoKeywords)
    ? news.seoKeywords.map((keyword) => shortText(String(keyword), 50)).filter(Boolean)
    : [];
  const seoKeywords = [...new Set([...generatedKeywords, ...GAME_SEO_KEYWORDS[game]])].slice(0, 8);

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
      dailyKey,
      sourceFingerprint: fingerprint,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      imageOrigin: sourceImage ? "source_og_image" : "existing_gament_template",
      contentFramework: "gament_news_v3_template_matched",
    },
  }).returning();
  await Promise.all([markGenerated(dailyKey), markGenerated(sourceKey)]);
  logger.info({ honorId: created.id, title, game, sources: items.length }, "Generated daily game news");
  return { generated: true as const, honorId: created.id, title, game, sources: items.length, provider: ai?.provider || "local_fallback" };
}

export async function generateDailyGamingNews({ force = false } = {}) {
  const cleanup = await cleanupOldNews(7);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
  const items = await collectGamingNewsItems();
  if (!items.length) return { generated: false, generatedCount: 0, reason: "no_recent_sources", cleanup };

  const games: NewsItem["game"][] = ["clash_royale", "cod_mobile", "fortnite"];
  const results = await Promise.all(games.map((game) =>
    generateNewsForGame(game, items.filter((item) => item.game === game).slice(0, 4), today, force)
  ));
  const generated = results.filter((result) => result.generated);
  if (generated.length > 0) {
    await db.update(honors).set({ highlight: false, updatedAt: new Date() })
      .where(and(eq(honors.type, "news"), eq(honors.source, "ai_news")));
    await db.update(honors).set({ highlight: true, updatedAt: new Date() })
      .where(eq(honors.id, generated[0].honorId));
  }
  return {
    generated: generated.length > 0,
    generatedCount: generated.length,
    items: results,
    cleanup,
  };
}
