import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { waitForEntranceAnimations } from "./helpers";

/** Viewport matrix from IMPLEMENTATION-PLAN §33. */
const VIEWPORTS = [
  { name: "phone-small", width: 320, height: 568 },
  { name: "phone", width: 360, height: 800 },
  { name: "phone-large", width: 390, height: 844 },
  { name: "phone-landscape", width: 844, height: 390 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "desktop", width: 1920, height: 1080 },
] as const;

const PAGES = ["/", "/produk", "/produk?kategori=cakes", "/produk/contoh-brownies-cokelat", "/produk/contoh-pudding-karamel", "/keranjang", "/checkout", "/lacak", "/pesanan/sukses", "/admin/login"];

for (const viewport of VIEWPORTS) {
  test(`no horizontal overflow or clipped header @ ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const path of PAGES) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(0);
    }
    await page.goto("/");
    const isDesktop = viewport.width >= 1024;
    await expect(page.getByRole("navigation", { name: "Navigasi utama" })).toBeVisible({ visible: isDesktop });
    await expect(page.getByRole("button", { name: "Buka menu" })).toBeVisible({ visible: !isDesktop });
    await expect(page.getByRole("link", { name: /^Keranjang/ })).toBeInViewport();
  });
}

for (const path of PAGES) {
  test(`axe: no serious or critical WCAG A/AA violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await waitForEntranceAnimations(page);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test("axe: mobile drawer open has no serious violations", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Buka menu" }).click();
  await expect(page.getByRole("navigation", { name: "Menu utama" })).toBeVisible();
  await waitForEntranceAnimations(page);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
});
