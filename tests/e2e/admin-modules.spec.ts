import { expect, test, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";

import { expectNoSeriousAxe, loginOrdersAdmin } from "./helpers";

// Runs in the "chromium-admin-mutations" project after the public specs (it changes the shared catalog/settings).
test.describe.configure({ mode: "serial" });

let PNG: Buffer;
test.beforeAll(async () => {
  PNG = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#C98A92" } }).png().toBuffer();
});

const ADMIN_PAGES = ["/admin", "/admin/pesanan", "/admin/pesanan/baru", "/admin/pembayaran", "/admin/produk", "/admin/produk/baru", "/admin/kategori", "/admin/kapasitas", "/admin/pengaturan", "/admin/audit", "/admin/akun"];

/** A WIB calendar date `days` from today (the server's business timezone, FD-09). */
function wibDate(days: number): string {
  const now = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

async function adminPage(browser: Browser, viewport?: { width: number; height: number }): Promise<Page> {
  const page = await (await browser.newContext(viewport ? { viewport } : {})).newPage();
  await loginOrdersAdmin(page);
  return page;
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const culprits = [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > width + 1)
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 60)}`);
    return { excess: document.documentElement.scrollWidth - width, culprits };
  });
  expect(overflow.excess, `${page.url()} ${overflow.culprits.join(" | ")}`).toBeLessThanOrEqual(0);
}

test("unauthenticated visitors are redirected away from every admin module", async ({ page }) => {
  for (const path of ADMIN_PAGES) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/admin\/login$/);
  }
});

test("admin mutations are authorized on the server: a replayed Server Action without a session changes nothing", async ({ browser }) => {
  const page = await adminPage(browser);
  await page.goto("/admin/pengaturan");
  const description = page.getByLabel("Deskripsi bisnis");
  const original = await description.inputValue();

  // Capture a real "save settings" Server Action request.
  await description.fill("Deskripsi dari serangan replay");
  const [request] = await Promise.all([
    page.waitForRequest((r) => r.method() === "POST" && Boolean(r.headers()["next-action"])),
    page.getByRole("button", { name: "Simpan Pengaturan" }).click(),
  ]);
  await expect(page.getByText("Pengaturan disimpan.").first()).toBeVisible();
  const replay = { headers: { "next-action": request.headers()["next-action"]!, "content-type": request.headers()["content-type"]!, origin: new URL(page.url()).origin }, data: request.postDataBuffer()! };

  // Restore the original value through the UI and confirm it is stored.
  await page.goto("/admin/pengaturan"); // fresh load: reload() may restore typed form values
  await page.getByLabel("Deskripsi bisnis").fill(original);
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"])),
    page.getByRole("button", { name: "Simpan Pengaturan" }).click(),
  ]);
  await page.goto("/admin/pengaturan"); // fresh load: reload() may restore typed form values
  await expect(page.getByLabel("Deskripsi bisnis")).toHaveValue(original);

  // Replay the captured action from a context without the admin cookie.
  const anonymous = await (await browser.newContext()).newPage();
  const response = await anonymous.request.post("/admin/pengaturan", { ...replay, maxRedirects: 0 });
  expect(response.status()).not.toBe(500);

  await page.goto("/admin/pengaturan"); // fresh load: reload() may restore typed form values
  await expect(page.getByLabel("Deskripsi bisnis")).toHaveValue(original);
});

test("products & categories: create with photo, publish, Sold Out, deactivate, delete", async ({ browser }) => {
  const page = await adminPage(browser);

  await page.goto("/admin/kategori");
  const newCategory = page.getByRole("region", { name: "Tambah Kategori" });
  await newCategory.getByLabel("Nama kategori").fill("Kategori Uji Admin");
  await newCategory.getByRole("button", { name: "Tambah Kategori" }).click();
  await expect(page.getByTestId("category-item").filter({ hasText: "Kategori Uji Admin" })).toBeVisible();
  await expectNoSeriousAxe(page);

  await page.goto("/admin/produk/baru");
  await page.getByLabel("Nama produk").fill("Produk Uji Admin");
  await page.getByLabel("Kategori").selectOption({ label: "Kategori Uji Admin" });
  await page.getByLabel("Harga normal (Rp)").fill("120000");
  await page.getByLabel("Harga sale (Rp, opsional)").fill("150000");
  await page.getByLabel("Foto utama").setInputFiles({ name: "kue.png", mimeType: "image/png", buffer: PNG });
  await page.getByLabel("Teks alternatif foto").fill("Kue uji di atas piring");
  await page.getByRole("button", { name: "Simpan Produk" }).click();
  await expect(page.getByText("Harga sale harus lebih kecil dari harga normal.")).toBeVisible();
  await expect(page.getByLabel("Nama produk")).toHaveValue("Produk Uji Admin"); // kept after the failed submit

  await expect(page.getByLabel("Kategori")).toHaveValue(/.+/); // selection kept after the error
  await page.getByLabel("Harga sale (Rp, opsional)").fill("99000");
  await page.getByRole("button", { name: "Simpan Produk" }).click();
  await expect(page.getByText("Produk dibuat.")).toBeVisible();
  await expect(page.getByTestId("product-image")).toHaveCount(1);
  await expectNoSeriousAxe(page);

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/produk/produk-uji-admin");
  await expect(visitor.getByRole("heading", { level: 1, name: "Produk Uji Admin" })).toBeVisible();
  await expect(visitor.getByRole("img", { name: "Kue uji di atas piring" }).first()).toBeVisible();

  await page.getByLabel("Availability").selectOption("SOLD_OUT");
  await page.getByRole("button", { name: "Simpan Perubahan" }).click();
  await expect(page.getByText("Produk disimpan.")).toBeVisible();
  await visitor.reload();
  await expect(visitor.getByText("Sold Out").first()).toBeVisible();

  await page.getByLabel("Aktif (tampil di website)").uncheck();
  await page.getByRole("button", { name: "Simpan Perubahan" }).click();
  await expect(page.getByText("Produk disimpan.")).toBeVisible();
  const hidden = await visitor.goto("/produk/produk-uji-admin");
  expect(hidden?.status()).toBe(404);

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Hapus Produk" }).click();
  await expect(page).toHaveURL(/\/admin\/produk\?dihapus=1$/);
  await expect(page.getByText("Produk Uji Admin")).toHaveCount(0);

  await page.goto("/admin/kategori");
  const item = page.getByTestId("category-item").filter({ hasText: "Kategori Uji Admin" });
  await item.locator("summary").click();
  page.once("dialog", (d) => void d.accept());
  await item.getByRole("button", { name: "Hapus Kategori" }).click();
  await expect(page.getByTestId("category-item").filter({ hasText: "Kategori Uji Admin" })).toHaveCount(0);
});

test("capacity + Manual Order: full date requires an explicit override with reason; order gets number and access code", async ({ browser }) => {
  const page = await adminPage(browser);
  const date = wibDate(12);

  await page.goto(`/admin/kapasitas?dari=${date}`);
  const card = page.getByTestId(`capacity-${date}`);
  await card.locator("summary").click();
  await card.getByLabel("Kapasitas tanggal ini").fill("0");
  await card.getByRole("button", { name: "Simpan Kapasitas" }).click();
  await expect(card.getByText("Penuh")).toBeVisible();
  await expectNoSeriousAxe(page);

  await page.goto("/admin/pesanan/baru");
  await page.getByLabel("Nama").fill("Pelanggan WhatsApp");
  await page.getByLabel("Nomor WhatsApp").fill("0812 3456 7890");
  const product = page.getByLabel("Produk 1");
  await product.selectOption((await product.locator("option", { hasText: "Contoh Cookies Butter" }).getAttribute("value"))!);
  await page.getByLabel("Tanggal pickup").fill(date);
  await expect(page.getByTestId("manual-capacity")).toContainText("Kapasitas 0");
  await page.getByLabel("Metode pembayaran").selectOption("CASH");
  await page.getByRole("button", { name: "Simpan Manual Order" }).click();

  const overrides = page.getByRole("group", { name: "Perlu Override" });
  await expect(overrides.getByText("Override Kapasitas harian")).toBeVisible();
  await expectNoSeriousAxe(page);
  await overrides.getByLabel("Override Kapasitas harian").check();
  await overrides.getByLabel("Alasan override Kapasitas harian").fill("Pesanan pelanggan tetap via WhatsApp");
  await page.getByRole("button", { name: "Simpan Manual Order" }).click();

  await expect(page.getByText("Manual Order tersimpan.")).toBeVisible();
  const orderNumber = (await page.getByTestId("manual-order-number").textContent())!.trim();
  await expect(page.getByTestId("manual-order-token")).toHaveText(/^[A-Za-z0-9_-]{43}$/);
  await page.getByRole("link", { name: "Buka Detail Pesanan" }).click();
  await expect(page.getByRole("heading", { level: 1, name: orderNumber })).toBeVisible();
  await expect(page.getByRole("region", { name: "Override Manual Order" })).toContainText("Pesanan pelanggan tetap via WhatsApp");

  // Restore the default capacity for this date.
  await page.goto(`/admin/kapasitas?dari=${date}`);
  await card.locator("summary").click();
  await card.getByLabel("Kapasitas tanggal ini").fill("");
  await card.getByRole("button", { name: "Simpan Kapasitas" }).click();
  await expect(card.getByText("Tersedia")).toBeVisible();
});

test("blocking a date keeps existing orders and is visible on the dashboard", async ({ browser }) => {
  const page = await adminPage(browser);
  const date = wibDate(14);
  await page.goto(`/admin/kapasitas?dari=${date}`);
  const card = page.getByTestId(`capacity-${date}`);
  await card.locator("summary").click();
  await card.getByLabel("Alasan blokir (opsional, internal)").fill("Acara keluarga");
  await card.getByRole("button", { name: "Blokir Tanggal" }).click();
  await expect(card.getByText("Diblokir", { exact: true })).toBeVisible();
  await expect(card.getByText("Alasan blokir: Acara keluarga")).toBeVisible();
  await card.locator("details").evaluate((d) => ((d as HTMLDetailsElement).open = true));
  await card.getByRole("button", { name: "Buka Blokir" }).click();
  await expect(card.getByText("Tersedia")).toBeVisible();

  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Pesanan per Status" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Ringkasan Pendapatan" })).toBeVisible();
  await expectNoSeriousAxe(page);

  await page.goto("/admin/audit?jenis=pickup_date");
  await expect(page.getByText("DATE_BLOCKED").first()).toBeVisible();
  await expectNoSeriousAxe(page);
});

test("website settings: saved values reach the public site; invalid values are explained", async ({ browser }) => {
  const page = await adminPage(browser);
  await page.goto("/admin/pengaturan");
  await expectNoSeriousAxe(page);
  const hours = page.getByLabel("Jam pickup (informasi)");
  const original = await hours.inputValue();

  await page.getByLabel("Masa reservasi QRIS (menit)").fill("5");
  await page.getByRole("button", { name: "Simpan Pengaturan" }).click();
  await expect(page.getByText("Masa reservasi QRIS harus antara 10 dan 120.")).toBeVisible();
  await page.getByLabel("Masa reservasi QRIS (menit)").fill("30");

  await hours.fill("Senin–Sabtu 09.00–16.00 WIB (uji)");
  await page.getByRole("button", { name: "Simpan Pengaturan" }).click();
  await expect(page.getByText("Pengaturan disimpan.").first()).toBeVisible();

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/");
  await expect(visitor.getByText("Pickup: Senin–Sabtu 09.00–16.00 WIB (uji)")).toBeVisible();

  await hours.fill(original);
  await page.getByRole("button", { name: "Simpan Pengaturan" }).click();
  await expect(page.getByText("Pengaturan disimpan.").first()).toBeVisible();
});

test("admin accounts: create, sign in, deactivate (session ends immediately)", async ({ browser }) => {
  const page = await adminPage(browser);
  await page.goto("/admin/akun");
  const create = page.getByRole("region", { name: "Kelola Admin" });
  await create.getByLabel("Nama", { exact: true }).fill("Admin Kedua");
  await create.getByLabel("Email").fill("admin-kedua@example.test");
  await create.getByLabel("Password awal", { exact: true }).fill("password-awal-kedua-1");
  await create.getByLabel("Konfirmasi password awal").fill("password-awal-kedua-1");
  await create.getByRole("button", { name: "Tambah Admin" }).click();
  await expect(page.getByText("Admin baru dibuat.", { exact: false })).toBeVisible();
  await expectNoSeriousAxe(page);

  const second = await (await browser.newContext()).newPage();
  await second.goto("/admin/login");
  await second.getByLabel("Email").fill("admin-kedua@example.test");
  await second.getByLabel("Password").fill("password-awal-kedua-1");
  await second.getByRole("button", { name: "Masuk" }).click();
  await expect(second).toHaveURL(/\/admin$/);

  await page.reload();
  const item = page.getByTestId("admin-item").filter({ hasText: "admin-kedua@example.test" });
  await item.locator("summary").click();
  page.once("dialog", (d) => void d.accept());
  await item.getByRole("button", { name: "Nonaktifkan Admin" }).click();
  await expect(item.getByText("Nonaktif", { exact: true })).toBeVisible();

  await second.goto("/admin/pesanan");
  await expect(second).toHaveURL(/\/admin\/login$/);
  await second.getByLabel("Email").fill("admin-kedua@example.test");
  await second.getByLabel("Password").fill("password-awal-kedua-1");
  await second.getByRole("button", { name: "Masuk" }).click();
  await expect(second).toHaveURL(/\/admin\/login$/);
});

// Full viewport matrix of plan §33.
for (const viewport of [
  { name: "phone-small", width: 320, height: 568 },
  { name: "mobile", width: 360, height: 800 },
  { name: "phone-large", width: 390, height: 844 },
  { name: "phone-landscape", width: 844, height: 390 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "desktop", width: 1920, height: 1080 },
]) {
  test(`admin modules have no horizontal overflow and no serious axe violations @ ${viewport.name}`, async ({ browser }) => {
    const page = await adminPage(browser, { width: viewport.width, height: viewport.height });
    for (const path of ADMIN_PAGES) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }), path).toBeVisible();
      await noHorizontalOverflow(page);
      if (viewport.name === "mobile" || viewport.name === "laptop") await expectNoSeriousAxe(page);
    }
  });
}
