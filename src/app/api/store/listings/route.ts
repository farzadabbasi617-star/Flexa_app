import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { storeListings, users } from "@/db/schema";
import { and, asc, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { StoreListingCreateSchema } from "@/lib/validations";
import { canUserSell } from "@/lib/store-service";
import { parseTomanToRial } from "@/lib/money";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";
import { safePagination } from "@/lib/pagination";

export const dynamic = "force-dynamic";

// GET: public catalogue of active listings, with optional filters.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const kind = searchParams.get("kind");
    const currencyKind = searchParams.get("currencyKind"); // gem | cp | uc | vbucks | ...
    const game = searchParams.get("game");
    const source = searchParams.get("source"); // official | user
    const q = (searchParams.get("q") || "").trim().slice(0, 80);
    const sort = searchParams.get("sort") || "newest"; // newest | cheapest | expensive | bestselling
    const minToman = Number(searchParams.get("minToman") || "");
    const maxToman = Number(searchParams.get("maxToman") || "");
    const { page, limit: pageSize, offset } = safePagination({
      page: searchParams.get("page"),
      limit: searchParams.get("pageSize"),
      defaultLimit: 24,
      maxLimit: 48,
    });

    const conditions = [eq(storeListings.status, "active")];
    if (kind) conditions.push(eq(storeListings.kind, kind as never));
    if (currencyKind) {
      // Currency-kind filter implies currency items.
      conditions.push(eq(storeListings.kind, "currency"));
      conditions.push(eq(storeListings.currencyKind, currencyKind));
    }
    if (game) conditions.push(eq(storeListings.game, game as never));
    if (source === "official" || source === "user") {
      conditions.push(eq(storeListings.source, source));
    }
    if (q) {
      conditions.push(ilike(storeListings.title, `%${q}%`));
    }
    // Price range filter (Toman -> Rial).
    if (Number.isFinite(minToman) && minToman > 0) {
      conditions.push(gte(storeListings.priceRial, String(BigInt(Math.floor(minToman)) * BigInt(10))));
    }
    if (Number.isFinite(maxToman) && maxToman > 0) {
      conditions.push(lte(storeListings.priceRial, String(BigInt(Math.floor(maxToman)) * BigInt(10))));
    }

    const orderBy =
      sort === "cheapest"
        ? asc(storeListings.priceRial)
        : sort === "expensive"
          ? desc(storeListings.priceRial)
          : sort === "bestselling"
            ? desc(storeListings.soldCount)
            : desc(storeListings.createdAt);

    const rows = await db
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
        warrantyDays: storeListings.warrantyDays,
        images: storeListings.images,
        createdAt: storeListings.createdAt,
        sellerId: storeListings.sellerId,
        sellerName: users.displayName,
      })
      .from(storeListings)
      .leftJoin(users, eq(users.id, storeListings.sellerId))
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(pageSize)
      .offset(offset);

    // Never leak protected delivery notes on the public list.
    const items = rows.map((r) => ({
      ...r,
      priceToman: Number(BigInt(r.priceRial) / BigInt(10)),
    }));

    return NextResponse.json({ items, page, pageSize });
  } catch (err) {
    logger.error({ err }, "Store listings GET error");
    return NextResponse.json({ error: "خطا در دریافت محصولات" }, { status: 500 });
  }
}

// POST: a KYC-verified user creates a marketplace listing (goes to review).
export async function POST(request: NextRequest) {
  try {
    const { user, error, status } = await requireUser(request);
    if (!user) return NextResponse.json({ error }, { status });

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limit = await rateLimit(`store:listing:create:${user.id}:${ip}`, 20, 60 * 60 * 1000);
    if (!limit.success) {
      return NextResponse.json({ error: "تعداد آگهی‌های ثبت‌شده زیاد است." }, { status: 429 });
    }

    if (!(await canUserSell(user.id))) {
      return NextResponse.json(
        { error: "برای فروش باید ابتدا احراز هویت شما تأیید شود.", needKyc: true },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = StoreListingCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "اطلاعات نامعتبر" }, { status: 400 });
    }
    const d = parsed.data;
    const priceRial = parseTomanToRial(String(d.priceToman));
    if (priceRial <= BigInt(0)) {
      return NextResponse.json({ error: "قیمت نامعتبر است" }, { status: 400 });
    }

    const [created] = await db
      .insert(storeListings)
      .values({
        source: "user",
        sellerId: user.id,
        kind: d.kind,
        game: d.game ?? null,
        title: d.title,
        description: d.description ?? null,
        priceRial: priceRial.toString(),
        currencyKind: d.currencyKind ?? null,
        currencyAmount: d.currencyAmount ?? null,
        stock: d.stock,
        images: d.images,
        deliveryNotes: d.deliveryNotes ?? null,
        warrantyDays: d.warrantyDays ?? 0,
        status: "pending_review",
      })
      .returning({ id: storeListings.id, status: storeListings.status });

    return NextResponse.json({ listing: created }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "Store listing POST error");
    return NextResponse.json({ error: "خطا در ثبت آگهی" }, { status: 500 });
  }
}
