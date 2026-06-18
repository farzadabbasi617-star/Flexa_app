import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { siteImages } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    console.log("🔵 Background API called");
    
    // First try to find app-background or app-bg
    let images = await db
      .select()
      .from(siteImages)
      .where(and(
        sql`slug IN ('app-background', 'app-bg')`,
        eq(siteImages.isActive, true)
      ));
    
    console.log("📊 Query for background slugs:", images.length, "found");
    
    // If not found, try "background" slug
    if (images.length === 0) {
      images = await db
        .select()
        .from(siteImages)
        .where(and(
          eq(siteImages.slug, "background"),
          eq(siteImages.isActive, true)
        ));
      console.log("📊 Query for 'background':", images.length, "found");
    }

    if (images.length > 0 && images[0].url) {
      const bgImage = images[0];
      console.log("✅ Background found:", bgImage.url);
      return NextResponse.json({ 
        url: bgImage.url,
        slug: bgImage.slug,
        title: bgImage.title
      });
    }

    // No custom background found - return null to use default
    console.log("ℹ️ No custom background found, using default");
    return NextResponse.json({ url: null });
  } catch (error) {
    console.error("❌ Background API error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
