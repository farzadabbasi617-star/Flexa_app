import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { siteImages } from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { validateAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { error, status } = await validateAdmin(request);
    if (error) return NextResponse.json({ error }, { status });

    const images = await db
      .select()
      .from(siteImages)
      .orderBy(asc(siteImages.sortOrder), desc(siteImages.createdAt));
    return NextResponse.json(images);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error, status } = await validateAdmin(request);
    if (error) return NextResponse.json({ error }, { status });

    const body = await request.json();
    const { slug, title, url, altText, category, sortOrder } = body;

    if (!slug || !title || !url) {
      return NextResponse.json({ error: "slug, title, url required" }, { status: 400 });
    }

    const [image] = await db
      .insert(siteImages)
      .values({
        slug,
        title,
        url,
        altText: altText || null,
        category: category || "general",
        sortOrder: sortOrder ?? 0,
      })
      .returning();

    return NextResponse.json(image, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { error, status } = await validateAdmin(request);
    if (error) return NextResponse.json({ error }, { status });

    const body = await request.json();
    const { id, ...data } = body;

    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const [updated] = await db
      .update(siteImages)
      .set({ ...data, updatedAt: undefined })
      .where(eq(siteImages.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { error, status } = await validateAdmin(request);
    if (error) return NextResponse.json({ error }, { status });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await db.delete(siteImages).where(eq(siteImages.id, id));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
