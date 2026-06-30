import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  storeListings,
  storeOrders,
  wallets,
  transactions,
  kycProfiles,
  notifications,
} from "@/db/schema";
import { bigIntFromText } from "@/lib/money";
import { getSellerStats } from "@/lib/seller-reputation";
import logger from "@/lib/logger";

/**
 * Platform commission taken from user (P2P) sales, in basis points.
 * 500 = 5%. Official listings have no commission (platform is the seller).
 */
export const PLATFORM_FEE_BPS = Number(process.env.STORE_FEE_BPS || "500");

export class StoreError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function computeFee(totalRial: bigint, source: "official" | "user", feeBps: number = PLATFORM_FEE_BPS) {
  if (source === "official") {
    return { platformFeeRial: BigInt(0), sellerPayoutRial: BigInt(0) };
  }
  const bps = Number.isFinite(feeBps) && feeBps >= 0 ? Math.floor(feeBps) : PLATFORM_FEE_BPS;
  const platformFeeRial = (totalRial * BigInt(bps)) / BigInt(10000);
  const sellerPayoutRial = totalRial - platformFeeRial;
  return { platformFeeRial, sellerPayoutRial };
}

/** Fire-and-forget order notification (never blocks the financial flow). */
async function notify(userId: string | null | undefined, title: string, message: string, orderId: string) {
  if (!userId) return;
  try {
    await db.insert(notifications).values({
      userId,
      type: "store_order",
      title,
      message,
      link: `/store/orders`,
    });
  } catch (err) {
    logger.warn({ err, userId, orderId }, "Failed to create store notification");
  }
}

/** Whether a user is allowed to create marketplace listings (KYC verified). */
export async function canUserSell(userId: string): Promise<boolean> {
  const [kyc] = await db
    .select({ status: kycProfiles.status })
    .from(kycProfiles)
    .where(eq(kycProfiles.userId, userId))
    .limit(1);
  return kyc?.status === "verified";
}

// The drizzle transaction handle has the same query API as `db` for our needs.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function getOrCreateWalletTx(tx: Tx, userId: string) {
  const [existing] = await tx
    .select()
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .limit(1);
  if (existing) return existing;
  const [created] = await tx
    .insert(wallets)
    .values({ userId, balance: "0", currency: "RIAL" })
    .returning();
  return created;
}

/**
 * Create an order and atomically move the buyer's funds into escrow.
 *
 * Flow:
 *  1. Lock the listing row, validate availability and stock.
 *  2. Lock the buyer's wallet, ensure sufficient balance.
 *  3. Debit buyer wallet, record a `store_escrow_hold` transaction (held by platform).
 *  4. Decrement stock and create the order in `paid_escrow` state.
 *
 * Funds are NOT credited to the seller here — that happens on confirmation.
 */
