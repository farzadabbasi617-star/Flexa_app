import { describe, expect, it } from "vitest";
import {
  extractInviteReference,
  html,
  isValidGamentId,
  normalizeGame,
  normalizeGamentId,
} from "./utils";

describe("Telegram webhook utilities", () => {
  it("escapes dynamic values before Telegram HTML messages", () => {
    expect(html('<b>A&B</b>')).toBe("&lt;b&gt;A&amp;B&lt;/b&gt;");
  });

  it("normalizes Persian and English game aliases", () => {
    expect(normalizeGame("کالاف موبایل")).toBe("cod_mobile");
    expect(normalizeGame("Clash-Royale")).toBe("clash_royale");
  });

  it("normalizes and validates a Gament ID", () => {
    expect(normalizeGamentId(" flx-۱۲۳۴ ")).toBe("FLX-1234");
    expect(isValidGamentId("FLX-1234")).toBe(true);
    expect(isValidGamentId("1234")).toBe(false);
  });

  it("extracts a supported Clash invite link and trims punctuation", () => {
    expect(extractInviteReference("لینک: https://link.clashroyale.com/invite/friend،"))
      .toBe("https://link.clashroyale.com/invite/friend");
  });
});
