import { expect, test } from "@playwright/test";

test.describe("Beranda", () => {
  test("renders hero, featured, categories, sections, and contact from settings", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page).toHaveTitle(/Enjua Cake's/);

    const featured = page.getByRole("region", { name: "Produk Unggulan" });
    await expect(featured.getByRole("article")).toHaveCount(4); // inactive featured product excluded
    await expect(featured.getByText("Contoh Produk Nonaktif")).toHaveCount(0);

    const categories = page.getByRole("region", { name: "Kategori" });
    await expect(categories.getByRole("link")).toHaveCount(4);
    await expect(categories.getByRole("link", { name: /Custom Cake/ })).toHaveAttribute("href", "/produk?kategori=custom-cake");

    for (const name of ["Cara Pesan", "Kontak"]) {
      await expect(page.getByRole("heading", { level: 2, name, exact: true })).toBeVisible();
    }
    // About was removed at the client's request: no section, no anchor, no nav link anywhere.
    await expect(page.getByRole("heading", { name: "Tentang Kami" })).toHaveCount(0);
    await expect(page.locator("#tentang-kami, a[href*='tentang-kami']")).toHaveCount(0);
    await expect(page.getByText("sebelum pukul 15:00 WIB")).toBeVisible();
    await expect(page.getByRole("region", { name: "Kontak" }).getByText("Alamat pickup contoh (data E2E)")).toBeVisible();
  });

  test("hero: full-width editorial hero, two-line headline, both CTAs, no circular photo", async ({ page }) => {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const hero = page.getByRole("region", { name: "Kue Buatan Tangan untuk Momen Manismu" });
      const box = (await hero.boundingBox())!;
      expect(box.width).toBe(width); // full bleed
      expect(box.height).toBeLessThan(900); // never a full screen of scrolling before the products
      const lines = await page.locator("#hero-title").evaluate((h) => Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)));
      expect(lines).toBe(2);
      await expect(hero.getByRole("link", { name: "Pesan Sekarang" })).toHaveAttribute("href", "/produk");
      await expect(hero.getByRole("link", { name: "Lihat Produk" })).toHaveAttribute("href", "/produk");
      await expect(hero.locator("img.rounded-full")).toHaveCount(0);
    }
  });

  test("hero parallax moves only with motion allowed; reduced motion keeps it still", async ({ browser }) => {
    for (const reducedMotion of ["no-preference", "reduce"] as const) {
      const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion })).newPage();
      await page.goto("/");
      await page.mouse.wheel(0, 300);
      const transform = () => page.locator(".enjua-parallax").evaluate((el) => getComputedStyle(el).transform);
      if (reducedMotion === "reduce") {
        await page.waitForTimeout(300);
        expect(await transform()).toBe("none");
      } else {
        await expect.poll(transform).not.toBe("none");
      }
      await page.context().close();
    }
  });

  test("mobile categories: a swipeable rail that never widens the page and stays keyboard reachable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const rail = page.getByRole("region", { name: "Kategori" }).getByRole("list");
    expect(await rail.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    const last = rail.getByRole("link").last();
    await last.focus();
    await expect(last).toBeInViewport();
  });

  test("floating WhatsApp uses wa.me with a pre-filled message and no token", async ({ page }) => {
    await page.goto("/");
    const link = page.getByRole("link", { name: /WhatsApp \(membuka aplikasi WhatsApp\)/ });
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^https:\/\/wa\.me\/6281234567890\?text=/);
    expect(decodeURIComponent(href!.split("text=")[1]!)).toBe("Halo Enjua Cake's, saya ingin bertanya.");
    await expect(link).toHaveAttribute("rel", /noopener/);
  });
});

