import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

import { E2E_ORDERS_ADMIN } from "./fixtures";

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

export async function expectNoSeriousAxe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** Customer checkout through to the success page; returns what the customer must keep. */
export async function createOrderViaUi(
  page: Page,
  options: { customerName: string; slug?: string; quantity?: number; method?: "Cash saat Pickup" | "QRIS" | "Transfer Bank"; option?: "Bayar DP 50%" | "Bayar Penuh" },
) {
  const method = options.method ?? "Cash saat Pickup";
  await addProductToCart(page, options.slug ?? "contoh-cookies-butter", options.quantity ?? 2);
  await page.goto("/checkout");
  await clickDayWithStatus(page, "tersedia");
  await page.getByLabel("Nama").fill(options.customerName);
  await page.getByLabel("Nomor WhatsApp").fill("0812 3456 7890");
  await page.getByRole("radio", { name: new RegExp(method) }).check();
  if (options.option) await page.getByRole("radio", { name: options.option, exact: true }).check();
  await page.getByRole("button", { name: "Lanjut ke Konfirmasi" }).click();
  await page.getByRole("region", { name: "Konfirmasi Pesanan" }).getByRole("button", { name: "Buat Pesanan" }).click();

  await expect(page).toHaveURL(/\/pesanan\/sukses$/);
  await expect(page.getByText("Pesanan berhasil dibuat.")).toBeVisible();
  const orderNumber = (await page.getByTestId("order-number").textContent())!.trim();
  const token = (await page.getByTestId("tracking-token").textContent())!.trim();
  expect(orderNumber).toMatch(/^ENC-\d{8}-[0-9A-HJKMNP-TV-Z]{4}$/);
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  return { orderNumber, token };
}

export async function loginOrdersAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(E2E_ORDERS_ADMIN.email);
  await page.getByLabel("Password").fill(E2E_ORDERS_ADMIN.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
