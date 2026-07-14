import { describe, expect, it } from "vitest";
import { isSupportedClashInvite } from "./clash-1v1-policy";

describe("Clash 1V1 invite validation", () => {
  it("accepts official Clash Royale HTTPS links", () => {
    expect(isSupportedClashInvite("https://link.clashroyale.com/invite/friend/en?tag=ABC&token=XYZ")).toBe(true);
  });

  it("accepts official app URL schemes", () => {
    expect(isSupportedClashInvite("clashroyale://invite/friend/test")).toBe(true);
  });

  it("rejects phishing and non-HTTPS links", () => {
    expect(isSupportedClashInvite("https://clashroyale.example.com/fake")).toBe(false);
    expect(isSupportedClashInvite("http://link.clashroyale.com/insecure")).toBe(false);
    expect(isSupportedClashInvite("https://evil.example/qr")).toBe(false);
  });
});
