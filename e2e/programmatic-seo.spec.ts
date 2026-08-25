import { expect, test } from "@playwright/test";

const RESULT_PATH = "/games/call-of-duty-mobile/tournaments/results";

test.describe("programmatic SEO", () => {
  test("serves substantive Persian HTML, canonical/schema and game-hub links", async ({ page, request }) => {
    const response = await request.get(RESULT_PATH);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain("این صفحه آرشیو نتیجه‌های واقعی کالاف دیوتی موبایل را از رویدادهای پایان‌یافته گیمنت جمع می‌کند");
    expect(html).toContain("application/ld+json");

    await page.goto(RESULT_PATH);
    await expect(page.locator("h1")).toContainText("نتایج تورنومنت‌های کالاف دیوتی موبایل");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://www.gament1.ir${RESULT_PATH}`,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index, follow/);

    const schemas = await page.locator('script[type="application/ld+json"]').allTextContents();
    const graphs = schemas.map((value) => JSON.parse(value)).filter((value) => Array.isArray(value?.["@graph"]));
    const graph = graphs.find((value) => value["@graph"].some(
      (entry: Record<string, unknown>) => entry["@type"] === "BreadcrumbList"
    ));
    expect(graph).toBeTruthy();
    expect(graph["@graph"].some((entry: Record<string, unknown>) => entry["@type"] === "FAQPage")).toBe(true);

    await page.goto("/games/call-of-duty-mobile");
    await expect(page.locator(`a[href="${RESULT_PATH}"]`).first()).toBeVisible();
  });

  test("returns a real 404 and noindex for non-allowlisted facets", async ({ page }) => {
    const response = await page.goto("/games/call-of-duty-mobile/store/invented-facet");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "این صفحه پیدا نشد" })).toBeVisible();
    const robotDirectives = await page.locator('meta[name="robots"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("content") || "")
    );
    expect(robotDirectives.join(" ")).toContain("noindex");
  });

  test("publishes all curated routes in the static sitemap shard", async ({ request }) => {
    const response = await request.get("/sitemaps/static/0.xml");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/xml");
    const xml = await response.text();
    expect((xml.match(/<url>/g) || []).length).toBeGreaterThanOrEqual(52);
    expect(xml).toContain(`https://www.gament1.ir${RESULT_PATH}`);
    expect(xml).toContain("https://www.gament1.ir/games/fortnite/store/v-bucks");
    expect(xml).toContain("https://www.gament1.ir/games/clash-royale/leaderboards/wins");
  });

  test("keeps a valid sitemap index when the database is temporarily unavailable", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/xml");
    expect(await response.text()).toContain("/sitemaps/static/0.xml");
  });

  test("blocks private crawl paths and adds an HTTP noindex header", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /tournaments/*/lobby");
    expect(robots).toContain("Disallow: /store/orders");
    expect(robots).toContain("Sitemap: https://www.gament1.ir/sitemap.xml");

    const privatePage = await request.get("/store/orders");
    expect(privatePage.headers()["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
  });
});
