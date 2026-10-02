import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { redact } from "@/server/observability/logger";
import { PROOF_MAX_BYTES } from "@/server/domain/payments/proof-file";
import { buildContentSecurityPolicy } from "@/proxy";

describe("structured log redaction (plan §39)", () => {
  it("never writes credentials, tracking tokens, contact data, or payloads", () => {
    const out = JSON.stringify(
      redact({
        trackingToken: "abc",
        token: "t",
        password: "p",
        AUTH_SECRET: "s",
        authorization: "Bearer x",
        cookie: "enjua_track=1",
        signature_key: "s1gn4ture-value",
        customerPhone: "+628123",
        whatsapp: "0812",
        email: "a@b.c",
        body: "raw",
        nested: { qrString: "000201", ok: 1 },
        error: new Error("boom"),
      }),
    );
    for (const secret of ["abc", '"t"', '"p"', '"s"', "Bearer x", "enjua_track", "s1gn4ture-value", "+628123", "0812", "a@b.c", "raw", "000201"]) expect(out).not.toContain(secret);
    expect(out).toContain('"ok":1');
    expect(out).toContain("boom");
  });

  it("truncates long strings", () => {
    expect(String(redact("x".repeat(1000))).length).toBeLessThan(320);
  });
});

describe("Content-Security-Policy (plan §30)", () => {
  it("allows scripts only by nonce; no inline/eval in production; no framing", () => {
    const csp = buildContentSecurityPolicy("N0nce", { dev: false, https: true });
    const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).toBe("script-src 'self' 'nonce-N0nce' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(buildContentSecurityPolicy("n", { dev: true, https: false })).toContain("'unsafe-eval'");
  });
});

describe("upload limits fit the Server Action body limit", () => {
  it("product photos and payment proofs (≤ 5 MB) fit next.config bodySizeLimit", async () => {
    const config = readFileSync(path.resolve(__dirname, "../../next.config.ts"), "utf8");
    const mb = Number(/bodySizeLimit:\s*"(\d+)mb"/.exec(config)![1]);
    const { PRODUCT_IMAGE_MAX_BYTES } = await vi.importActual<typeof import("@/server/services/admin-catalog")>("@/server/services/admin-catalog");
    expect(PRODUCT_IMAGE_MAX_BYTES).toBeLessThan(mb * 1024 * 1024 - 64 * 1024);
    expect(PROOF_MAX_BYTES).toBeLessThan(mb * 1024 * 1024 - 64 * 1024);
  });
});

describe("environment guards", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.resetModules();
  });
  const base = { APP_URL: "https://example.test", DATABASE_URL: "postgres://x", AUTH_SECRET: "a".repeat(32), MOCK_PAYMENT_WEBHOOK_SECRET: "m".repeat(16) };

  it("refuses MockProvider in a production build unless explicitly allowed", async () => {
    process.env = { ...base, NODE_ENV: "production", PAYMENT_PROVIDER: "mock" } as NodeJS.ProcessEnv;
    vi.resetModules();
    const { getEnv } = await import("@/server/env");
    expect(() => getEnv()).toThrow(/ALLOW_MOCK_PAYMENTS/);

    process.env = { ...base, NODE_ENV: "production", PAYMENT_PROVIDER: "mock", ALLOW_MOCK_PAYMENTS: "true" } as NodeJS.ProcessEnv;
    vi.resetModules();
    expect((await import("@/server/env")).getEnv().PAYMENT_PROVIDER).toBe("mock");
  });

  it("refuses the mock with PAYMENT_ENV=production even when allowed, and Midtrans without a key", async () => {
    process.env = { ...base, NODE_ENV: "production", PAYMENT_PROVIDER: "mock", PAYMENT_ENV: "production", ALLOW_MOCK_PAYMENTS: "true" } as NodeJS.ProcessEnv;
    vi.resetModules();
    await expect(import("@/server/env").then((m) => m.getEnv())).rejects.toThrow(/MockProvider/);

    process.env = { ...base, NODE_ENV: "development", PAYMENT_PROVIDER: "midtrans" } as NodeJS.ProcessEnv;
    vi.resetModules();
    await expect(import("@/server/env").then((m) => m.getEnv())).rejects.toThrow(/MIDTRANS_SERVER_KEY/);
  });
});
