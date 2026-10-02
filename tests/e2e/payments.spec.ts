import { expect, test, type Page } from "@playwright/test";

import { createOrderViaUi, expectNoSeriousAxe, loginOrdersAdmin } from "./helpers";

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
  test("QRIS DP: show QR → verified payment confirms the order → remaining via QRIS → Lunas", async ({ page }) => {
    const { orderNumber, token } = await createOrderViaUi(page, {
      customerName: "Pelanggan QRIS",
      slug: "contoh-cheesecake-stroberi",
      quantity: 1,
      method: "QRIS",
      option: "Bayar DP 50%",
    });
    await openTracking(page, orderNumber, token);
    const panel = page.getByRole("region", { name: "Lakukan Pembayaran" });
    await panel.getByRole("button", { name: "Tampilkan QRIS" }).click();
    await expect(panel.getByTestId("qris-image")).toBeVisible();
    await expect(panel.getByText("DP 50%: Rp112.500")).toBeVisible();
    await expectNoSeriousAxe(page);

    // Simulated gateway payment → signed webhook through the real verification path.
    await panel.getByRole("button", { name: "Simulasikan Bayar Berhasil" }).click();
    await expect(page.getByTestId("tracking-status")).toContainText("Dikonfirmasi");
    await expect(page.getByTestId("tracking-payment-status")).toHaveText("DP Terbayar");

    const remaining = page.getByRole("region", { name: "Pelunasan" });
    await expect(remaining.getByText("Rp112.500", { exact: false }).first()).toBeVisible();
    await remaining.getByRole("button", { name: "QRIS" }).click();
    await remaining.getByRole("button", { name: "Tampilkan QRIS" }).click();
    await expect(remaining.getByText("Pelunasan: Rp112.500")).toBeVisible();
    await remaining.getByRole("button", { name: "Simulasikan Bayar Berhasil" }).click();
    await expect(page.getByTestId("tracking-payment-status")).toHaveText("Lunas");
    await expect(page.getByRole("region", { name: "Pelunasan" })).toHaveCount(0);
  });

  test("QRIS failure allows a new QR without extending the deadline", async ({ page }) => {
    const { orderNumber, token } = await createOrderViaUi(page, { customerName: "Pelanggan Gagal", method: "QRIS", option: "Bayar Penuh" });
    await openTracking(page, orderNumber, token);
    const panel = page.getByRole("region", { name: "Lakukan Pembayaran" });
    await panel.getByRole("button", { name: "Tampilkan QRIS" }).click();
    await panel.getByRole("button", { name: "Simulasikan Bayar Gagal" }).click();
    await expect(page.getByTestId("tracking-payment-status")).toHaveText("Pembayaran Gagal");
    await expect(panel.getByText("Pembayaran QRIS sebelumnya gagal")).toBeVisible();
    await panel.getByRole("button", { name: "Buat QRIS Baru" }).click();
    await expect(panel.getByTestId("qris-image")).toBeVisible();
    await expect(page.getByTestId("tracking-status")).toContainText("Pesanan Baru");
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
    await expect(customer.getByTestId("tracking-payment-status")).toHaveText("Lunas");
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
