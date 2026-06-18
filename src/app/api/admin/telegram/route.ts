import { NextRequest, NextResponse } from "next/server";
import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  couponRedemptions,
  coupons,
  registrations,
  telegramAccounts,
  telegramCampaignEvents,
  telegramPreRegistrations,
  telegramReferrals,
  tournamentWaitlist,
  transactions,
} from "@/db/schema";
import { requireAdminPermission } from "@/lib/admin-permissions";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

function isAdminError(result: { user: unknown; error: string | null | undefined }) {
  return result.error || !result.user;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "overview");
    if (isAdminError(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const [preRegs] = await db.select({ value: count() }).from(telegramPreRegistrations);
    const [linked] = await db.select({ value: count() }).from(telegramAccounts);
    const [referrals] = await db.select({ value: count() }).from(telegramReferrals);
    const [waitlist] = await db.select({ value: count() }).from(tournamentWaitlist).where(eq(tournamentWaitlist.status, "waiting"));
    const [couponUses] = await db.select({ value: count() }).from(couponRedemptions).where(eq(couponRedemptions.status, "used"));

    const telegramRevenueRows = await db
      .select({ amount: transactions.amount })
      .from(transactions)
      .where(sql`${transactions.type} = 'entry_fee' AND ${transactions.status} = 'completed' AND ${transactions.metadata}->>'kind' = 'telegram_entry_fee'`);
    const revenueToman = telegramRevenueRows.reduce((sum, row) => sum + Number((BigInt(row.amount || "0") / BigInt(10)).toString()), 0);

    const campaignRows = await db
      .select({ campaign: telegramCampaignEvents.campaign, events: count() })
      .from(telegramCampaignEvents)
      .groupBy(telegramCampaignEvents.campaign)
      .orderBy(desc(count()))
      .limit(50);

    const couponRows = await db
      .select({ code: coupons.code, discountPercent: coupons.discountPercent, usedCount: coupons.usedCount, isActive: coupons.isActive })
      .from(coupons)
      .orderBy(desc(coupons.createdAt))
      .limit(50);

    const recentPreRegs = await db
      .select({
        telegramId: telegramPreRegistrations.telegramId,
        username: telegramPreRegistrations.telegramUsername,
        fullName: telegramPreRegistrations.fullName,
        phoneNumber: telegramPreRegistrations.phoneNumber,
        game: telegramPreRegistrations.game,
        status: telegramPreRegistrations.status,
        updatedAt: telegramPreRegistrations.updatedAt,
      })
      .from(telegramPreRegistrations)
      .orderBy(desc(telegramPreRegistrations.updatedAt))
      .limit(30);

    const recentTelegramRegistrations = await db
      .select({ value: count() })
      .from(registrations)
      .innerJoin(telegramAccounts, eq(registrations.visibleUserId, telegramAccounts.userId));

    return NextResponse.json({
      stats: {
        preRegistrations: preRegs.value,
        linkedAccounts: linked.value,
        referrals: referrals.value,
        waiting: waitlist.value,
        couponUses: couponUses.value,
        telegramRegistrations: recentTelegramRegistrations[0]?.value || 0,
        revenueToman,
      },
      campaigns: campaignRows,
      coupons: couponRows,
      recentPreRegistrations: recentPreRegs,
    });
  } catch (err) {
    logger.error({ err }, "Admin Telegram analytics failed");
    return NextResponse.json({ error: "Failed to load Telegram analytics" }, { status: 500 });
  }
}
