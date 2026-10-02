import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { E2E_ORDERS_ADMIN } from "./fixtures";
import { addProductToCart, clickDayWithStatus } from "./helpers";

async function expectNoSeriousAxe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

/** Customer checkout through to the success page; returns what the customer must keep. */
async function createCashOrder(page: Page, customerName: string) {
  await addProductToCart(page, "contoh-cookies-butter", 2);
  await page.goto("/checkout");
  await clickDayWithStatus(page, "tersedia");
  await page.getByLabel("Nama").fill(customerName);
  await page.getByLabel("Nomor WhatsApp").fill("0812 3456 7890");
  await page.getByRole("radio", { name: /Cash saat Pickup/ }).check();
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

async function loginOrdersAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(E2E_ORDERS_ADMIN.email);
  await page.getByLabel("Password").fill(E2E_ORDERS_ADMIN.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe("orders (Phase 4)", () => {
  test("checkout creates an order; success page → tracking link opens the order without leaving the code in the URL", async ({ page, context }) => {
    const { orderNumber } = await createCashOrder(page, "Pelanggan Lacak");

    // Cart is cleared after a successful order.
    await expect(page.getByRole("link", { name: /Keranjang/ }).first()).not.toContainText(/[1-9]/);
    await expectNoSeriousAxe(page);

    // WhatsApp help never carries the access code (FD-77).
    const wa = page.getByRole("link", { name: "Butuh bantuan? Hubungi kami via WhatsApp" });
    const waHref = (await wa.getAttribute("href")) ?? "";
    expect(decodeURIComponent(waHref)).toContain(orderNumber);
    expect(waHref).not.toContain((await page.getByTestId("tracking-token").textContent())!.trim());

    await page.getByRole("link", { name: "Lacak Pesanan Sekarang" }).click();
    await expect(page.getByTestId("tracking-order-number")).toHaveText(orderNumber);
    await expect(page.getByTestId("tracking-status")).toContainText("Pesanan Baru");
    await expect(page.getByTestId("tracking-payment-status")).toHaveText("Belum Dibayar");
    expect(new URL(page.url()).hash).toBe("");
    await expect(page.getByText("6281234567890")).toHaveCount(0);

    const session = (await context.cookies()).find((c) => c.name === "enjua_track");
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe("Lax");
    await expectNoSeriousAxe(page);

    // Reload keeps the session; "Lacak pesanan lain" ends it.
    await page.reload();
    await expect(page.getByTestId("tracking-order-number")).toHaveText(orderNumber);
    await page.getByRole("button", { name: "Lacak pesanan lain" }).click();
    await expect(page.getByLabel("Nomor Pesanan")).toBeVisible();
  });

  test("lookup with a wrong code or an unknown number gives the same generic message (EC-11)", async ({ page }) => {
    await page.goto("/lacak");
    await page.getByLabel("Nomor Pesanan").fill("ENC-20261002-ZZZZ");
    await page.getByLabel("Kode Akses").fill("kode-salah");
    await page.getByRole("button", { name: "Lacak Pesanan" }).click();
    await expect(page.locator("form").getByRole("alert")).toHaveText("Nomor pesanan atau kode akses tidak cocok.");
    await expectNoSeriousAxe(page);
  });

  test("tracking API refuses cross-origin requests; cron endpoint requires the secret", async ({ request }) => {
    const cross = await request.post("/api/tracking", {
      data: { orderNumber: "x", token: "y" },
      headers: { Origin: "https://evil.example" },
    });
    expect(cross.status()).toBe(403);
    expect((await request.post("/api/cron/expire-reservations")).status()).toBe(401);
    expect(
      (
        await request.post("/api/cron/expire-reservations", {
          headers: { Authorization: "Bearer wrong-secret-0123456789" },
        })
      ).status(),
    ).toBe(401);
    const ok = await request.post("/api/cron/expire-reservations", {
      headers: { Authorization: "Bearer e2e-only-cron-secret-0123456789" },
    });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true });
  });

  test("admin processes an order: only allowed transitions, Selesai blocked until Lunas, cancel needs a reason; customer sees the result", async ({
    browser,
  }) => {
    const customer = await (await browser.newContext()).newPage();
    const { orderNumber, token } = await createCashOrder(customer, "Pelanggan Admin");

    const page = await (await browser.newContext()).newPage();
    await loginOrdersAdmin(page);
    await page.getByRole("navigation", { name: "Navigasi admin" }).getByRole("link", { name: "Pesanan" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Pesanan" })).toBeVisible();
    await expectNoSeriousAxe(page);

    await page.getByRole("link", { name: orderNumber }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: orderNumber })).toBeVisible();
    await expect(page.getByTestId("admin-order-status")).toHaveText("Pesanan Baru");
    await expectNoSeriousAxe(page);

    await page.getByRole("button", { name: "Konfirmasi Pesanan" }).click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("Dikonfirmasi");
    await page.getByRole("button", { name: "Proses Pesanan" }).click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("Pesanan Diproses");
    await page.getByRole("button", { name: "Tandai Siap Diambil" }).click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("Siap Diambil");

    // Selesai is not offered before payment is complete; the reason is shown instead.
    await expect(page.getByRole("button", { name: "Tandai Selesai" })).toHaveCount(0);
    await expect(page.getByText("Pesanan hanya bisa diselesaikan setelah pembayaran lunas.")).toBeVisible();

    await page.getByRole("button", { name: "Batalkan Pesanan" }).click();
    const reason = page.getByLabel(/Alasan pembatalan/);
    await expect(reason).toHaveAttribute("required", "");
    await reason.fill("Customer membatalkan via WhatsApp");
    await page.getByRole("button", { name: "Konfirmasi Pembatalan" }).click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("Dibatalkan");
    await expect(page.getByRole("region", { name: "Ubah Status" }).getByText("Alasan: Customer membatalkan via WhatsApp")).toBeVisible();
    await expect(page.getByRole("button", { name: "Konfirmasi Pesanan" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Riwayat" }).getByText("Status diubah → Dibatalkan")).toBeVisible();

    // Customer sees a safe cancellation reason, never the admin's note.
    await customer.goto(`/lacak#o=${orderNumber}&t=${token}`);
    await expect(customer.getByTestId("tracking-status")).toContainText("Dibatalkan");
    await expect(customer.getByText("Pesanan dibatalkan oleh toko.")).toBeVisible();
    await expect(customer.getByText("Customer membatalkan via WhatsApp")).toHaveCount(0);

    // Regenerating the access code locks out the old code and the old session.
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Buat Ulang Kode Akses" }).click();
    const fresh = (await page.getByTestId("regenerated-token").textContent())!.trim();
    expect(fresh).not.toBe(token);
    await customer.reload();
    await expect(customer.getByLabel("Nomor Pesanan")).toBeVisible();
    await customer.goto(`/lacak#o=${orderNumber}&t=${fresh}`);
    await expect(customer.getByTestId("tracking-order-number")).toHaveText(orderNumber);
  });

  test("admin order pages work on a phone without horizontal overflow", async ({ browser }) => {
    const customer = await (await browser.newContext()).newPage();
    const { orderNumber } = await createCashOrder(customer, "Pelanggan HP");
    const page = await (await browser.newContext({ viewport: { width: 360, height: 740 } })).newPage();
    await loginOrdersAdmin(page);
    await page.goto("/admin/pesanan");
    const list = page.getByRole("list", { name: "Daftar pesanan" });
    await expect(list).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await list.getByRole("link", { name: new RegExp(orderNumber) }).click();
    await expect(page.getByTestId("admin-order-status")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
