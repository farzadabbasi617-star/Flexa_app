import { NextResponse } from "next/server";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db.select().from(siteSettings);
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value || "";
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json({});
  }
}
