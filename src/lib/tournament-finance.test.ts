import { describe, expect, it } from "vitest";
import { calculateDynamicTournamentPrizePool } from "./tournament-finance";

describe("calculateDynamicTournamentPrizePool", () => {
  it("calculates 20% site commission and 80% tiered distribution for paid tournaments", () => {
    // 10 players registered at 100,000 Toman each
    const result = calculateDynamicTournamentPrizePool({
      entryFee: "۱۰۰ هزار تومان",
      registeredCount: 10,
      maxPlayers: 16,
    });

    expect(result.isPaid).toBe(true);
    expect(result.entryFeeToman).toBe(100000);
    expect(result.totalCollectedToman).toBe(1000000); // 1,000,000
    expect(result.siteCommissionToman).toBe(200000); // 20% commission
    expect(result.netPrizePoolToman).toBe(800000); // 80% remaining

    expect(result.displayPrizePool).toBe("۸۰۰٬۰۰۰ تومان");
    expect(result.ladder[0].amountToman).toBe(280000); // 35% of 800k
    expect(result.ladder[1].amountToman).toBe(160000); // 20% of 800k
    expect(result.ladder[2].amountToman).toBe(96000); // 12% of 800k
    expect(result.ladder[3].amountToman).toBe(64000); // 8% of 800k
    expect(result.ladder[9].amountToman).toBe(24000); // 3% of 800k
  });

  it("handles 0 registered players by showing projection for max capacity", () => {
    const result = calculateDynamicTournamentPrizePool({
      entryFee: "50000",
      registeredCount: 0,
      maxPlayers: 20,
    });

    expect(result.totalCollectedToman).toBe(0);
    expect(result.netPrizePoolToman).toBe(0);
    expect(result.maxTotalCollectedToman).toBe(1000000); // 20 * 50,000
    expect(result.maxSiteCommissionToman).toBe(200000);
    expect(result.maxNetPrizePoolToman).toBe(800000);
    expect(result.displayPrizePool).toContain("۰ تومان");
  });

  it("ensures ladder weights sum up to exactly 100% (1.00)", () => {
    const result = calculateDynamicTournamentPrizePool({
      entryFee: "1000",
      registeredCount: 10,
    });
    const totalWeight = result.ladder.reduce((sum, item) => sum + item.weight, 0);
    expect(Math.round(totalWeight * 100)).toBe(100);
  });
});
