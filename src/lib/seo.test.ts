import { describe, expect, it } from "vitest";
import { absoluteUrl, cleanSeoText, createPageMetadata, serializeJsonLd, uniqueKeywords } from "./seo";

describe("SEO primitives", () => {
  it("builds first-party absolute URLs", () => {
    expect(absoluteUrl("/games/fortnite")).toBe("https://www.gament1.ir/games/fortnite");
    expect(absoluteUrl("games/fortnite")).toBe("https://www.gament1.ir/games/fortnite");
    expect(absoluteUrl("https://example.com/x")).toBe("https://example.com/x");
  });

  it("sanitizes visible metadata text", () => {
    expect(cleanSeoText(" <b>عنوان</b>   صفحه ")).toBe("عنوان صفحه");
  });

  it("deduplicates compact keywords instead of stuffing every page", () => {
    expect(uniqueKeywords(["گیمنت", "Gament", "گیمنت", " تورنومنت "])).toEqual([
      "گیمنت",
      "Gament",
      "تورنومنت",
    ]);
  });

  it("escapes JSON-LD script-breaking characters", () => {
    const result = serializeJsonLd({ title: "</script><script>alert(1)</script>", amp: "a&b" });
    expect(result).not.toContain("</script>");
    expect(result).toContain("\\u003c/script\\u003e");
    expect(result).toContain("a\\u0026b");
  });

  it("sets canonical, social cards and noindex through one helper", () => {
    const metadata = createPageMetadata({
      title: "صفحه آزمایشی",
      description: "توضیح آزمایشی برای صفحه",
      path: "/test",
      noIndex: true,
      keywords: ["تست"],
    });
    expect(metadata.alternates).toEqual({ canonical: "https://www.gament1.ir/test" });
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(metadata.openGraph).toMatchObject({ url: "https://www.gament1.ir/test" });
  });
});
