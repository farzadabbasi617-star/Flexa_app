import { expect, test } from "@playwright/test";

test("home page loads with the Persian document direction", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/گیمنت|Gament/i);
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("body")).toBeVisible();
});

test("login page is reachable and contains a password field", async ({ page }) => {
  const response = await page.goto("/login");

  expect(response?.ok()).toBe(true);
  await expect(page.locator('input[autocomplete="current-password"]')).toBeVisible({ timeout: 15_000 });
});

test("public tournament page is reachable", async ({ page }) => {
  const response = await page.goto("/tournaments");

  expect(response?.ok()).toBe(true);
  await expect(page.locator("body")).toBeVisible();
});
