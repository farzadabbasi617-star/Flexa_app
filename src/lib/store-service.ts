import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  storeListings,
  storeOrders,
  wallets,
  transactions,
  kycProfiles,
} from "@/db/schema";
import { bigIntFromText } from "@/lib/money";
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

export function computeFee(totalRial: bigint, source: "official" | "user") {
  if (source === "official") {
    return { platformFeeRial: BigInt(0), sellerPayoutRial: BigInt(0) };
  }
  const platformFeeRial = (totalRial * BigInt(PLATFORM_FEE_BPS)) / BigInt(10000);
  const sellerPayoutRial = totalRial - platformFeeRial;
  return { platformFeeRial, sellerPayoutRial };
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
    const { platformFeeRial, sellerPayoutRial } = computeFee(totalPriceRial, source);

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
  return updated;
}
