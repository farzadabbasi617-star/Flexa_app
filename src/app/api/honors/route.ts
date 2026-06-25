import { NextResponse } from "next/server";
import { db } from "@/db";
import { honors } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import logger from "@/lib/logger";
import { STATIC_HONORS } from "@/lib/static-honors";

export const dynamic = "force-dynamic";

function iconForType(type: string) {
  if (type === "winner" || type === "runner_up" || type === "record") return "🏆";
  if (type === "levelup" || type === "rankup") return "⚡";
  if (type === "fairplay") return "🤝";
  if (type === "team") return "🛡️";
  if (type === "event") return "🎉";
  return "📰";
}

function metadataObject(metadata: unknown): Record<string, any> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, any> : {};
}

function relativeTime(date: Date | string | null | undefined) {
  if (!date) return "به‌تازگی";
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60_000));
  if (minutes < 60) return `${minutes.toLocaleString("fa-IR")} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours.toLocaleString("fa-IR")} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days.toLocaleString("fa-IR")} روز پیش`;
  return new Date(date).toLocaleDateString("fa-IR");
}

export async function GET() {
  const staticRows = STATIC_HONORS.map((item) => ({
    ...item,
    time: relativeTime(item.publishedAt || item.createdAt),
  }));

  try {
    const rows = await db
      .select()
      .from(honors)
      .where(eq(honors.status, "approved"))
      .orderBy(desc(honors.highlight), desc(honors.publishedAt), desc(honors.createdAt))
      .limit(100);

    const dbRows = rows.map((row) => ({
      id: row.id,
      type: row.type,
      icon: row.icon || iconForType(row.type),
      title: row.title,
      description: row.description,
      time: relativeTime(row.publishedAt || row.createdAt),
      prize: row.prize || undefined,
      username: row.username || undefined,
      level: row.level || undefined,
      highlight: row.highlight,
      image: row.imageUrl || undefined,
      imageAlt: metadataObject(row.metadata).imageAlt || row.title,
      summary: metadataObject(row.metadata).summary || undefined,
      seoKeywords: metadataObject(row.metadata).seoKeywords || [],
      readTimeMinutes: metadataObject(row.metadata).readTimeMinutes || undefined,
      sources: metadataObject(row.metadata).sources || [],
      game: row.game || undefined,
      publishedAt: row.publishedAt,
    }));

    return NextResponse.json([...staticRows, ...dbRows]);
  } catch (err) {
    logger.error({ err }, "Public honors GET failed");
    return NextResponse.json(staticRows, { status: 200 });
  }
}
