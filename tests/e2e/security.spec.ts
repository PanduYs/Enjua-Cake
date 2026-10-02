import { expect, test } from "@playwright/test";

import { createOrderViaUi } from "./helpers";

const PUBLIC_PAGES = ["/", "/produk", "/produk/contoh-brownies-cokelat", "/keranjang", "/checkout", "/lacak", "/pesanan/sukses", "/admin/login"];

test.describe("HTTP hardening (plan §30)", () => {
  test("pages send CSP with a per-request nonce and the standard security headers", async ({ request }) => {
    const nonces = new Set<string>();
    for (const path of PUBLIC_PAGES) {
      const res = await request.get(path);
      const h = res.headers();
      const csp = h["content-security-policy"] ?? "";
      expect(csp, path).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
      expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
      expect(csp).toContain("frame-ancestors 'none'");
      nonces.add(/'nonce-([^']+)'/.exec(csp)![1]!);
      expect(h["x-frame-options"]).toBe("DENY");
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(h["strict-transport-security"]).toContain("max-age=");
      expect(h["x-powered-by"]).toBeUndefined();
    }
    expect(nonces.size).toBe(PUBLIC_PAGES.length);
  });

  test("every page has its <title> in the initial HTML head (not streamed later)", async ({ request }) => {
    for (const path of [...PUBLIC_PAGES, "/produk?kategori=cakes"]) {
      const html = await (await request.get(path)).text();
      const head = html.slice(0, html.indexOf("<body"));
      expect(head, path).toMatch(/<title>[^<]+<\/title>/);
    }
  });

  test("no CSP violations or script errors while using the site", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text());
    });
    page.on("pageerror", (e) => problems.push(e.message));
    for (const path of PUBLIC_PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    expect(problems).toEqual([]);
  });

  test("private pages are not cached or indexed; robots.txt hides them", async ({ request }) => {
    for (const path of ["/lacak", "/pesanan/sukses", "/checkout", "/admin/login"]) {
      const res = await request.get(path);
      expect(res.headers()["cache-control"], path).toMatch(/no-store/);
      expect(await res.text(), path).toMatch(/<meta name="robots" content="noindex/);
    }
    const robots = await (await request.get("/robots.txt")).text();
    for (const p of ["/admin", "/api", "/lacak", "/pesanan", "/checkout"]) expect(robots).toContain(`Disallow: ${p}`);
  });

  test("API endpoints refuse oversized or unbounded bodies", async ({ request, baseURL }) => {
    const big = "x".repeat(70 * 1024);
    expect((await request.post("/api/tracking", { data: big, headers: { Origin: baseURL!, "content-type": "application/json" } })).status()).toBe(413);
    expect((await request.post("/api/webhooks/payments/mock", { data: big, headers: { "content-type": "application/json" } })).status()).toBe(413);

    // Chunked upload without Content-Length is refused before any body is read.
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("--x\r\n"));
        controller.close();
      },
    });
    const res = await fetch(`${baseURL}/api/uploads/payment-proof`, {
      method: "POST",
      body: stream,
      headers: { Origin: baseURL!, "content-type": "multipart/form-data; boundary=x" },
      duplex: "half",
    } as RequestInit);
    expect(res.status).toBe(411);
  });

  test("tracking cookie is HttpOnly + SameSite=Lax; the access code never appears in the URL, page HTML, or WhatsApp links", async ({ page, context }) => {
    const { orderNumber, token } = await createOrderViaUi(page, { customerName: "Pelanggan Keamanan" });
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.getByRole("link", { name: "Lacak Pesanan Sekarang" }).click();
    await expect(page.getByTestId("tracking-order-number")).toHaveText(orderNumber);

    expect(page.url()).not.toContain(token);
    expect(requests.filter((u) => u.includes(token))).toEqual([]); // the fragment never reaches the server
    expect(await page.content()).not.toContain(token);
    for (const href of await page.locator('a[href*="wa.me"]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href))) expect(decodeURIComponent(href)).not.toContain(token);
    const cookie = (await context.cookies()).find((c) => c.name === "enjua_track")!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
    expect(cookie.value).not.toContain(token);
  });

  test("a tracking session cannot read another order's payment status or upload to it", async ({ browser }) => {
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();
    const first = await createOrderViaUi(a, { customerName: "Pelanggan A", method: "Transfer Bank", option: "Bayar Penuh" });
    await createOrderViaUi(b, { customerName: "Pelanggan B" });
    await a.goto(`/lacak#o=${first.orderNumber}&t=${first.token}`);
    await expect(a.getByTestId("tracking-order-number")).toHaveText(first.orderNumber);
    // B has no session for A's order: status polling and upload are refused.
    expect((await b.request.get("/api/payments/status")).status()).toBe(401);
    const upload = await b.request.post("/api/uploads/payment-proof", {
      headers: { Origin: new URL(b.url()).origin },
      multipart: { file: { name: "x.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") } },
    });
    expect(upload.status()).toBe(401);
    // A forged cookie value is rejected (HMAC).
    await b.context().addCookies([{ name: "enjua_track", value: "00000000-0000-4000-8000-000000000000.abcdef0123456789.9999999999999.forged", url: new URL(b.url()).origin }]);
    expect((await b.request.get("/api/payments/status")).status()).toBe(401);
  });

  test("keyboard: skip link is the first focus stop and focus is visible", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toHaveText("Lewati ke konten");
    const outline = await focused.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#konten$/);
  });

  test("unknown routes and errors show friendly Indonesian messages without technical details", async ({ request }) => {
    const res = await request.get("/halaman-yang-tidak-ada");
    expect(res.status()).toBe(404);
    const html = await res.text();
    expect(html).toContain("Halaman tidak ditemukan");
    expect(html).not.toMatch(/at\s+\S+\s+\(.*:\d+:\d+\)/); // no stack traces
  });
});
