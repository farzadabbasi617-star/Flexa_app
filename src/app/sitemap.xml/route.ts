import { SITE_URL } from "@/lib/seo";
import { getSitemapShardCounts, SITEMAP_KINDS } from "@/lib/sitemap-data";
import { serializeSitemapIndex } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";

const XML_HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

export async function GET() {
  try {
    const counts = await getSitemapShardCounts();
    const sitemaps = [{ url: "/sitemaps/static/0.xml" }];
    for (const kind of SITEMAP_KINDS) {
      for (let page = 0; page < counts[kind]; page += 1) {
        sitemaps.push({ url: `/sitemaps/${kind}/${page}.xml` });
      }
    }
    return new Response(serializeSitemapIndex(sitemaps), { headers: XML_HEADERS });
  } catch (error) {
    // Keep evergreen URLs discoverable during a database outage. The short
    // cache ensures dynamic shards return to the index quickly after recovery;
    // removing a URL from a sitemap temporarily does not itself deindex it.
    console.error("[SEO] Serving static-only sitemap index", error);
    return new Response(serializeSitemapIndex([{ url: "/sitemaps/static/0.xml" }]), {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        "X-Sitemap-Partial": "database-unavailable",
        "X-Sitemap-Origin": SITE_URL,
      },
    });
  }
}
