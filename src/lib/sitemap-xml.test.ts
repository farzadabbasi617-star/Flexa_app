import { describe, expect, it } from "vitest";
import { PROGRAMMATIC_SEO_PAGES, programmaticPath } from "./programmatic-seo";
import { getStaticSitemapEntries, SITEMAP_PAGE_SIZE } from "./sitemap-data";
import { escapeXml, serializeSitemapIndex, serializeUrlSet } from "./sitemap-xml";
import { GET as getSitemapShard } from "@/app/sitemaps/[kind]/[page]/route";

describe("scalable sitemap output", () => {
  it("keeps each database shard safely below the 50,000 URL protocol limit", () => {
    expect(SITEMAP_PAGE_SIZE).toBeGreaterThan(0);
    expect(SITEMAP_PAGE_SIZE).toBeLessThanOrEqual(50_000);
  });

  it("includes every curated programmatic landing exactly once", () => {
    const paths = getStaticSitemapEntries().map((entry) => entry.path);
    const unique = new Set(paths);
    expect(unique.size).toBe(paths.length);
    for (const page of PROGRAMMATIC_SEO_PAGES) {
      expect(unique.has(programmaticPath(page))).toBe(true);
    }
  });

  it("escapes XML metacharacters in both indexes and URL sets", () => {
    expect(escapeXml(`<&>\"'`)).toBe("&lt;&amp;&gt;&quot;&apos;");
    const urlSet = serializeUrlSet([{ path: "/search?q=a&b=<tag>", priority: 4 }]);
    expect(urlSet).toContain("q=a&amp;b=&lt;tag&gt;");
    expect(urlSet).toContain("<priority>1.00</priority>");
    expect(urlSet).not.toContain("<tag>");

    const index = serializeSitemapIndex([{ url: "/sitemaps/a&b/0.xml" }]);
    expect(index).toContain("a&amp;b");
  });

  it("omits invalid dates instead of emitting invalid lastmod values", () => {
    expect(serializeUrlSet([{ path: "/about", lastModified: "not-a-date" }])).not.toContain("<lastmod>");
  });

  it("serves the static shard as XML and rejects invented shards", async () => {
    const response = await getSitemapShard(new Request("https://www.gament1.ir/sitemaps/static/0.xml"), {
      params: Promise.resolve({ kind: "static", page: "0.xml" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(await response.text()).toContain("<urlset");

    const missing = await getSitemapShard(new Request("https://www.gament1.ir/sitemaps/static/1.xml"), {
      params: Promise.resolve({ kind: "static", page: "1.xml" }),
    });
    expect(missing.status).toBe(404);
  });
});