test.describe("Katalog", () => {
  test("lists active products, shows Sold Out, and filters by category", async ({ page }) => {
    await page.goto("/produk");
    await expect(page.getByRole("heading", { level: 1, name: "Produk" })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(7);
    await expect(page.getByText("7 produk")).toBeVisible();

    const pudding = page.getByRole("article").filter({ hasText: "Contoh Pudding Karamel" });
    await expect(pudding.getByText("Sold Out", { exact: true })).toBeVisible();
    await expect(pudding.getByText("Ready Stock", { exact: true })).toBeVisible();

    const cheesecake = page.getByRole("article").filter({ hasText: "Contoh Cheesecake Stroberi" });
    await expect(cheesecake.getByText("Pre-Order", { exact: true })).toBeVisible();
    await expect(cheesecake.getByText("Pesan minimal 2 hari sebelum pickup")).toBeVisible();
    await expect(cheesecake.getByText("-10%")).toBeVisible();

    const filters = page.getByRole("navigation", { name: "Filter kategori" });
    await filters.getByRole("link", { name: "Cookies" }).click();
    await expect(page).toHaveURL(/\/produk\?kategori=cookies$/);
    await expect(page.getByRole("heading", { level: 1, name: "Cookies" })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(filters.getByRole("link", { name: "Cookies" })).toHaveAttribute("aria-current", "page");
  });

  test("unknown category shows a clear empty state", async ({ page }) => {
    await page.goto("/produk?kategori=tidak-ada");
    await expect(page.getByText("Kategori tidak ditemukan.")).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(0);
  });
});

test.describe("Detail produk", () => {
  test("shows product information and a working gallery", async ({ page }) => {
    await page.goto("/produk");
    await page.getByRole("link", { name: "Contoh Brownies Cokelat" }).click();
    await expect(page).toHaveURL(/\/produk\/contoh-brownies-cokelat$/);
    await expect(page.getByRole("heading", { level: 1, name: "Contoh Brownies Cokelat" })).toBeVisible();
    await expect(page.getByText("Rp85.000")).toBeVisible();
    await expect(page.getByText("Tersedia", { exact: true })).toBeVisible();

    const thumbs = page.getByRole("list", { name: "Foto lainnya" }).getByRole("button");
    await expect(thumbs).toHaveCount(3);
    await expect(thumbs.nth(0)).toHaveAttribute("aria-pressed", "true");
    await thumbs.nth(2).click();
    await expect(thumbs.nth(2)).toHaveAttribute("aria-pressed", "true");
    await expect(thumbs.nth(0)).toHaveAttribute("aria-pressed", "false");
  });

  test("Sold Out product stays visible and is marked unavailable", async ({ page }) => {
    await page.goto("/produk/contoh-pudding-karamel");
    await expect(page.getByText("Sold Out — saat ini tidak dapat dipesan")).toBeVisible();
  });

  test("shows Pre-Order lead time and per-order maximum", async ({ page }) => {
    await page.goto("/produk/contoh-kue-ulang-tahun");
    await expect(page.getByText("Pesan minimal 3 hari sebelum pickup")).toBeVisible();
    await expect(page.getByText("Maksimal per pesanan:")).toBeVisible();
  });

  test("inactive and unknown products return 404", async ({ page }) => {
    for (const slug of ["contoh-produk-nonaktif", "tidak-ada"]) {
      const response = await page.goto(`/produk/${slug}`);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { name: "Halaman tidak ditemukan" })).toBeVisible();
    }
  });
});

test.describe("Navigasi", () => {
  test("desktop shows full navigation without search (FD-92, FD-94)", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Navigasi utama" });
    for (const label of ["Beranda", "Produk", "Cara Pesan", "Lacak Pesanan", "Kontak"]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }
    await expect(nav.getByRole("link", { name: "Tentang Kami" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Keranjang/ })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: "Pesan Sekarang" })).toBeVisible();
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Buka menu" })).toBeHidden();
  });

  test("mobile drawer is keyboard operable and closes with Escape", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Navigasi utama" })).toBeHidden();
    const toggle = page.getByRole("button", { name: "Buka menu" });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Tutup menu" })).toHaveAttribute("aria-expanded", "true");
    const menu = page.getByRole("navigation", { name: "Menu utama" });
    await expect(menu.getByRole("link", { name: "Lacak Pesanan" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Beranda" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(page.getByRole("button", { name: "Buka menu" })).toBeFocused();
  });

  test("mobile drawer really covers the screen and every item can be tapped (backdrop-filter regression)", async ({ browser }) => {
    // The header's backdrop-filter used to become the drawer's containing block: the menu opened
    // as a ~49 px strip with every item but the first clipped, although aria-expanded was true.
    for (const viewport of [{ width: 360, height: 740 }, { width: 412, height: 915 }]) {
      const page = await (await browser.newContext({ viewport, isMobile: true, hasTouch: true })).newPage();
      await page.goto("/");
      await page.getByRole("button", { name: "Buka menu" }).tap();
      const menu = page.getByRole("navigation", { name: "Menu utama" });
      const panel = page.locator(`[id="${await page.getByRole("button", { name: "Tutup menu" }).getAttribute("aria-controls")}"]`);
      await panel.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      const box = (await panel.boundingBox())!;
      expect(box.y).toBe(64);
      expect(box.height).toBe(viewport.height - 64);
      for (const link of await menu.getByRole("link").all()) await expect(link).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

      await menu.getByRole("link", { name: "Cara Pesan" }).tap();
      await expect(menu).toBeHidden();
      await expect(page.getByRole("heading", { level: 2, name: "Cara Pesan" })).toBeInViewport();
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
      await page.context().close();
    }
  });

  test("cart, checkout and tracking pages are reachable and not indexed", async ({ page }) => {
    for (const [path, heading] of [["/keranjang", "Keranjang"], ["/checkout", "Checkout"], ["/lacak", "Lacak Pesanan"]] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    }
  });
});

test.describe("SEO & storage", () => {
  test("sitemap lists active products only; robots blocks admin", async ({ request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("/produk/contoh-brownies-cokelat");
    expect(sitemap).not.toContain("contoh-produk-nonaktif");
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Disallow: \/admin/);
    expect(robots).toMatch(/Sitemap: http:\/\/localhost:\d+\/sitemap\.xml/);
  });

  test("public images are served immutable; invalid or missing keys are 404", async ({ page, request }) => {
    await page.goto("/produk/contoh-brownies-cokelat");
    const src = await page.locator("main img").first().getAttribute("src");
    const storagePath = decodeURIComponent(new URL(src!, "http://x").searchParams.get("url") ?? src!);
    const image = await request.get(storagePath);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/webp");
    expect(image.headers()["cache-control"]).toContain("immutable");
    expect((await request.get("/storage/products/does-not-exist.webp")).status()).toBe(404);
    expect((await request.get("/storage/..%2F..%2Fpackage.json")).status()).toBe(404);
    expect((await request.get("/storage/payment-proofs/x.pdf")).status()).toBe(404);
  });
});
