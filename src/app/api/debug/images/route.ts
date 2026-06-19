import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { siteImages } from "@/db/schema";

export async function GET() {
  try {
    const images = await db.select().from(siteImages);
    return NextResponse.json(images);
  } catch (error) {
    return NextResponse.json({ error: "Error fetching images" }, { status: 500 });
  }
}