export async function createEscrowOrder(params: {
  buyerId: string;
  listingId: string;
  quantity: number;
  buyerNote?: string;
}) {
  const { buyerId, listingId, quantity, buyerNote } = params;

  return db.transaction(async (tx) => {
    // Lock listing to prevent overselling under concurrency.
    const [listing] = await tx
      .select()
      .from(storeListings)
      .where(eq(storeListings.id, listingId))
      .for("update")
      .limit(1);

    if (!listing) throw new StoreError("آگهی یافت نشد", 404);
    if (listing.status !== "active") throw new StoreError("این آگهی در حال حاضر فعال نیست", 409);
    if (listing.sellerId && listing.sellerId === buyerId) {
      throw new StoreError("نمی‌توانید کالای خودتان را بخرید", 409);
    }
    if (listing.stock < quantity) throw new StoreError("موجودی کافی نیست", 409);

    const unitPriceRial = bigIntFromText(listing.priceRial);
    const totalPriceRial = unitPriceRial * BigInt(quantity);
    if (totalPriceRial <= BigInt(0)) throw new StoreError("قیمت نامعتبر است", 400);

    const source = listing.source as "official" | "user";
    // Tiered commission: a higher-reputation seller pays a lower platform fee.
    let feeBps = PLATFORM_FEE_BPS;
    if (source === "user" && listing.sellerId) {
      try {
        const stats = await getSellerStats(listing.sellerId);
        feeBps = stats.feeBps;
      } catch {
        // keep default fee on any failure
      }
    }
    const { platformFeeRial, sellerPayoutRial } = computeFee(totalPriceRial, source, feeBps);

    // Lock & debit buyer wallet.
    const buyerWallet = await getOrCreateWalletTx(tx, buyerId);
    const [lockedWallet] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.id, buyerWallet.id))
      .for("update")
      .limit(1);

    const balance = bigIntFromText(lockedWallet.balance);
    if (balance < totalPriceRial) {
      throw new StoreError("موجودی کیف پول کافی نیست. لطفاً ابتدا شارژ کنید.", 402);
    }

    await tx
      .update(wallets)
      .set({ balance: (balance - totalPriceRial).toString(), updatedAt: new Date() })
      .where(eq(wallets.id, buyerWallet.id));

    // Record the escrow hold (debit) on the buyer's ledger.
    const [holdTx] = await tx
      .insert(transactions)
      .values({
        walletId: buyerWallet.id,
        amount: totalPriceRial.toString(),
        type: "store_escrow_hold",
        status: "completed",
        metadata: { listingId, quantity, source, role: "buyer", withdrawable: false },
      })
      .returning();

    // Decrement stock; mark sold_out if depleted.
    const newStock = listing.stock - quantity;
    await tx
      .update(storeListings)
      .set({
        stock: newStock,
        soldCount: listing.soldCount + quantity,
        status: newStock <= 0 ? "sold_out" : listing.status,
        updatedAt: new Date(),
      })
      .where(eq(storeListings.id, listingId));

    const [order] = await tx
      .insert(storeOrders)
      .values({
        listingId,
        buyerId,
        sellerId: listing.sellerId ?? null,
        source,
        quantity,
        unitPriceRial: unitPriceRial.toString(),
        totalPriceRial: totalPriceRial.toString(),
        platformFeeRial: platformFeeRial.toString(),
        sellerPayoutRial: sellerPayoutRial.toString(),
        status: "paid_escrow",
        holdTxId: holdTx.id,
        buyerNote: buyerNote ?? null,
      })
      .returning();

    logger.info({ orderId: order.id, buyerId, listingId, totalPriceRial: totalPriceRial.toString() }, "Store escrow order created");

    // Notify outside the financial mutations but still within tx scope is fine
    // here because notifications are best-effort and wrapped in try/catch.
    await notify(buyerId, "سفارش ثبت شد", `سفارش «${listing.title}» ثبت و مبلغ به‌صورت امانی نگه داشته شد.`, order.id);
    if (listing.sellerId) {
      await notify(listing.sellerId, "سفارش جدید", `کالای «${listing.title}» شما خریداری شد. لطفاً تحویل دهید.`, order.id);
    }
    return order;
  });
}

/** Seller (or platform) marks the order as delivered. */
export async function markDelivered(orderId: string, actorId: string, isAdmin = false) {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(storeOrders)
      .where(eq(storeOrders.id, orderId))
      .for("update")
      .limit(1);
    if (!order) throw new StoreError("سفارش یافت نشد", 404);

    const isSeller = order.sellerId && order.sellerId === actorId;
    const isOfficial = order.source === "official";
    if (!isAdmin && !isSeller && !(isOfficial && isAdmin)) {
      throw new StoreError("شما اجازه این عمل را ندارید", 403);
    }
    if (order.status !== "paid_escrow") {
      throw new StoreError("این سفارش در وضعیت قابل تحویل نیست", 409);
    }

    const [updated] = await tx
      .update(storeOrders)
      .set({ status: "delivered", deliveredAt: new Date(), updatedAt: new Date() })
      .where(eq(storeOrders.id, orderId))
      .returning();

    await notify(order.buyerId, "کالا تحویل داده شد", "فروشنده کالا را تحویل داد. لطفاً پس از بررسی، دریافت را تأیید کنید.", orderId);
    return updated;
  });
}

/**
 * Buyer confirms receipt. Releases escrow:
 *  - user (P2P): credit seller payout (minus platform fee).
 *  - official: funds simply settle to the platform (no seller credit).
 */
