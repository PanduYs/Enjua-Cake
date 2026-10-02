import { expect, type Page } from "@playwright/test";

/**
 * Clicks the first calendar day whose accessible name ends with the given status
 * (e.g. "tidak tersedia: Tutup"), paging months forward. Derived from what the
 * calendar renders, so it does not depend on the test's own clock or time zone.
 * Returns the day's date text (e.g. "Selasa, 13 Oktober 2026").
 */
export async function clickDayWithStatus(page: Page, status: string): Promise<string> {
  const escaped = status.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const day = page.getByRole("grid").getByRole("button", { name: new RegExp(`, ${escaped}$`) }).first();
  for (let i = 0; i < 4 && (await day.count()) === 0; i++) {
    await page.getByRole("button", { name: "Ke bulan berikutnya" }).click();
  }
  const label = (await day.getAttribute("aria-label")) ?? "";
  await day.click();
  return label.slice(0, label.lastIndexOf(`, ${status}`));
}

export async function addProductToCart(page: Page, slug: string, quantity = 1) {
  await page.goto(`/produk/${slug}`);
  if (quantity > 1) await page.getByRole("spinbutton", { name: "Jumlah" }).fill(String(quantity));
  await page.getByRole("button", { name: "Tambah ke Keranjang" }).click();
  await expect(page.getByRole("status").filter({ hasText: "ditambahkan ke keranjang" })).toBeVisible();
}
