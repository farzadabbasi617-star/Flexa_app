import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { honors } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

function iconForType(type: string) {
  if (type === "winner" || type === "runner_up" || type === "record") return "🏆";
  if (type === "levelup" || type === "rankup") return "⚡";
  if (type === "fairplay") return "🤝";
  if (type === "team") return "🛡️";
  if (type === "event") return "🎉";
  return "📰";
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

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const [row] = await db
      .select()
      .from(honors)
      .where(and(eq(honors.id, id), eq(honors.status, "approved")))
      .limit(1);

    if (!row) return NextResponse.json({ error: "Honor not found" }, { status: 404 });

    return NextResponse.json({
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
      game: row.game || undefined,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
    });
  } catch (err) {
    logger.error({ err }, "Public honor detail GET failed");
    return NextResponse.json({ error: "Honor load failed" }, { status: 500 });
  }
}
