import { expect, test, type Page } from "@playwright/test";

import { addProductToCart, createOrderViaUi, expectNoSeriousAxe, loginOrdersAdmin } from "./helpers";

const createCashOrder = (page: Page, customerName: string) => createOrderViaUi(page, { customerName });

test.describe("orders (Phase 4)", () => {
  test("checkout creates an order; success page → tracking link opens the order without leaving the code in the URL", async ({ page, context }) => {
    // Mixed cart: Cookies Butter ×2 on sale (Rp60.000 → Rp54.000) + Brownies ×1 at normal price (Rp85.000).
    // Server totals: subtotal 120.000 + 85.000 = 205.000, discount 2 × 6.000 = 12.000, total 108.000 + 85.000 = 193.000.
    await addProductToCart(page, "contoh-brownies-cokelat", 1);
    await addProductToCart(page, "contoh-cookies-butter", 2);
    await page.goto("/keranjang");
    await expect(page.getByTestId("price-summary")).toContainText(/Subtotal\s*Rp205\.000\s*Diskon\s*−Rp12\.000\s*Total\s*Rp193\.000/);
    const cartItems = page.getByRole("list", { name: "Isi keranjang" });
    await expect(cartItems.locator("s")).toHaveCount(1);
    await expect(cartItems.locator("s")).toContainText("Rp60.000");
    const { orderNumber } = await createOrderViaUi(page, { customerName: "Pelanggan Lacak", cartReady: true });

    // Success page summary: same server numbers, normal price struck through only on the sale item.
    const successSummary = page.getByRole("region", { name: "Ringkasan Pesanan" });
    await expect(successSummary.getByTestId("price-summary")).toContainText(/Subtotal\s*Rp205\.000\s*Diskon\s*−Rp12\.000\s*Total\s*Rp193\.000/);
    await expect(successSummary.locator("s")).toHaveCount(1);

    // Cash (scenario D): recorded, paid at pickup — no online payment is asked for.
    await expect(page.getByTestId("success-payment-status")).toHaveText("Bayar Saat Pengambilan");
    await expect(page.getByTestId("success-processing-status")).toHaveText("Menunggu Konfirmasi Toko");
    await expect(page.getByTestId("success-amounts")).toContainText("Dibayar saat pengambilan");
    await expect(page.getByRole("link", { name: /Bayar Sekarang|Instruksi Pembayaran/ })).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText(/Menunggu Pembayaran|Bayar sebelum|QRIS/);

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
    await expect(page.getByTestId("tracking-status")).toHaveText("Menunggu Konfirmasi Toko");
    await expect(page.getByTestId("tracking-payment-status")).toHaveText("Bayar Saat Pengambilan");
    // Tracking "Detail Pesanan": line amounts already include the sale price; the summary is Subtotal − Diskon = Total.
    const detail = page.getByRole("region", { name: "Detail Pesanan" });
    await expect(detail).toContainText(/Contoh Brownies Cokelat × 1\s*Rp85\.000 \/ item\s*Rp85\.000/);
    await expect(detail).toContainText(/Contoh Cookies Butter × 2.*Rp60\.000.*Rp54\.000 \/ item\s*Rp108\.000/);
    await expect(detail.getByTestId("price-summary")).toContainText(/Subtotal\s*Rp205\.000\s*Diskon\s*−Rp12\.000\s*Total\s*Rp193\.000/);
    await expect(detail).not.toContainText("Diskon:");
    await expect(page.getByRole("region", { name: "Pembayaran Saat Pengambilan" })).toContainText("Tidak perlu membayar online.");
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

  test("a tracking link opened in a new tab verifies the code once (one request, one page refresh)", async ({ page, browser }) => {
    const { orderNumber, token } = await createCashOrder(page, "Pelanggan Link Baru");

    // A shared link (e.g. from WhatsApp) is a fresh page load with the code in the fragment.
    const fresh = await (await browser.newContext()).newPage();
    const verifications: string[] = [];
    fresh.on("request", (r) => {
      if (new URL(r.url()).pathname === "/api/tracking" && r.method() === "POST") verifications.push(r.url());
    });
    await fresh.goto(`/lacak#o=${orderNumber}&t=${token}`);
    await expect(fresh.getByTestId("tracking-order-number")).toHaveText(orderNumber);
    // The App Router used to write the fragment back after mount, so the page verified it again
    // after its refresh (second request + second full render).
    await fresh.waitForTimeout(1_500);
    expect(verifications).toHaveLength(1);
    expect(new URL(fresh.url()).hash).toBe("");
    await fresh.context().close();
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
