import { describe, expect, it } from "vitest";
import {
  getProgrammaticSeoPage,
  getRelatedProgrammaticPages,
  PROGRAMMATIC_SEO_PAGES,
  programmaticCanonical,
  programmaticPath,
  programmaticStaticParams,
  scoreProgrammaticPage,
} from "./programmatic-seo";

describe("programmatic SEO catalogue", () => {
  it("publishes a unique, complete launch cluster", () => {
    expect(PROGRAMMATIC_SEO_PAGES).toHaveLength(30);
    const paths = PROGRAMMATIC_SEO_PAGES.map(programmaticPath);
    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(PROGRAMMATIC_SEO_PAGES.map((page) => page.title)).size).toBe(PROGRAMMATIC_SEO_PAGES.length);
    expect(new Set(PROGRAMMATIC_SEO_PAGES.map((page) => page.description)).size).toBe(PROGRAMMATIC_SEO_PAGES.length);
  });

  it("covers every game and commercial/informational cluster", () => {
    for (const gameSlug of ["call-of-duty-mobile", "fortnite", "clash-royale"]) {
      const pages = PROGRAMMATIC_SEO_PAGES.filter((page) => page.gameSlug === gameSlug);
      expect(new Set(pages.map((page) => page.cluster))).toEqual(
        new Set(["tournaments", "store", "guides", "leaderboards"])
      );
      expect(pages.some((page) => page.cluster === "tournaments" && page.facet === "results")).toBe(true);
    }
  });

  it("keeps every indexable page above the quality threshold", () => {
    for (const page of PROGRAMMATIC_SEO_PAGES) {
      const quality = scoreProgrammaticPage(page);
      expect(quality.indexable, `${programmaticPath(page)}: ${quality.reasons.join(", ")}`).toBe(true);
      expect(quality.score).toBeGreaterThanOrEqual(80);
      expect(quality.visibleCharacters).toBeGreaterThanOrEqual(1_000);
    }
  });

  it("resolves only allowlisted parameter combinations", () => {
    const first = PROGRAMMATIC_SEO_PAGES[0];
    expect(getProgrammaticSeoPage(first.gameSlug, first.cluster, first.facet)).toEqual(first);
    expect(getProgrammaticSeoPage(first.gameSlug, "not-a-cluster", first.facet)).toBeUndefined();
    expect(getProgrammaticSeoPage("unknown", first.cluster, first.facet)).toBeUndefined();
  });

  it("generates canonical HTTPS URLs without query-string duplicates", () => {
    for (const page of PROGRAMMATIC_SEO_PAGES) {
      const canonical = programmaticCanonical(page);
      expect(canonical).toMatch(/^https:\/\/www\.gament1\.ir\/games\//);
      expect(canonical).not.toContain("?");
      expect(canonical).not.toContain("#");
    }
  });

  it("produces stable static params and crawlable related links", () => {
    expect(programmaticStaticParams()).toHaveLength(PROGRAMMATIC_SEO_PAGES.length);
    for (const page of PROGRAMMATIC_SEO_PAGES) {
      const related = getRelatedProgrammaticPages(page);
      expect(related.length).toBeGreaterThan(0);
      expect(related.some((candidate) => programmaticPath(candidate) === programmaticPath(page))).toBe(false);
      expect(related.every((candidate) => candidate.gameSlug === page.gameSlug || candidate.cluster === page.cluster)).toBe(true);
    }
  });
});
