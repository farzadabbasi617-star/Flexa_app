import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getCorrectedCaption,
  getHonorForPublish,
  markReviewStatus,
  publishNewsToChannelTargets,
  saveCorrectedCaptionForHonor,
} from "@/lib/news-review";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Internal review endpoint used by the Add_members bot (@NewAdd_members_bot),
 * which is the only administrator of @Flexa_games. When the owner presses a
 * review button (or replies with a corrected caption) in the Add_members bot,
 * that bot calls this endpoint to carry out the actual action against the site
 * DB and to publish to the channel via the review bot token.
 *
 * Authorized by GAMING_NEWS_REVIEW_SECRET (fallback TELEGRAM_CRON_SECRET).
 */
function isAuthorized(request: NextRequest) {
  const valid = (process.env.GAMING_NEWS_REVIEW_SECRET || process.env.TELEGRAM_CRON_SECRET || "").trim();
  if (!valid) return process.env.NODE_ENV !== "production";
  const provided = [
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "",
    request.nextUrl.searchParams.get("secret") || "",
  ].filter(Boolean);
  if (!provided.length) return false;
  const left = Buffer.from(provided[0]);
  const right = Buffer.from(valid);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
  const honorId = String(body.honorId || "");
  if (!honorId) return NextResponse.json({ error: "missing_honor_id" }, { status: 400 });

  try {
    if (action === "approve") {
      const honor = await getHonorForPublish(honorId);
      if (!honor) return NextResponse.json({ ok: false, error: "honor_not_found" }, { status: 404 });

      const corrected = await getCorrectedCaption(honorId);
      const result = await publishNewsToChannelTargets(
        { id: honor.id, title: honor.title, description: honor.description, game: honor.game, imageUrl: honor.imageUrl },
        corrected,
      );
      if (result.sent > 0) await markReviewStatus(honorId, "approved");
      return NextResponse.json({ ok: true, action, published: result.sent > 0, ...result });
    }

    if (action === "reject") {
      await markReviewStatus(honorId, "rejected");
      return NextResponse.json({ ok: true, action, status: "rejected" });
    }

    if (action === "correct") {
      const text = String(body.text || "").trim();
      if (!text) return NextResponse.json({ ok: false, error: "missing_text" }, { status: 400 });
      await saveCorrectedCaptionForHonor(honorId, text);
      return NextResponse.json({ ok: true, action, saved: true });
    }

    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (err) {
    logger.error({ err, action, honorId }, "News review endpoint failed");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
