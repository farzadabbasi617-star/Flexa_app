import { absoluteUrl } from "@/lib/seo";
import type { SitemapEntry } from "@/lib/sitemap-data";

export function escapeXml(value: unknown) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isoDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function serializeSitemapIndex(urls: Array<{ url: string; lastModified?: Date | string | null }>) {
  const items = urls.map(({ url, lastModified }) => {
    const date = isoDate(lastModified);
    return `<sitemap><loc>${escapeXml(absoluteUrl(url))}</loc>${date ? `<lastmod>${date}</lastmod>` : ""}</sitemap>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</sitemapindex>`;
}

export function serializeUrlSet(entries: SitemapEntry[]) {
  const items = entries.map((entry) => {
    const date = isoDate(entry.lastModified);
    const priority = typeof entry.priority === "number" ? Math.max(0, Math.min(1, entry.priority)).toFixed(2) : null;
    return [
      "<url>",
      `<loc>${escapeXml(absoluteUrl(entry.path))}</loc>`,
      date ? `<lastmod>${date}</lastmod>` : "",
      entry.changeFrequency ? `<changefreq>${entry.changeFrequency}</changefreq>` : "",
      priority ? `<priority>${priority}</priority>` : "",
      "</url>",
    ].join("");
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</urlset>`;
}
