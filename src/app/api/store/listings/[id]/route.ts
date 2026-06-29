import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { storeListings, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

// GET: public detail of a single listing. Protected delivery notes are never
// included here — they are only revealed through the order endpoint post-purchase.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const [row] = await db
      .select({
        id: storeListings.id,
        source: storeListings.source,
        kind: storeListings.kind,
        game: storeListings.game,
        title: storeListings.title,
        description: storeListings.description,
        priceRial: storeListings.priceRial,
        currencyKind: storeListings.currencyKind,
        currencyAmount: storeListings.currencyAmount,
        stock: storeListings.stock,
        soldCount: storeListings.soldCount,
        images: storeListings.images,
        status: storeListings.status,
        createdAt: storeListings.createdAt,
        sellerId: storeListings.sellerId,
        sellerName: users.displayName,
        sellerVerified: users.isVerified,
      })
      .from(storeListings)
      .leftJoin(users, eq(users.id, storeListings.sellerId))
      .where(eq(storeListings.id, id))
      .limit(1);

    if (!row || row.status !== "active") {
      return NextResponse.json({ error: "آگهی یافت نشد یا غیرفعال است" }, { status: 404 });
    }

    return NextResponse.json({
      listing: { ...row, priceToman: Number(BigInt(row.priceRial) / BigInt(10)) },
    });
  } catch (err) {
    logger.error({ err }, "Store listing detail error");
    return NextResponse.json({ error: "خطا در دریافت محصول" }, { status: 500 });
  }
}
