import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { siteImages } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

// Was `force-dynamic`, meaning this handler skipped Next's data cache
// entirely and hit Postgres on every single request. Since <ThemeRuntime>
// (which calls this endpoint) is mounted in the root layout, that meant
// EVERY page view on the whole site — including every client-side
// navigation — triggered a fresh DB round trip just to fetch a background
// image URL that rarely changes. Revalidating every 5 minutes instead
// keeps the background reasonably fresh (picks up admin changes quickly)
// while cutting DB load dramatically under normal traffic.
export const revalidate = 300;

export async function GET(request: NextRequest) {
  try {
    // First try to find app-background or app-bg
    let images = await db
      .select()
      .from(siteImages)
      .where(and(
        sql`slug IN ('app-background', 'app-bg')`,
        eq(siteImages.isActive, true)
      ));

    // If not found, try "background" slug
    if (images.length === 0) {
      images = await db
        .select()
        .from(siteImages)
        .where(and(
          eq(siteImages.slug, "background"),
          eq(siteImages.isActive, true)
        ));
    }

    if (images.length > 0 && images[0].url) {
      const bgImage = images[0];
      return NextResponse.json(
        { url: bgImage.url, slug: bgImage.slug, title: bgImage.title },
        { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
      );
    }

    // No custom background found - return null to use default
    return NextResponse.json(
      { url: null },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
    );
  } catch (error) {
    console.error("❌ Background API error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
