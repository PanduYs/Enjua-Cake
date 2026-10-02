import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { addProductToCart, clickDayWithStatus } from "./helpers";

test.describe("Keranjang", () => {
  test("add from detail, persists across reload, change quantity, remove", async ({ page }) => {
    await addProductToCart(page, "contoh-brownies-cokelat", 2);
    await expect(page.getByRole("link", { name: "Keranjang, 2 item" })).toBeVisible();

    await page.goto("/keranjang");
    await page.reload(); // persisted in the browser (FD-31)
    const cart = page.getByRole("list", { name: "Isi keranjang" });
    await expect(cart.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("complementary").getByText("Rp170.000").first()).toBeVisible();

    await page.getByRole("button", { name: "Tambah jumlah" }).click();
    await expect(page.getByRole("link", { name: "Keranjang, 3 item" })).toBeVisible();
    await expect(page.getByRole("complementary").getByText("Rp255.000").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Lanjut ke Checkout" })).toBeVisible();

    await page.getByRole("button", { name: /Hapus Contoh Brownies Cokelat/ }).click();
    await expect(page.getByText("Keranjangmu masih kosong.")).toBeVisible();
  });

  test("quick add from a product card", async ({ page }) => {
    await page.goto("/produk");
    await page.getByRole("button", { name: "Tambah Contoh Cookies Butter ke keranjang" }).click();
    await expect(page.getByRole("link", { name: "Keranjang, 1 item" })).toBeVisible();
    // Sold Out products have no add button.
    await expect(page.getByRole("button", { name: /Tambah Contoh Pudding Karamel/ })).toHaveCount(0);
  });

  test("Sold Out cannot be added; per-order maximum is enforced", async ({ page }) => {
    await page.goto("/produk/contoh-pudding-karamel");
    await expect(page.getByRole("button", { name: "Sold Out" })).toBeDisabled();

    await page.goto("/produk/contoh-kue-ulang-tahun"); // max 2 per order
    await page.getByRole("button", { name: "Tambah jumlah" }).click();
    await expect(page.getByRole("button", { name: "Tambah jumlah" })).toBeDisabled();
    await page.getByRole("button", { name: "Tambah ke Keranjang" }).click();
    await expect(page.getByRole("button", { name: "Tambah ke Keranjang" })).toBeDisabled();
    await expect(page.getByText("sudah mencapai batas maksimal per pesanan")).toBeVisible();
  });

  test("cart with items has no serious accessibility violations", async ({ page }) => {
    await addProductToCart(page, "contoh-cheesecake-stroberi");
    await page.goto("/keranjang");
    await expect(page.getByText("Keranjang berisi produk Pre-Order")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  });
});

test.describe("Checkout", () => {
  test("Pre-Order cart: Cash disabled, unavailable dates explain why, server-computed DP summary", async ({ page }) => {
    await addProductToCart(page, "contoh-cheesecake-stroberi"); // Rp225.000, min 2 days
    await page.goto("/checkout");

    const cash = page.getByRole("radio", { name: /Cash saat Pickup/ });
    await expect(cash).toBeDisabled();
    await expect(page.getByText("Cash hanya tersedia untuk pesanan Ready Stock.")).toBeVisible();

    const tooEarly = await clickDayWithStatus(page, "tidak tersedia: Belum memenuhi minimum Pre-Order");
    await expect(page.getByText(`${tooEarly}: Belum memenuhi minimum Pre-Order.`)).toBeVisible();
    await expect(page.getByText("Belum ada tanggal dipilih.")).toBeVisible();

    const blocked = await clickDayWithStatus(page, "tidak tersedia: Tutup"); // seeded blocked date
    await expect(page.getByText(`${blocked}: Tutup.`)).toBeVisible();

    const chosen = await clickDayWithStatus(page, "tersedia");
    await expect(page.getByText(`Tanggal dipilih: ${chosen}`)).toBeVisible();

    await page.getByLabel("Nama").fill("Pelanggan E2E");
    await page.getByLabel("Nomor WhatsApp").fill("0812 3456 7890");
    await page.getByRole("radio", { name: "QRIS" }).check();
    await page.getByRole("radio", { name: "Bayar DP 50%" }).check();
    await page.getByRole("button", { name: "Lanjut ke Konfirmasi" }).click();

    const confirm = page.getByRole("region", { name: "Konfirmasi Pesanan" });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText("+6281234567890")).toBeVisible();
    await expect(confirm.getByText("QRIS · Bayar DP 50%")).toBeVisible();
    const expected: ReadonlyArray<readonly [string, string]> = [
      ["Total Pesanan", "Rp225.000"],
      ["DP 50%", "Rp112.500"],
      ["Sisa Pembayaran", "Rp112.500"],
      ["Dibayar sekarang", "Rp112.500"],
    ];
    for (const [label, amount] of expected) {
      await expect(confirm.locator(`dl > div:has(> dt:text-is("${label}")) > dd`)).toHaveText(amount);
    }
    await expect(confirm.getByRole("button", { name: "Buat Pesanan" })).toBeEnabled();
    await confirm.getByRole("button", { name: "Ubah Data" }).click();
    await expect(page.getByLabel("Nama")).toHaveValue("Pelanggan E2E");
  });

  test("Ready Stock cart allows Cash (full payment only) and validates required fields", async ({ page }) => {
    await addProductToCart(page, "contoh-cookies-butter");
    await page.goto("/checkout");
    await page.getByRole("button", { name: "Lanjut ke Konfirmasi" }).click();
    await expect(page.getByText("Masukkan nama.")).toBeVisible();
    await expect(page.getByText("Masukkan nomor WhatsApp Indonesia yang valid", { exact: false })).toBeVisible();
    await expect(page.getByText("Pilih tanggal pickup.")).toBeVisible();

    const cash = page.getByRole("radio", { name: /Cash saat Pickup/ });
    await expect(cash).toBeEnabled();
    await cash.check();
    await expect(page.getByRole("radio", { name: "Bayar DP 50%" })).toHaveCount(0);
  });

  test("checkout with items: no serious axe violations and no overflow on a small phone", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await addProductToCart(page, "contoh-brownies-cokelat");
    await page.goto("/checkout");
    await expect(page.getByRole("grid")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });

  test("empty cart checkout shows a clear empty state", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page.getByText("Keranjangmu masih kosong.")).toBeVisible();
  });
});
