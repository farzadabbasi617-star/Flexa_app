import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { siteImages } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";


export async function GET(request: NextRequest) {
  try {
    const category = request.nextUrl.searchParams.get("category");

    const conditions = [eq(siteImages.isActive, true)];
    if (category) {
      conditions.push(eq(siteImages.category, category));
    }

    const images = await db
      .select()
      .from(siteImages)
      .where(and(...conditions))
      .orderBy(asc(siteImages.sortOrder));

    return NextResponse.json(images);
  } catch {
    return NextResponse.json([]);
  }
}
