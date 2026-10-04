import AxeBuilder from "@axe-core/playwright";
import { devices, expect, test, type Page } from "@playwright/test";

import { addProductToCart, clickDayWithStatus, clickDayWithStatusFromStart, tamperPlaceOrderPickupDate, wibIsoDate } from "./helpers";

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

  test("Ready Stock: choosing an unavailable date after a valid one clears the choice and blocks checkout", async ({ page }) => {
    await addProductToCart(page, "contoh-cookies-butter");
    await page.goto("/checkout");
    const chosen = await clickDayWithStatus(page, "tersedia");
    await expect(page.getByText(`Tanggal dipilih: ${chosen}`)).toBeVisible();

    const blocked = await clickDayWithStatusFromStart(page, "tidak tersedia: Tutup"); // seeded blocked date
    await expect(page.getByText(`${blocked}: Tutup.`)).toBeVisible();
    await expect(page.getByText("Belum ada tanggal dipilih.")).toBeVisible();
    await expect(page.getByText(/^Tanggal dipilih:/)).toHaveCount(0);
    await expect(page.getByRole("grid").locator("[aria-selected=true]")).toHaveCount(0);

    await page.getByLabel("Nama").fill("Pelanggan E2E");
    await page.getByLabel("Nomor WhatsApp").fill("0812 3456 7890");
    await page.getByRole("radio", { name: /Cash saat Pickup/ }).check();
    await page.getByRole("button", { name: "Lanjut ke Konfirmasi" }).click();
    await expect(page.getByText("Pilih tanggal pickup.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Konfirmasi Pesanan" })).toHaveCount(0);
  });

  test("Pre-Order: a too-early date chosen by keyboard after a valid one clears the choice and blocks checkout", async ({ page }) => {
    await addProductToCart(page, "contoh-cheesecake-stroberi"); // min 2 days
    await page.goto("/checkout");
    const chosen = await clickDayWithStatus(page, "tersedia");
    await expect(page.getByText(`Tanggal dipilih: ${chosen}`)).toBeVisible();

    const previous = page.getByRole("button", { name: "Ke bulan sebelumnya" });
    while (await previous.isEnabled()) await previous.click();
    const tooEarly = page.getByRole("grid").getByRole("button", { name: /, tidak tersedia: Belum memenuhi minimum Pre-Order$/ }).first();
    const label = (await tooEarly.getAttribute("aria-label"))!;
    await tooEarly.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(`${label.slice(0, label.indexOf(", tidak tersedia"))}: Belum memenuhi minimum Pre-Order.`)).toBeVisible();
    await expect(page.getByText("Belum ada tanggal dipilih.")).toBeVisible();
    await expect(tooEarly).toBeFocused(); // focus stays on the day so the reason is announced in context

    await page.getByLabel("Nama").fill("Pelanggan E2E");
    await page.getByLabel("Nomor WhatsApp").fill("0812 3456 7890");
    await page.getByRole("radio", { name: "QRIS" }).check();
    await page.getByRole("button", { name: "Lanjut ke Konfirmasi" }).click();
    await expect(page.getByText("Pilih tanggal pickup.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Konfirmasi Pesanan" })).toHaveCount(0);
  });

  for (const scenario of [
    { name: "Ready Stock order tampered to a blocked date", slug: "contoh-cookies-butter", method: /Cash saat Pickup/, date: () => wibIsoDate(10), reason: "Tutup" },
    { name: "Pre-Order tampered to a date before the minimum", slug: "contoh-cheesecake-stroberi", method: /^QRIS/, date: () => wibIsoDate(0), reason: "Belum memenuhi minimum Pre-Order" },
  ]) {
    test(`server rejects a modified "Buat Pesanan" payload: ${scenario.name}`, async ({ page }) => {
      await addProductToCart(page, scenario.slug);
      await page.goto("/checkout");
      await clickDayWithStatus(page, "tersedia");
      await page.getByLabel("Nama").fill("Pelanggan Usil");
      await page.getByLabel("Nomor WhatsApp").fill("0812 3456 7890");
      await page.getByRole("radio", { name: scenario.method }).check();
      await page.getByRole("button", { name: "Lanjut ke Konfirmasi" }).click();
      const confirm = page.getByRole("region", { name: "Konfirmasi Pesanan" });
      await expect(confirm).toBeVisible();

      await tamperPlaceOrderPickupDate(page, scenario.date());
      await confirm.getByRole("button", { name: "Buat Pesanan" }).click();

      // Back on the form: the date is dropped, the reason is shown, no order page.
      await expect(page.getByText(new RegExp(`: ${scenario.reason}\\.$`))).toBeVisible();
      await expect(page.getByText("Tanggal ini tidak tersedia. Silakan pilih tanggal lain.")).toBeVisible();
      await expect(page.getByRole("region", { name: "Konfirmasi Pesanan" })).toHaveCount(0);
      await expect(page).toHaveURL(/\/checkout$/);
    });
  }

  test("phone over plain-http LAN (no crypto.randomUUID): checkout works; a retry reuses the key; a new attempt gets a new one (TD-15)", async ({ browser }) => {
    // crypto.randomUUID is a [SecureContext] API: absent at http://<LAN-IP>:3000 on a phone, which made
    // CheckoutForm throw "crypto.randomUUID is not a function". Reproduce that API surface on a phone profile.
    const context = await browser.newContext({ ...devices["Pixel 7"] });
    await context.addInitScript(() => {
      Object.defineProperty(Crypto.prototype, "randomUUID", { value: undefined, configurable: true });
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // Record the idempotency key of every "Buat Pesanan" call (args: [input, key]); reject the first one
    // server-side (date tampered to the blocked date) so the customer has to retry the same attempt.
    const keys: string[] = [];
    let tamperNext = true;
    await page.route("**/checkout", async (route) => {
      const request = route.request();
      const body = request.postData() ?? "";
      const match = request.method() === "POST" && request.headers()["next-action"] ? /,"([0-9a-f-]{36})"\]$/.exec(body) : null;
      if (!match) return route.continue();
      keys.push(match[1]!);
      if (tamperNext) {
        tamperNext = false;
        return route.continue({ postData: body.replace(/"pickupDate":"[^"]*"/, `"pickupDate":"${wibIsoDate(10)}"`) });
      }
      return route.continue();
    });

    const checkout = async (p: Page, name: string) => {
      await p.goto("/produk/contoh-cookies-butter");
      await p.getByRole("button", { name: "Tambah ke Keranjang" }).tap();
      await expect(p.getByRole("status").filter({ hasText: "ditambahkan ke keranjang" })).toBeVisible();
      await p.goto("/checkout");
      expect(await p.evaluate(() => typeof crypto.randomUUID)).toBe("undefined");
      await clickDayWithStatus(p, "tersedia");
      await p.getByLabel("Nama").fill(name);
      await p.getByLabel("Nomor WhatsApp").fill("0812 3456 7890");
      await p.getByRole("radio", { name: /Cash saat Pickup/ }).check();
      await p.getByRole("button", { name: "Lanjut ke Konfirmasi" }).tap();
      await expect(p.getByRole("region", { name: "Konfirmasi Pesanan" })).toBeVisible();
    };

    await checkout(page, "Pelanggan HP");
    await page.getByRole("region", { name: "Konfirmasi Pesanan" }).getByRole("button", { name: "Buat Pesanan" }).tap();
    await expect(page.getByText("Tanggal ini tidak tersedia. Silakan pilih tanggal lain.")).toBeVisible();
    // Retry of the same attempt: pick a date again and place the order (double tap: still one key).
    await clickDayWithStatus(page, "tersedia");
    await page.getByRole("button", { name: "Lanjut ke Konfirmasi" }).tap();
    await page.getByRole("region", { name: "Konfirmasi Pesanan" }).getByRole("button", { name: "Buat Pesanan" }).dblclick();
    await expect(page).toHaveURL(/\/pesanan\/sukses$/);
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    // A genuinely new checkout attempt (new CheckoutForm) gets a new key.
    const firstAttemptKey = keys[0];
    keys.length = 0;
    await checkout(page, "Pelanggan HP Kedua");
    await page.getByRole("region", { name: "Konfirmasi Pesanan" }).getByRole("button", { name: "Buat Pesanan" }).tap();
    await expect(page).toHaveURL(/\/pesanan\/sukses$/);
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toBe(firstAttemptKey);
    expect(errors.filter((e) => /randomUUID/.test(e))).toEqual([]);
    await context.close();
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
