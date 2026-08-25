import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { honors } from "@/db/schema";
import { getStaticHonorById, type StaticHonor } from "@/lib/static-honors";

export interface HonorArticleSeo {
  id: string;
  type: string;
  status: string;
  source: string;
  title: string;
  summary: string | null;
  description: string;
  game: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  publishedAt: Date | string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  sources: unknown;
  seoKeywords: string[];
  readTimeMinutes: number | null;
}

export type HonorArticleLookup =
  | { state: "found"; data: HonorArticleSeo }
  | { state: "missing" }
  | { state: "unavailable" };

function metadataObject(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function staticHonorIsPublic(honor: StaticHonor) {
  if (honor.type !== "news") return true;
  const published = new Date(honor.publishedAt || honor.createdAt || 0).getTime();
  return Number.isFinite(published) && published >= Date.now() - 7 * 24 * 60 * 60 * 1000;
}

function fromStaticHonor(honor: StaticHonor): HonorArticleSeo {
  return {
    id: honor.id,
    type: honor.type,
    status: "approved",
    source: "static",
    title: honor.title,
    summary: honor.summary ?? null,
    description: honor.description,
    game: honor.game ?? null,
    imageUrl: honor.image ?? null,
    imageAlt: honor.imageAlt ?? honor.title,
    publishedAt: honor.publishedAt ?? null,
    createdAt: honor.createdAt ?? honor.publishedAt ?? null,
    updatedAt: honor.publishedAt ?? honor.createdAt ?? null,
    sources: honor.sources ?? null,
    seoKeywords: honor.seoKeywords ?? [],
    readTimeMinutes: honor.readTimeMinutes ?? null,
  };
}

function uuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** Public, server-side article projection used by metadata and initial HTML. */
export const lookupHonorArticleForSeo = cache(async (id: string): Promise<HonorArticleLookup> => {
  const staticHonor = getStaticHonorById(id);
  if (staticHonor) {
    return staticHonorIsPublic(staticHonor)
      ? { state: "found", data: fromStaticHonor(staticHonor) }
      : { state: "missing" };
  }
  if (!uuidLike(id)) return { state: "missing" };

  try {
    const [row] = await db
      .select({
        id: honors.id,
        type: honors.type,
        status: honors.status,
        source: honors.source,
        title: honors.title,
        description: honors.description,
        game: honors.game,
        imageUrl: honors.imageUrl,
        publishedAt: honors.publishedAt,
        createdAt: honors.createdAt,
        updatedAt: honors.updatedAt,
        metadata: honors.metadata,
      })
      .from(honors)
      .where(and(eq(honors.id, id), eq(honors.status, "approved")))
      .limit(1);

    if (!row) return { state: "missing" };
    const meta = metadataObject(row.metadata);
    return {
      state: "found",
      data: {
        id: row.id,
        type: row.type,
        status: row.status,
        source: row.source,
        title: row.title,
        summary: typeof meta.summary === "string" ? meta.summary : null,
        description: row.description,
        game: row.game,
        imageUrl: row.imageUrl,
        imageAlt: typeof meta.imageAlt === "string" ? meta.imageAlt : null,
        publishedAt: row.publishedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        sources: meta.sources ?? null,
        seoKeywords: Array.isArray(meta.seoKeywords)
          ? meta.seoKeywords.filter((keyword): keyword is string => typeof keyword === "string")
          : [],
        readTimeMinutes: typeof meta.readTimeMinutes === "number" ? meta.readTimeMinutes : null,
      },
    };
  } catch (error) {
    console.error("[SEO] Honor lookup unavailable", { id, error });
    return { state: "unavailable" };
  }
});

/** Backwards-compatible nullable helper for non-routing callers. */
export async function getHonorArticleForSeo(id: string) {
  const result = await lookupHonorArticleForSeo(id);
  return result.state === "found" ? result.data : null;
}

export function honorParagraphs(description: string) {
  return String(description || "")
    .split(/(?:\r?\n){2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isoDate(value: Date | string | null | undefined) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function sourceUrls(sources: unknown): string[] {
  if (!Array.isArray(sources)) return [];
  return sources
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        if (typeof record.link === "string") return record.link;
        return typeof record.url === "string" ? record.url : "";
      }
      return "";
    })
    .filter((url) => url.startsWith("https://"));
}

function publicImageUrl(value: string | null, baseUrl: string) {
  if (!value) return undefined;
  if (value.startsWith("https://") || value.startsWith("http://")) return value;
  if (value.startsWith("/")) return `${baseUrl}${value}`;
  return undefined;
}

export function honorNewsArticleJsonLd(article: HonorArticleSeo, baseUrl: string) {
  const url = `${baseUrl}/honors/${article.id}`;
  const published = isoDate(article.publishedAt);
  const modified = isoDate(article.updatedAt || article.publishedAt || article.createdAt);
  const citations = sourceUrls(article.sources);
  const image = publicImageUrl(article.imageUrl, baseUrl);

  return {
    "@context": "https://schema.org",
    "@type": article.type === "news" ? "NewsArticle" : "Article",
    "@id": `${url}#article`,
    headline: article.title.slice(0, 110),
    description: (article.summary || article.description).slice(0, 300),
    ...(image ? { image: [image] } : {}),
    ...(published ? { datePublished: published } : {}),
    ...(modified ? { dateModified: modified } : {}),
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@id": `${baseUrl}/#organization` },
    publisher: { "@id": `${baseUrl}/#organization` },
    inLanguage: "fa-IR",
    ...(article.game ? { articleSection: article.game } : {}),
    ...(article.seoKeywords.length ? { keywords: article.seoKeywords.join(", ") } : {}),
    ...(citations.length ? { citation: citations } : {}),
  };
}
