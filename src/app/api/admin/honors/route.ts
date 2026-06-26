import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { honorContentLikes, honorContentViews, honors } from "@/db/schema";
import { validateAdmin } from "@/lib/auth";
import { desc, eq, inArray, sql } from "drizzle-orm";
import logger from "@/lib/logger";
import { publishHonorToTelegramChannel } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set(["winner", "runner_up", "levelup", "rankup", "record", "fairplay", "team", "news", "event"]);
const ALLOWED_STATUS = new Set(["pending", "approved", "rejected"]);


async function engagementCounts(honorIds: string[]) {
  if (!honorIds.length) return new Map<string, { likes: number; views: number }>();
  try {
    const [viewRows, likeRows] = await Promise.all([
      db.select({ honorId: honorContentViews.contentId, count: sql<number>`count(*)::int` }).from(honorContentViews).where(inArray(honorContentViews.contentId, honorIds)).groupBy(honorContentViews.contentId),
      db.select({ honorId: honorContentLikes.contentId, count: sql<number>`count(*)::int` }).from(honorContentLikes).where(inArray(honorContentLikes.contentId, honorIds)).groupBy(honorContentLikes.contentId),
    ]);
    const map = new Map<string, { likes: number; views: number }>();
    for (const id of honorIds) map.set(id, { likes: 0, views: 0 });
    for (const row of viewRows) map.set(row.honorId, { ...(map.get(row.honorId) || { likes: 0, views: 0 }), views: Number(row.count || 0) });
    for (const row of likeRows) map.set(row.honorId, { ...(map.get(row.honorId) || { likes: 0, views: 0 }), likes: Number(row.count || 0) });
    return map;
  } catch (err) {
    logger.warn({ err }, "Admin honor engagement counts unavailable");
    return new Map<string, { likes: number; views: number }>();
  }
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

function iconForType(type: string) {
  if (type === "winner" || type === "runner_up" || type === "record") return "🏆";
  if (type === "levelup" || type === "rankup") return "⚡";
  if (type === "fairplay") return "🤝";
  if (type === "team") return "🛡️";
  if (type === "event") return "🎉";
  return "📰";
}

function normalizeText(value: unknown, max = 255) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeHonorBody(body: Record<string, unknown>) {
  const typeRaw = normalizeText(body.type || "news", 30);
  const type = ALLOWED_TYPES.has(typeRaw) ? typeRaw : "news";
  const statusRaw = normalizeText(body.status || "pending", 20);
  const status = ALLOWED_STATUS.has(statusRaw) ? statusRaw : "pending";
  const level = body.level === undefined || body.level === null || body.level === "" ? null : Number(body.level);

  return {
    type,
    title: normalizeText(body.title, 255),
    description: normalizeText(body.description, 5000),
    status,
    icon: normalizeText(body.icon || iconForType(type), 20),
    imageUrl: normalizeText(body.imageUrl || body.image, 1000) || null,
    prize: normalizeText(body.prize, 120) || null,
    username: normalizeText(body.username, 100) || null,
    level: Number.isFinite(level) ? Math.max(0, Math.round(Number(level))) : null,
    highlight: Boolean(body.highlight),
    game: normalizeText(body.game, 50) || null,
    source: normalizeText(body.source || "manual", 50) || "manual",
  };
}

export async function GET(request: NextRequest) {
  const auth = await validateAdmin(request);
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const rows = await db.select().from(honors).orderBy(desc(honors.createdAt)).limit(300);
    const counts = await engagementCounts(rows.map((row) => row.id));
    return NextResponse.json(rows.map((row) => ({
      ...row,
      image: row.imageUrl,
      time: relativeTime(row.publishedAt || row.createdAt),
      likesCount: counts.get(row.id)?.likes || 0,
      viewsCount: counts.get(row.id)?.views || 0,
    })));
  } catch (err) {
    logger.error({ err }, "Admin honors GET failed");
    return NextResponse.json({ error: "Failed to load honors. Run drizzle/manual/0008_add_honors.sql first." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await validateAdmin(request);
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json().catch(() => ({}));
    const data = normalizeHonorBody(body);
    if (!data.title || !data.description) return NextResponse.json({ error: "عنوان و توضیحات الزامی است" }, { status: 400 });

    const now = new Date();
    const [created] = await db
      .insert(honors)
      .values({
        ...data,
        createdById: auth.user.id,
        approvedById: data.status === "approved" ? auth.user.id : null,
        publishedAt: data.status === "approved" ? now : null,
        updatedAt: now,
      })
      .returning();

    if (created.status === "approved") {
      await publishHonorToTelegramChannel({
        id: created.id,
        title: created.title,
        description: created.description,
        type: created.type,
        game: created.game,
        imageUrl: created.imageUrl,
        highlight: created.highlight,
      }).catch((err) => logger.warn({ err, honorId: created.id }, "Failed to publish honor to Telegram"));
    }

    return NextResponse.json({ success: true, honor: { ...created, image: created.imageUrl } }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "Admin honors POST failed");
    return NextResponse.json({ error: "Honor create failed. Run drizzle/manual/0008_add_honors.sql first." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await validateAdmin(request);
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json().catch(() => ({}));
    const id = normalizeText(body.id, 80);
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const data = normalizeHonorBody(body);
    if (body.title !== undefined && !data.title) return NextResponse.json({ error: "عنوان الزامی است" }, { status: 400 });
    if (body.description !== undefined && !data.description) return NextResponse.json({ error: "توضیحات الزامی است" }, { status: 400 });

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ["type", "title", "description", "icon", "imageUrl", "prize", "username", "level", "highlight", "game", "source"] as const) {
      if (body[key] !== undefined || (key === "imageUrl" && body.image !== undefined)) patch[key] = data[key];
    }
    if (body.status !== undefined) {
      patch.status = data.status;
      if (data.status === "approved") {
        patch.approvedById = auth.user.id;
        patch.publishedAt = new Date();
      }
    }

    const [before] = await db.select({ status: honors.status }).from(honors).where(eq(honors.id, id)).limit(1);
    const [updated] = await db.update(honors).set(patch).where(eq(honors.id, id)).returning();
    if (!updated) return NextResponse.json({ error: "Honor not found" }, { status: 404 });
    if (updated.status === "approved" && before?.status !== "approved") {
      await publishHonorToTelegramChannel({
        id: updated.id,
        title: updated.title,
        description: updated.description,
        type: updated.type,
        game: updated.game,
        imageUrl: updated.imageUrl,
        highlight: updated.highlight,
      }).catch((err) => logger.warn({ err, honorId: updated.id }, "Failed to publish approved honor to Telegram"));
    }
    return NextResponse.json({ success: true, honor: { ...updated, image: updated.imageUrl } });
  } catch (err) {
    logger.error({ err }, "Admin honors PATCH failed");
    return NextResponse.json({ error: "Honor update failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await validateAdmin(request);
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json().catch(() => ({}));
    const id = normalizeText(body.id, 80);
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await db.delete(honors).where(eq(honors.id, id));
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Admin honors DELETE failed");
    return NextResponse.json({ error: "Honor delete failed" }, { status: 500 });
  }
}