export async function confirmAndRelease(orderId: string, buyerId: string) {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(storeOrders)
      .where(eq(storeOrders.id, orderId))
      .for("update")
      .limit(1);
    if (!order) throw new StoreError("سفارش یافت نشد", 404);
    if (order.buyerId !== buyerId) throw new StoreError("شما اجازه این عمل را ندارید", 403);
    if (!["paid_escrow", "delivered"].includes(order.status)) {
      throw new StoreError("این سفارش قابل تأیید نیست", 409);
    }

    let releaseTxId: string | null = null;

    if (order.source === "user" && order.sellerId) {
      const payout = bigIntFromText(order.sellerPayoutRial);
      const sellerWallet = await getOrCreateWalletTx(tx, order.sellerId);
      const [lockedSeller] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.id, sellerWallet.id))
        .for("update")
        .limit(1);

      await tx
        .update(wallets)
        .set({
          balance: (bigIntFromText(lockedSeller.balance) + payout).toString(),
          updatedAt: new Date(),
        })
        .where(eq(wallets.id, sellerWallet.id));

      const [releaseTx] = await tx
        .insert(transactions)
        .values({
          walletId: sellerWallet.id,
          amount: payout.toString(),
          type: "store_payout",
          status: "completed",
          metadata: {
            orderId: order.id,
            role: "seller",
            platformFeeRial: order.platformFeeRial,
            withdrawable: true,
          },
        })
        .returning();
      releaseTxId = releaseTx.id;
    }

    const [updated] = await tx
      .update(storeOrders)
      .set({
        status: "completed",
        completedAt: new Date(),
        releaseTxId,
        updatedAt: new Date(),
      })
      .where(eq(storeOrders.id, orderId))
      .returning();

    logger.info({ orderId, releaseTxId }, "Store order completed & escrow released");

    await notify(order.buyerId, "سفارش تکمیل شد", "خرید شما با موفقیت تکمیل شد. از خرید شما متشکریم!", orderId);
    if (order.source === "user" && order.sellerId) {
      await notify(order.sellerId, "پرداخت آزاد شد", "خریدار دریافت را تأیید کرد و مبلغ به کیف پول شما واریز شد.", orderId);
    }
    return updated;
  });
}

/**
 * Refund the buyer (admin resolution of a dispute, or cancel).
 * Returns held funds to the buyer wallet and restocks the listing.
 */
export async function refundOrder(orderId: string, actorId: string, reason?: string) {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(storeOrders)
      .where(eq(storeOrders.id, orderId))
      .for("update")
      .limit(1);
    if (!order) throw new StoreError("سفارش یافت نشد", 404);
    if (!["paid_escrow", "delivered", "disputed"].includes(order.status)) {
      throw new StoreError("این سفارش قابل بازپرداخت نیست", 409);
    }

    const total = bigIntFromText(order.totalPriceRial);
    const buyerWallet = await getOrCreateWalletTx(tx, order.buyerId);
    const [lockedBuyer] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.id, buyerWallet.id))
      .for("update")
      .limit(1);

    await tx
      .update(wallets)
      .set({
        balance: (bigIntFromText(lockedBuyer.balance) + total).toString(),
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, buyerWallet.id));

    const [refundTx] = await tx
      .insert(transactions)
      .values({
        walletId: buyerWallet.id,
        amount: total.toString(),
        type: "refund",
        status: "completed",
        metadata: { orderId: order.id, role: "buyer", reason: reason ?? null, withdrawable: false },
      })
      .returning();

    // Restock the listing.
    await tx
      .update(storeListings)
      .set({
        stock: sql`${storeListings.stock} + ${order.quantity}`,
        soldCount: sql`GREATEST(${storeListings.soldCount} - ${order.quantity}, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(storeListings.id, order.listingId));

    const [updated] = await tx
      .update(storeOrders)
      .set({
        status: "refunded",
        refundTxId: refundTx.id,
        disputeReason: reason ?? order.disputeReason,
        updatedAt: new Date(),
      })
      .where(eq(storeOrders.id, orderId))
      .returning();

    logger.info({ orderId, actorId, reason }, "Store order refunded");

    await notify(order.buyerId, "سفارش بازپرداخت شد", "مبلغ سفارش به کیف پول شما بازگردانده شد.", orderId);
    if (order.sellerId) {
      await notify(order.sellerId, "سفارش بازپرداخت شد", "سفارش مربوط به کالای شما بازپرداخت شد.", orderId);
    }
    return updated;
  });
}

/** Buyer or seller opens a dispute (funds stay in escrow until admin resolves). */
export async function openDispute(orderId: string, actorId: string, reason: string) {
  const [order] = await db
    .select()
    .from(storeOrders)
    .where(eq(storeOrders.id, orderId))
    .limit(1);
  if (!order) throw new StoreError("سفارش یافت نشد", 404);
  if (order.buyerId !== actorId && order.sellerId !== actorId) {
    throw new StoreError("شما اجازه این عمل را ندارید", 403);
  }
  if (!["paid_escrow", "delivered"].includes(order.status)) {
    throw new StoreError("این سفارش قابل اعتراض نیست", 409);
  }
  const [updated] = await db
    .update(storeOrders)
    .set({ status: "disputed", disputeReason: reason, updatedAt: new Date() })
    .where(eq(storeOrders.id, orderId))
    .returning();

  // Notify the other party that a dispute was opened.
  const otherParty = order.buyerId === actorId ? order.sellerId : order.buyerId;
  await notify(otherParty, "اعتراض ثبت شد", "برای یکی از سفارش‌ها اعتراض ثبت شد و در حال بررسی توسط تیم گیمنت است.", orderId);
  return updated;
}
