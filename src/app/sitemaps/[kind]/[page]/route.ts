import { getSitemapEntries, getStaticSitemapEntries, isSitemapKind } from "@/lib/sitemap-data";
import { serializeUrlSet } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";

const XML_HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

export async function GET(_request: Request, context: { params: Promise<{ kind: string; page: string }> }) {
  const { kind, page: pageFile } = await context.params;
  const match = /^(0|[1-9]\d*)\.xml$/.exec(pageFile);
  if (!match) return new Response("Not found", { status: 404 });

  const page = Number(match[1]);
  if (!Number.isSafeInteger(page) || page > 49_999) return new Response("Not found", { status: 404 });

  if (kind === "static") {
    if (page !== 0) return new Response("Not found", { status: 404 });
    return new Response(serializeUrlSet(getStaticSitemapEntries()), { headers: XML_HEADERS });
  }
  if (!isSitemapKind(kind)) return new Response("Not found", { status: 404 });

  try {
    const entries = await getSitemapEntries(kind, page);
    if (page > 0 && entries.length === 0) return new Response("Not found", { status: 404 });
    return new Response(serializeUrlSet(entries), { headers: XML_HEADERS });
  } catch (error) {
    console.error("[SEO] Sitemap shard unavailable", { kind, page, error });
    return new Response("Sitemap temporarily unavailable", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": "300",
      },
    });
  }
}
