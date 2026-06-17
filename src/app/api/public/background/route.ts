import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { siteImages } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    // First try to find app-background
    let [bgImage] = await db
      .select()
      .from(siteImages)
      .where(and(
        eq(siteImages.slug, "app-background"),
        eq(siteImages.isActive, true)
      ));
    
    // If not found, try "background" slug
    if (!bgImage) {
      [bgImage] = await db
        .select()
        .from(siteImages)
        .where(and(
          eq(siteImages.slug, "background"),
          eq(siteImages.isActive, true)
        ));
    }

    if (bgImage) {
      return NextResponse.json({ 
        url: bgImage.url,
        slug: bgImage.slug 
      });
    }

    // No custom background found - return null to use default
    return NextResponse.json({ url: null });
  } catch (error) {
    console.error("Background API error:", error);
    return NextResponse.json({ url: null });
  }
}
