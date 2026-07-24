import { describe, it, expect } from "vitest";
import {
  calculateAgeYears,
  checkAgeGate,
  isEligibleForPaidActions,
  parseBirthDate,
} from "./age-gate";

const FIXED_NOW = new Date("2026-07-08T12:00:00Z");

describe("parseBirthDate", () => {
  it("parses YYYY-MM-DD", () => {
    const d = parseBirthDate("2005-03-14");
    expect(d?.toISOString()).toBe("2005-03-14T00:00:00.000Z");
  });

  it("accepts YYYY/M/D loose form", () => {
    const d = parseBirthDate("2005/3/4");
    expect(d?.toISOString()).toBe("2005-03-04T00:00:00.000Z");
  });

  it("rejects gibberish", () => {
    expect(parseBirthDate("hello")).toBeNull();
    expect(parseBirthDate("")).toBeNull();
    expect(parseBirthDate(null)).toBeNull();
    expect(parseBirthDate(undefined)).toBeNull();
  });

  it("rejects impossible calendar dates (Feb 30)", () => {
    expect(parseBirthDate("2005-02-30")).toBeNull();
  });

  it("rejects out-of-range years", () => {
    expect(parseBirthDate("1800-01-01")).toBeNull();
    expect(parseBirthDate("2999-01-01")).toBeNull();
  });

  it("rejects future dates", () => {
    const future = new Date();
    future.setUTCFullYear(future.getUTCFullYear() + 1);
    const iso = future.toISOString().slice(0, 10);
    expect(parseBirthDate(iso)).toBeNull();
  });
});

describe("calculateAgeYears", () => {
  it("returns full years elapsed", () => {
    // Born 2000-01-01, now 2026-07-08 → 26
    expect(calculateAgeYears(new Date(Date.UTC(2000, 0, 1)), FIXED_NOW)).toBe(26);
  });

  it("does not increment until the birthday has passed this year", () => {
    // Born July 9 2000 — one day after the fixed now (July 8 2026) → still 25
    expect(calculateAgeYears(new Date(Date.UTC(2000, 6, 9)), FIXED_NOW)).toBe(25);
    // Born July 8 2000 — birthday today → 26
    expect(calculateAgeYears(new Date(Date.UTC(2000, 6, 8)), FIXED_NOW)).toBe(26);
    // Born July 7 2000 — birthday yesterday → 26
    expect(calculateAgeYears(new Date(Date.UTC(2000, 6, 7)), FIXED_NOW)).toBe(26);
  });
});

describe("checkAgeGate", () => {
  const validNid = "0018765412"; // real Iranian NID with correct checksum (schema validates elsewhere)

  it("blocks with MISSING_NATIONAL_ID when no national ID is on file", () => {
    const r = checkAgeGate({ birthDate: "2000-01-01", nationalId: null }, FIXED_NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MISSING_NATIONAL_ID");
  });

  it("blocks with MISSING_BIRTH_DATE when NID present but no birth date", () => {
    const r = checkAgeGate({ birthDate: null, nationalId: validNid }, FIXED_NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MISSING_BIRTH_DATE");
  });

  it("blocks with INVALID_BIRTH_DATE for malformed birth date", () => {
    const r = checkAgeGate({ birthDate: "not-a-date", nationalId: validNid }, FIXED_NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_BIRTH_DATE");
  });

  it("allows under-18 users when identity fields are complete", () => {
    // Born 2010-01-01, now 2026-07-08 → 16. Age is informational only.
    const r = checkAgeGate({ birthDate: "2010-01-01", nationalId: validNid }, FIXED_NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ageYears).toBe(16);
  });

  it("allows exactly-18 users", () => {
    // Born 2008-07-08, now 2026-07-08 → exactly 18 today
    const r = checkAgeGate({ birthDate: "2008-07-08", nationalId: validNid }, FIXED_NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ageYears).toBe(18);
  });

  it("allows one-day-shy-of-18 when identity fields are complete", () => {
    // Born 2008-07-09, now 2026-07-08 → 17 (birthday tomorrow)
    const r = checkAgeGate({ birthDate: "2008-07-09", nationalId: validNid }, FIXED_NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ageYears).toBe(17);
  });

  it("allows well-over-18 users", () => {
    const r = checkAgeGate({ birthDate: "1990-05-20", nationalId: validNid }, FIXED_NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ageYears).toBe(36);
  });
});

describe("isEligibleForPaidActions", () => {
  it("mirrors checkAgeGate.ok", () => {
    expect(
      isEligibleForPaidActions({ birthDate: "1990-01-01", nationalId: "0018765412" })
    ).toBe(true);
    expect(
      isEligibleForPaidActions({ birthDate: "2020-01-01", nationalId: "0018765412" })
    ).toBe(true);
    expect(isEligibleForPaidActions({ birthDate: null, nationalId: null })).toBe(false);
  });
});
