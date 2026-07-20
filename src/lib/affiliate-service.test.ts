import { describe, expect, it } from "vitest";
import { AFFILIATE_COMMISSION_RIAL, PERSONAL_REFERRAL_MINIMUM_PAYOUT_RIAL, affiliateAttributionExpiresAt, allocateAffiliateCommission, normalizeAffiliateCode, normalizeIranSheba } from "./affiliate-service";
import { MEDIA_PARTNER_CONTRACT_HASH, MEDIA_PARTNER_CONTRACT_TEXT } from "./media-partner-contract";
import { PERSONAL_REFERRAL_CONTRACT_HASH, PERSONAL_REFERRAL_CONTRACT_TEXT } from "./personal-referral-contract";
import crypto from "crypto";

describe("affiliate financial policy", () => {
  it("allocates the full 7,000-Toman pool to one partner even when both users belong to it", () => {
    const rows = allocateAffiliateCommission([
      { userId: "u1", partnerId: "p1" },
      { userId: "u2", partnerId: "p1" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].amountRial).toBe(AFFILIATE_COMMISSION_RIAL);
  });

  it("splits one Match pool between two different partners without increasing the total", () => {
    const rows = allocateAffiliateCommission([
      { userId: "u1", partnerId: "p1" },
      { userId: "u2", partnerId: "p2" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.amountRial)).toEqual([BigInt(35_000), BigInt(35_000)]);
    expect(rows.reduce((sum, row) => sum + row.amountRial, BigInt(0))).toBe(BigInt(70_000));
  });

  it("does not allocate a commission without an attributed player", () => {
    expect(allocateAffiliateCommission([])).toEqual([]);
  });

  it("uses a non-renewing 30-day server-side attribution deadline", () => {
    const start = new Date("2026-07-19T10:00:00Z");
    expect(affiliateAttributionExpiresAt(start).toISOString()).toBe("2026-08-18T10:00:00.000Z");
  });

  it("normalizes public codes and validates Iranian IBAN format", () => {
    expect(normalizeAffiliateCode(" mp-a_12 ")).toBe("MPA12");
    expect(normalizeIranSheba("IR82 0540 1026 8002 0817 9090 02")).toBe("IR820540102680020817909002");
    expect(normalizeIranSheba("123")).toBeNull();
  });

  it("keeps the stored contract hash tied to the exact immutable snapshot", () => {
    expect(crypto.createHash("sha256").update(MEDIA_PARTNER_CONTRACT_TEXT).digest("hex")).toBe(MEDIA_PARTNER_CONTRACT_HASH);
    expect(crypto.createHash("sha256").update(PERSONAL_REFERRAL_CONTRACT_TEXT).digest("hex")).toBe(PERSONAL_REFERRAL_CONTRACT_HASH);
  });

  it("uses the approved 200,000-Toman personal cash-out minimum", () => {
    expect(PERSONAL_REFERRAL_MINIMUM_PAYOUT_RIAL).toBe(BigInt(2_000_000));
  });
});
