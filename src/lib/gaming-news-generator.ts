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
  content?: string;
};

type GeneratedNews = {
  reject?: boolean;
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

const TRUSTED_NEWS_HOSTS: Record<NewsItem["game"], string[]> = {
  clash_royale: ["supercell.com", "clashroyale.com", "royaleapi.com"],
  cod_mobile: ["callofduty.com", "activision.com", "charlieintel.com"],
  fortnite: ["fortnite.com", "epicgames.com"],
};

const GAME_SEO_KEYWORDS: Record<NewsItem["game"], string[]> = {
  clash_royale: ["اخبار کلش رویال", "آپدیت کلش رویال", "Clash Royale", "متای کلش رویال", "مسابقات کلش رویال Gament"],
  cod_mobile: ["اخبار کالاف دیوتی موبایل", "آپدیت COD Mobile", "فصل جدید کالاف موبایل", "متای CODM", "مسابقات کالاف موبایل Gament"],
  fortnite: ["اخبار فورتنایت", "آپدیت Fortnite", "فصل جدید فورتنایت", "متای فورتنایت", "مسابقات فورتنایت Gament"],
};

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function shortText(value: string, max = 72) {
  const clean = stripHtml(value);
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function readingTimeMinutes(description: string) {
  const words = stripHtml(description).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
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

      return { title, link, source, pubDate, game, imageUrl, content: stripHtml(description) };
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
          content: stripHtml(msg.content || ""),
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

function isTrustedNewsUrl(value: string, game: NewsItem["game"]) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return TRUSTED_NEWS_HOSTS[game].some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

async function fetchTrustedArticleDetails(item: NewsItem) {
  if (!isTrustedNewsUrl(item.link, item.game)) return { imageUrl: item.imageUrl || "", content: item.content || "" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(item.link, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GamentNews/1.0)", Accept: "text/html" },
      cache: "no-store",
    });
    if (!response.ok || !isTrustedNewsUrl(response.url, item.game) || !(response.headers.get("content-type") || "").includes("text/html")) {
      return { imageUrl: item.imageUrl || "", content: item.content || "" };
    }
    const html = (await response.text()).slice(0, 800_000);
    const imageMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    const imageUrl = imageMatch?.[1] ? new URL(imageMatch[1], response.url).href : item.imageUrl || "";
    const articleHtml = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] || html;
    const content = decodeXml(stripHtml(articleHtml
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " "))).slice(0, 12_000);
    return {
      imageUrl: validExternalImage(imageUrl) ? imageUrl : item.imageUrl || "",
      content: content.length >= 250 ? content : item.content || "",
    };
  } catch {
    return { imageUrl: item.imageUrl || "", content: item.content || "" };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTelegramNewsItems(): Promise<NewsItem[]> {
  const configured = (process.env.GAMING_NEWS_TELEGRAM_CHANNELS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const rows: NewsItem[] = [];
  for (const entry of configured) {
    const [gameRaw, channelRaw] = entry.split(":");
    const game = gameRaw as NewsItem["game"];
    const channel = String(channelRaw || "").replace(/^@/, "");
    if (!GAME_BRAND[game] || !/^[A-Za-z0-9_]{5,64}$/.test(channel)) continue;
    try {
      const response = await fetch(`https://t.me/s/${channel}`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; GamentNews/1.0)" },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) continue;
      const html = await response.text();
      const blocks = html.match(/<div class="tgme_widget_message_wrap[\s\S]*?<\/article>\s*<\/div>/gi) || [];
      for (const block of blocks.slice(-5)) {
        const content = stripHtml(block.match(/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
        const link = block.match(/<a class="tgme_widget_message_date" href="([^"]+)"/i)?.[1] || "";
        const pubDate = block.match(/<time[^>]+datetime="([^"]+)"/i)?.[1] || null;
        const imageUrl = decodeXml(block.match(/background-image:url\(['"]?([^)'\"]+)/i)?.[1] || "");
        if (content.length < 120 || !link) continue;
        rows.push({ title: shortText(content, 100), content, link, source: `Telegram @${channel}`, pubDate, game, imageUrl });
      }
    } catch (error) {
      logger.warn({ error, channel, game }, "Failed to fetch configured Telegram news channel");
    }
  }
  return rows;
}

async function collectGamingNewsItems() {
  const [discordResults, telegramResults, ...googleGroups] = await Promise.all([
    fetchDiscordNewsItems(),
    fetchTelegramNewsItems(),
    ...NEWS_QUERIES.map((entry) => fetchGoogleNewsItems(entry.query, entry.game)),
  ]);
  const rawItems = [...discordResults, ...telegramResults, ...googleGroups.flat()].slice(0, 30);
  const recentItems = rawItems.filter((item) => isRecentNewsItem(item));
  const enriched = await Promise.all(recentItems.map(async (item) => ({ ...item, ...await fetchTrustedArticleDetails(item) })));
  // A title alone is not enough to produce a faithful translation. Publish
  // only when a trusted article or configured Discord message contains text.
  return enriched.filter((item) => {
    const length = stripHtml(item.content || "").length;
    const configuredFeed = item.source.startsWith("Discord") || item.source.startsWith("Telegram @");
    return configuredFeed ? length >= 120 : isTrustedNewsUrl(item.link, item.game) && length >= 250;
  });
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

/**
 * Removes news older than N days to keep the database lean.
 */
export async function cleanupOldNews(days = 7) {
  try {
    const threshold = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000);
    const oldRows = await db.select({ id: honors.id }).from(honors).where(and(
      eq(honors.type, "news"),
      eq(honors.source, "ai_news"),
      sql`(
        COALESCE(${honors.publishedAt}, ${honors.createdAt}) < ${threshold}
        OR COALESCE(${honors.metadata}->>'contentFramework', '') <> 'gament_news_v4_source_translation'
      )`,
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
    `${index + 1}. عنوان: ${item.title}\nمنبع: ${item.source}\nتاریخ: ${item.pubDate || "نامشخص"}\nمتن منبع:\n${stripHtml(item.content || "").slice(0, 6000)}\nلینک: ${item.link}`
  ).join("\n\n");
  const seo = GAME_SEO_KEYWORDS[game].join("، ");
  const prompt = `متن معتبر زیر را بدون افزودن اطلاعات تازه به فارسی روان ترجمه و برای انتشار در Gament ویرایش کن. موضوع فقط ${brand.label} است.

${sourcesText}

قواعد اجباری:
- فقط ترجمه و بازنویسی وفادار به متن منبع؛ هیچ خبر، عدد، توصیه، تحلیل یا ادعای جدید نساز.
- اگر متن منبع اطلاعات کافی ندارد، JSON با فیلد \"reject\":true برگردان.
- نام هیچ بازی دیگری را وارد نکن.
- طول متن متناسب با محتوای واقعی منبع باشد؛ برای بلندترشدن متن چیزی اضافه نکن.
- نام آیتم‌ها، فصل‌ها، مودها و تاریخ‌ها را دقیق حفظ کن.
- کلمات سئو را فقط جایی که طبیعی و مرتبط است استفاده کن: ${seo}.
- لینک منابع را داخل متن تکرار نکن؛ منابع جداگانه نمایش داده می‌شوند.

فقط JSON معتبر بده:
{
  "reject":false,
  "title":"ترجمه دقیق تیتر منبع بدون کلیک‌بیت",
  "summary":"خلاصه ۱۴۰ تا ۱۹۰ کاراکتری",
  "description":"متن کامل فارسی با پاراگراف‌بندی",
  "game":"${game}",
  "icon":"${brand.icon}",
  "imageAlt":"Alt فارسی دقیق برای تصویر خبر",
  "seoKeywords":["حداکثر ۸ عبارت مرتبط"]
}`;
  const systemPrompt = gamentSystemPrompt("honors", "You are a strict Persian translator of trusted gaming source text. Preserve facts exactly, add nothing, and return valid JSON only. If the source lacks enough text, set reject=true.");
  const ai = await fetchAIResponse(prompt, systemPrompt).catch((error) => {
    logger.warn({ error, game }, "AI news generation failed; using source-grounded local template");
    return null;
  });
  const parsed = ai ? safeParseAIJson<GeneratedNews>(ai.content) : null;
  if (!parsed || parsed.reject || !parsed.title || !parsed.description) {
    return { generated: false as const, game, reason: "source_translation_rejected" };
  }
  const news = parsed;
  const title = shortText(String(news.title), 100);
  const description = String(news.description).trim();
  const summary = shortText(String(news.summary || description.split("\n")[0] || title), 190);
  const icon = String(news.icon || brand.icon).slice(0, 20);
  const sourceImage = items.find((item) => validExternalImage(item.imageUrl))?.imageUrl || "";
  if (!sourceImage) return { generated: false as const, game, reason: "missing_trusted_source_image" };
  const imageUrl = sourceImage;
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
      imageOrigin: "trusted_source_image",
      contentFramework: "gament_news_v4_source_translation",
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
