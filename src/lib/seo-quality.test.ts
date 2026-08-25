import { describe, expect, it } from "vitest";
import {
  isIndexableCodRoom,
  isIndexableHonor,
  isIndexablePlayerProfile,
  isIndexableStoreListing,
  isIndexableTeam,
  isIndexableTournament,
} from "./seo-quality";

describe("SEO quality gates", () => {
  it("keeps empty player profiles out of the index", () => {
    expect(isIndexablePlayerProfile({ wins: 0, losses: 0 })).toBe(false);
    expect(isIndexablePlayerProfile({ wins: 1, losses: 0 })).toBe(true);
    expect(isIndexablePlayerProfile({ wins: 0, losses: 0, isVerified: true, hasCodMobile: true })).toBe(true);
  });

  it("requires a real, non-cancelled tournament", () => {
    expect(isIndexableTournament({ status: "cancelled", name: "مسابقه تست", startDate: new Date() })).toBe(false);
    expect(isIndexableTournament({ status: "registration", name: "x" })).toBe(false);
    expect(isIndexableTournament({ status: "registration", name: "مسابقه واقعی", startDate: new Date() })).toBe(true);
  });

  it("does not index inactive, empty or out-of-stock listings", () => {
    expect(isIndexableStoreListing({ status: "active", title: "اکانت تست", stock: 0, description: "توضیح ".repeat(20) })).toBe(false);
    expect(isIndexableStoreListing({ status: "paused", title: "اکانت تست", stock: 1, description: "توضیح ".repeat(20) })).toBe(false);
    expect(isIndexableStoreListing({ status: "active", title: "اکانت تست", stock: 1, images: ["/image.jpg"] })).toBe(true);
  });

  it("requires a published COD room with useful public details", () => {
    expect(isIndexableCodRoom({ isPublished: false, status: "registration", title: "روم کالاف", startsAt: new Date(), description: "توضیح ".repeat(20) })).toBe(false);
    expect(isIndexableCodRoom({ isPublished: true, status: "registration", title: "روم کالاف", startsAt: new Date(), description: "توضیح ".repeat(20) })).toBe(true);
  });

  it("only indexes teams with real membership or a substantive description", () => {
    expect(isIndexableTeam({ name: "تیم", memberCount: 1 })).toBe(false);
    expect(isIndexableTeam({ name: "تیم حرفه‌ای", memberCount: 2 })).toBe(true);
    expect(isIndexableTeam({ name: "تیم حرفه‌ای", memberCount: 1, description: "توضیح معتبر تیم ".repeat(4) })).toBe(true);
  });

  it("excludes drafts, thin honors and expired automated news", () => {
    const rich = "متن معتبر و قابل استفاده برای خواننده ".repeat(8);
    expect(isIndexableHonor({ status: "pending", title: "عنوان خبر معتبر", description: rich })).toBe(false);
    expect(isIndexableHonor({ status: "approved", title: "کوتاه", description: rich })).toBe(false);
    expect(isIndexableHonor({ status: "approved", title: "عنوان افتخار معتبر", description: rich, source: "manual" })).toBe(true);
    expect(isIndexableHonor({ status: "approved", title: "عنوان خبر خودکار", description: rich, source: "ai_news", publishedAt: new Date(Date.now() - 8 * 86_400_000) })).toBe(false);
  });
});
