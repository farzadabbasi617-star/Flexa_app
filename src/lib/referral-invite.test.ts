import { afterEach, describe, expect, it } from "vitest";
import {
  isValidInviteCode,
  normalizeInviteCode,
  referralShareMessage,
  referralWebLink,
  shareTargetUrl,
} from "./referral-invite";

const originalAppUrl = process.env.APP_URL;
afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = originalAppUrl;
});

describe("normalizeInviteCode", () => {
  it("upper-cases and strips punctuation so a pasted link still resolves", () => {
    expect(normalizeInviteCode(" flx-ab12cd ")).toBe("FLXAB12CD");
  });

  it("caps the length instead of trusting the caller", () => {
    expect(normalizeInviteCode("A".repeat(80))).toHaveLength(24);
  });

  it("returns an empty string for junk", () => {
    expect(normalizeInviteCode("!!!")).toBe("");
    expect(normalizeInviteCode(null)).toBe("");
  });
});

describe("isValidInviteCode", () => {
  it("rejects codes that are too short to be real", () => {
    expect(isValidInviteCode("AB12")).toBe(false);
    expect(isValidInviteCode("ABC123")).toBe(true);
  });
});

describe("referralWebLink", () => {
  it("builds a link that works outside Telegram", () => {
    process.env.APP_URL = "https://www.gament1.ir";
    expect(referralWebLink("abc123")).toBe("https://www.gament1.ir/r/ABC123");
  });

  it("never emits a trailing double slash", () => {
    expect(referralWebLink("abc123", "https://www.gament1.ir/")).toBe("https://www.gament1.ir/r/ABC123");
  });

  it("returns empty for an unusable code rather than a broken link", () => {
    expect(referralWebLink("")).toBe("");
  });
});

describe("referralShareMessage", () => {
  it("includes the link so a pasted message is self-contained", () => {
    process.env.APP_URL = "https://www.gament1.ir";
    const message = referralShareMessage({ referralCode: "ABC123" });
    expect(message).toContain("https://www.gament1.ir/r/ABC123");
    expect(message).toContain("گیمنت");
  });
});

describe("shareTargetUrl", () => {
  it("encodes the message for WhatsApp", () => {
    const url = shareTargetUrl("whatsapp", "سلام دنیا", "https://x.test/r/A");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(url).toContain(encodeURIComponent("سلام دنیا"));
  });

  it("passes both url and text to Telegram", () => {
    const url = shareTargetUrl("telegram", "متن", "https://x.test/r/A");
    expect(url).toContain(encodeURIComponent("https://x.test/r/A"));
    expect(url).toContain(encodeURIComponent("متن"));
  });
});
