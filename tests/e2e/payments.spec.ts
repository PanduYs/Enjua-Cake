import { expect, test, type Page } from "@playwright/test";

import { createOrderViaUi, expectNoSeriousAxe, loginOrdersAdmin } from "./helpers";

async function expectNoHorizontalOverflow(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll).toBeLessThanOrEqual(client);
}

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

async function openTracking(page: Page, orderNumber: string, token: string) {
  await page.goto(`/lacak#o=${orderNumber}&t=${token}`);
  await expect(page.getByTestId("tracking-order-number")).toHaveText(orderNumber);
}

async function openAdminOrder(page: Page, orderNumber: string) {
  await page.goto("/admin/pesanan");
  await page.getByRole("link", { name: orderNumber }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: orderNumber })).toBeVisible();
}

test.describe("payments (Phase 5, MockProvider)", () => {
  for (const c of [
    {
      method: "QRIS",
      option: "Bayar Penuh",
      due: "Rp225.000",
      payStatus: "Menunggu Pembayaran",
      cta: "Bayar Sekarang dengan QRIS",
      step: "QRIS ditampilkan di halaman Lacak Pesanan. Pindai dengan aplikasi bank atau e-wallet.",
    },
    {
      method: "Transfer Bank",
      option: "Bayar DP 50%",
      due: "Rp112.500",
      payStatus: "Menunggu Pembayaran DP",
      cta: "Lihat Instruksi Pembayaran",
      step: "Rekening tujuan dan tempat unggah bukti transfer ada di halaman Lacak Pesanan.",
    },
  ] as const) {
    test(`${c.method} ${c.option}: the success page says how to pay; the tracking page shows the payment details`, async ({ page }) => {
      await createOrderViaUi(page, { customerName: `Pelanggan ${c.method}`, slug: "contoh-cheesecake-stroberi", quantity: 1, method: c.method, option: c.option });
      const step = page.getByTestId("payment-next-step");
      await expect(step).toContainText(c.step);
      // Scenario A/E: the order is recorded, but payment is still pending — never "berhasil".
      await expect(page.getByTestId("success-payment-status")).toHaveText(c.payStatus);
      await expect(page.getByTestId("success-processing-status")).toHaveText("Menunggu Pembayaran");
      await expect(page.getByTestId("success-headline")).toHaveText("Pesanan belum dapat diproses sampai pembayaran dikonfirmasi.");
      await expect(page.getByTestId("success-amounts")).toContainText(c.due);
      await expect(page.getByText("Bayar sebelum")).toBeVisible();
      await expect(page.locator("main")).not.toContainText(/ldquo|rdquo|Pembayaran Berhasil|Lunas/);
      await expect(page.getByRole("link", { name: c.cta })).toBeVisible();

      // Scenario I: the tracking page reports the same payment state as the success page.
      await page.getByRole("link", { name: "Lacak Pesanan Sekarang" }).click();
      await expect(page.getByTestId("tracking-payment-status")).toHaveText(c.payStatus);
      await expect(page.getByTestId("tracking-status")).toHaveText("Menunggu Pembayaran");
      const panel = page.getByRole("region", { name: "Lakukan Pembayaran" });
      if (c.method === "QRIS") {
        await panel.getByRole("button", { name: "Tampilkan QRIS" }).click();
        await expect(panel.getByTestId("qris-image")).toHaveAttribute("src", /^data:image\/png;base64,/);
        await expect(panel.getByText(`Pembayaran Penuh: ${c.due}`)).toBeVisible();
      } else {
        await expect(panel).toContainText(`Transfer ${c.due} (DP 50%) ke rekening berikut`);
        // The fictitious E2E account from Website Settings (seed --e2e), with a copy action.
        await expect(panel).toContainText("Bank Contoh (E2E) · 0000000000 · a.n. Data Uji E2E");
        await expect(panel.getByRole("button", { name: "Salin nomor rekening Bank Contoh (E2E)" })).toBeVisible();
        await expect(panel.getByText("Unggah bukti transfer").first()).toBeVisible();
        await expect(panel.getByRole("button", { name: "Tampilkan QRIS" })).toHaveCount(0);
      }
    });
  }

  test("QRIS DP (mobile 390px): success shows DP + remaining → QR → verified payment confirms the order → remaining via QRIS → paid", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { orderNumber } = await createOrderViaUi(page, {
      customerName: "Pelanggan QRIS",
      slug: "contoh-cheesecake-stroberi",
      quantity: 1,
      method: "QRIS",
      option: "Bayar DP 50%",
    });
    // Scenario E on the success page: DP due now, remainder later.
    const amounts = page.getByTestId("success-amounts");
    await expect(amounts).toContainText(/DP yang Harus Dibayar\s*Rp112\.500/);
    await expect(amounts).toContainText(/Sisa Pembayaran\s*Rp112\.500/);
    await expect(page.getByTestId("success-payment-status")).toHaveText("Menunggu Pembayaran DP");
    // Scenario J: no horizontal overflow on a phone; the primary CTA is a comfortable tap target.
    await expectNoHorizontalOverflow(page);
    const cta = page.getByRole("link", { name: "Bayar Sekarang dengan QRIS" });
    expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expectNoSeriousAxe(page);
    await cta.click();
    await expect(page.getByTestId("tracking-order-number")).toHaveText(orderNumber);
    await expect(page.getByTestId("tracking-payment-status")).toHaveText("Menunggu Pembayaran DP");
    await expectNoHorizontalOverflow(page);
    const panel = page.getByRole("region", { name: "Lakukan Pembayaran" });
    await panel.getByRole("button", { name: "Tampilkan QRIS" }).click();
    await expect(panel.getByTestId("qris-image")).toBeVisible();
    await expect(panel.getByText("DP 50%: Rp112.500")).toBeVisible();
    await expect(panel.getByText("QRIS berlaku selama")).toBeVisible();
    await expect(panel.getByTestId("qris-countdown")).toHaveText(/^\d{2}:\d{2}$/);
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousAxe(page);

    // Simulated gateway payment → signed webhook through the real verification path.
    await panel.getByRole("button", { name: "Simulasikan Bayar Berhasil" }).click();
    await expect(page.getByTestId("tracking-status")).toContainText("Dikonfirmasi");
    await expect(page.getByTestId("tracking-payment-status")).toHaveText("DP Dibayar");

    const remaining = page.getByRole("region", { name: "Pelunasan" });
    await expect(remaining.getByText("Rp112.500", { exact: false }).first()).toBeVisible();
    await remaining.getByRole("button", { name: "QRIS" }).click();
    await remaining.getByRole("button", { name: "Tampilkan QRIS" }).click();
    await expect(remaining.getByText("Pelunasan: Rp112.500")).toBeVisible();
    await remaining.getByRole("button", { name: "Simulasikan Bayar Berhasil" }).click();
    await expect(page.getByTestId("tracking-payment-status")).toHaveText("Pembayaran Berhasil");
    await expect(page.getByRole("region", { name: "Pelunasan" })).toHaveCount(0);
  });

  test("QRIS failure allows a new QR without extending the deadline", async ({ page }) => {
    const { orderNumber, token } = await createOrderViaUi(page, { customerName: "Pelanggan Gagal", method: "QRIS", option: "Bayar Penuh" });
    await openTracking(page, orderNumber, token);
    const panel = page.getByRole("region", { name: "Lakukan Pembayaran" });
    await panel.getByRole("button", { name: "Tampilkan QRIS" }).click();
    await panel.getByRole("button", { name: "Simulasikan Bayar Gagal" }).click();
    await expect(page.getByTestId("tracking-payment-status")).toHaveText("Pembayaran Gagal");
    await expect(panel.getByText("Pembayaran belum berhasil. Silakan coba kembali.")).toBeVisible();
    await expect(page.getByTestId("tracking-headline")).toHaveText("Pesanan kamu sudah tercatat, tetapi pembayarannya belum berhasil.");
    await expectNoSeriousAxe(page);
    await panel.getByRole("button", { name: "Coba Bayar Lagi" }).click();
    await expect(panel.getByTestId("qris-image")).toBeVisible();
    await expect(page.getByTestId("tracking-status")).toHaveText("Menunggu Pembayaran");
  });

  test("Transfer: upload proof → admin rejects with reason → re-upload → admin approves → Dikonfirmasi", async ({ browser }) => {
    const customer = await (await browser.newContext()).newPage();
    const { orderNumber, token } = await createOrderViaUi(customer, { customerName: "Pelanggan Transfer", method: "Transfer Bank", option: "Bayar Penuh" });
    await openTracking(customer, orderNumber, token);
    const panel = customer.getByRole("region", { name: "Lakukan Pembayaran" });
    await expect(panel.getByText("Bank Contoh (E2E)", { exact: true })).toBeVisible();
    await expectNoSeriousAxe(customer);

    // Wrong type is refused by magic bytes even with a .png name.
    await panel.getByLabel("Unggah bukti transfer").setInputFiles({ name: "bukti.png", mimeType: "image/png", buffer: Buffer.from("<html>bukan gambar</html>") });
    await panel.getByRole("button", { name: "Kirim Bukti Pembayaran" }).click();
    await expect(panel.getByRole("alert")).toHaveText("Format file harus JPG, PNG, atau PDF.");

    await panel.getByLabel("Unggah bukti transfer").setInputFiles({ name: "bukti.png", mimeType: "image/png", buffer: PNG });
    await panel.getByRole("button", { name: "Kirim Bukti Pembayaran" }).click();
    await expect(customer.getByTestId("tracking-payment-status")).toHaveText("Menunggu Verifikasi");

    const admin = await (await browser.newContext()).newPage();
    await loginOrdersAdmin(admin);
    await admin.goto("/admin/pembayaran");
    await expect(admin.getByRole("link", { name: orderNumber })).toBeVisible();
    await expectNoSeriousAxe(admin);

    await openAdminOrder(admin, orderNumber);
    const download = await admin.request.get((await admin.getByRole("link", { name: /Unduh bukti/ }).getAttribute("href"))!);
    expect(download.status()).toBe(200);
    expect(download.headers()["content-disposition"]).toMatch(/^attachment;/);
    expect(download.headers()["x-content-type-options"]).toBe("nosniff");
    expect(download.headers()["content-type"]).toBe("image/png");

    await admin.getByLabel(/Alasan penolakan/).fill("Nominal pada bukti tidak terbaca");
    await admin.getByRole("button", { name: "Tolak Bukti" }).click();
    await expect(admin.getByTestId("proof-item").first()).toContainText("Ditolak");
    await expect(admin.getByText("Alasan penolakan: Nominal pada bukti tidak terbaca")).toBeVisible();

    await customer.reload();
    await expect(customer.getByText("Bukti pembayaran sebelumnya ditolak.")).toBeVisible();
    await expect(customer.getByText("Nominal pada bukti tidak terbaca")).toHaveCount(0);
    await customer.getByLabel("Unggah bukti transfer").setInputFiles({ name: "bukti2.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 bukti") });
    await customer.getByRole("button", { name: "Kirim Bukti Pembayaran" }).click();
    await expect(customer.getByTestId("tracking-payment-status")).toHaveText("Menunggu Verifikasi");

    await admin.reload();
    await admin.getByRole("button", { name: "Setujui Pembayaran" }).click();
    await expect(admin.getByTestId("admin-order-status")).toHaveText("Dikonfirmasi");
    await expect(admin.getByTestId("admin-transactions")).toContainText("Terbayar");

    await customer.reload();
    await expect(customer.getByTestId("tracking-payment-status")).toHaveText("Pembayaran Berhasil");
  });

  test("Cash: admin marks paid at pickup, then the order can be completed", async ({ browser }) => {
    const customer = await (await browser.newContext()).newPage();
    const { orderNumber } = await createOrderViaUi(customer, { customerName: "Pelanggan Cash" });
    const admin = await (await browser.newContext()).newPage();
    await loginOrdersAdmin(admin);
    await openAdminOrder(admin, orderNumber);
    for (const [button, status] of [
      ["Konfirmasi Pesanan", "Dikonfirmasi"],
      ["Proses Pesanan", "Pesanan Diproses"],
      ["Tandai Siap Diambil", "Siap Diambil"],
    ] as const) {
      await admin.getByRole("button", { name: button }).click();
      await expect(admin.getByTestId("admin-order-status")).toHaveText(status);
    }
    await expect(admin.getByRole("button", { name: "Tandai Selesai" })).toHaveCount(0);
    admin.once("dialog", (d) => void d.accept());
    await admin.getByRole("button", { name: "Tandai Lunas (Cash)" }).click();
    await expect(admin.getByTestId("admin-transactions")).toContainText("Cash saat Pickup · Terbayar");
    await admin.getByRole("button", { name: "Tandai Selesai" }).click();
    await expect(admin.getByTestId("admin-order-status")).toHaveText("Selesai");
  });

  test("endpoints refuse unauthenticated or forged requests", async ({ request }) => {
    const forged = await request.post("/api/webhooks/payments/mock", {
      data: { eventId: "evt-x", reference: "MOCK-x", status: "PAID", amount: 1000, paidAt: null },
      headers: { "x-mock-signature": "f".repeat(64) },
    });
    expect(forged.status()).toBe(401);
    expect((await request.post("/api/webhooks/payments/midtrans", { data: {} })).status()).toBe(404);
    const upload = await request.post("/api/uploads/payment-proof", { multipart: { file: { name: "a.png", mimeType: "image/png", buffer: PNG } }, headers: { Origin: "http://localhost:3100" } });
    expect([401, 403]).toContain(upload.status());
    expect((await request.get("/api/admin/files/00000000-0000-4000-8000-000000000000")).status()).toBe(401);
    expect((await request.get("/api/payments/status")).status()).toBe(401);
  });
});
