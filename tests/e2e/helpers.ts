import { expect, type Page } from "@playwright/test";

/** Today's date in WIB as YYYY-MM-DD (same calendar the server uses). */
export function wibToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function longIndonesianDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(y, m - 1, d, 12));
}

/** Clicks the calendar day for an ISO date, paging months forward if needed. */
export async function clickCalendarDay(page: Page, iso: string) {
  const label = longIndonesianDate(iso);
  const day = page.getByRole("button", { name: new RegExp(`^${label},`) });
  for (let i = 0; i < 4 && !(await day.isVisible()); i++) {
    await page.getByRole("button", { name: "Ke bulan berikutnya" }).click();
  }
  await expect(day).toBeVisible();
  await day.click();
  return day;
}

export async function addProductToCart(page: Page, slug: string, quantity = 1) {
  await page.goto(`/produk/${slug}`);
  if (quantity > 1) await page.getByRole("spinbutton", { name: "Jumlah" }).fill(String(quantity));
  await page.getByRole("button", { name: "Tambah ke Keranjang" }).click();
  await expect(page.getByRole("status").filter({ hasText: "ditambahkan ke keranjang" })).toBeVisible();
}
