import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { priceEstimatorRates } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  ESTIMATOR_FIELDS,
  computeEstimate,
  isEstimatorGame,
  type EstimatorGame,
} from "@/lib/price-estimator";
import { bigIntFromText } from "@/lib/money";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

// Resolve effective unit prices (admin overrides on top of defaults).
async function resolveUnitPrices(game: EstimatorGame): Promise<Record<string, bigint>> {
  const map: Record<string, bigint> = {};
  for (const f of ESTIMATOR_FIELDS[game]) map[f.key] = BigInt(f.defaultUnitRial);
  try {
    const rows = await db
      .select({ fieldKey: priceEstimatorRates.fieldKey, unitPriceRial: priceEstimatorRates.unitPriceRial })
      .from(priceEstimatorRates)
      .where(eq(priceEstimatorRates.game, game));
    for (const r of rows) map[r.fieldKey] = bigIntFromText(r.unitPriceRial);
  } catch (err) {
    logger.warn({ err, game }, "price estimator rates load failed; using defaults");
  }
  return map;
}

// GET: field definitions + current unit prices (toman) for a game.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const game = searchParams.get("game") || "";
  if (!isEstimatorGame(game)) {
    return NextResponse.json({ error: "بازی نامعتبر است" }, { status: 400 });
  }
  const unit = await resolveUnitPrices(game);
  const fields = ESTIMATOR_FIELDS[game].map((f) => ({
    key: f.key,
    label: f.label,
    min: f.min,
    hint: f.hint ?? null,
    unitToman: Number(unit[f.key] / BigInt(10)),
  }));
  return NextResponse.json({ game, fields });
}

// POST: compute an estimate. Body: { game, values: { fieldKey: count } }
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limit = await rateLimit(`price-estimate:${ip}`, 60, 60 * 1000);
    if (!limit.success) {
      return NextResponse.json({ error: "تعداد درخواست‌ها زیاد است." }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const game = String(body.game || "");
    if (!isEstimatorGame(game)) {
      return NextResponse.json({ error: "بازی نامعتبر است" }, { status: 400 });
    }

    const rawValues = (body.values && typeof body.values === "object") ? body.values : {};
    const values: Record<string, number> = {};
    for (const f of ESTIMATOR_FIELDS[game]) {
      const n = Number(rawValues[f.key]);
      values[f.key] = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 100_000_000) : 0;
    }

    const unit = await resolveUnitPrices(game);
    const totalRial = computeEstimate(game, values, unit);

    return NextResponse.json({
      game,
      priceRial: totalRial.toString(),
      priceToman: Number(totalRial / BigInt(10)),
    });
  } catch (err) {
    logger.error({ err }, "Price estimate error");
    return NextResponse.json({ error: "خطا در محاسبه قیمت" }, { status: 500 });
  }
}
