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

  const s3 = {
    STORAGE_DRIVER: "s3",
    STORAGE_ENDPOINT: "https://s3.example.test",
    STORAGE_REGION: "auto",
    STORAGE_ACCESS_KEY_ID: "key-id",
    STORAGE_SECRET_ACCESS_KEY: "secret-key",
    STORAGE_PUBLIC_BUCKET: "public",
    STORAGE_PRIVATE_BUCKET: "private",
  };
  const live = { ...base, ...s3, NODE_ENV: "production", VERCEL_ENV: "production", PAYMENT_PROVIDER: "midtrans", PAYMENT_ENV: "production", MIDTRANS_SERVER_KEY: "Mid-server-live" };
  const envWith = async (env: Record<string, string | undefined>) => {
    process.env = env as NodeJS.ProcessEnv;
    vi.resetModules();
    return (await import("@/server/env")).getEnv();
  };

  it("the live site (Vercel Production) accepts real Midtrans + S3 + https", async () => {
    expect(await envWith(live)).toMatchObject({ PAYMENT_PROVIDER: "midtrans", PAYMENT_ENV: "production", STORAGE_DRIVER: "s3", APP_URL: "https://example.test" });
  });

  it("C-3: the live site refuses Midtrans sandbox and the mock, even when the mock is allowed", async () => {
    await expect(envWith({ ...live, PAYMENT_ENV: "sandbox", MIDTRANS_SERVER_KEY: "SB-Mid-server-test" })).rejects.toThrow(/PAYMENT_ENV=production/);
    await expect(envWith({ ...live, PAYMENT_PROVIDER: "mock", PAYMENT_ENV: "sandbox", ALLOW_MOCK_PAYMENTS: "true" })).rejects.toThrow(/PAYMENT_PROVIDER=midtrans/);
  });

  it("C-4: the live site refuses local storage, explicit or by default", async () => {
    await expect(envWith({ ...live, STORAGE_DRIVER: "local" })).rejects.toThrow(/STORAGE_DRIVER=s3/);
    await expect(envWith({ ...live, STORAGE_DRIVER: undefined })).rejects.toThrow(/STORAGE_DRIVER=s3/);
  });

  it("C-5: the live site refuses a non-https APP_URL", async () => {
    await expect(envWith({ ...live, APP_URL: "http://localhost:3000" })).rejects.toThrow(/https/);
  });

  it("staging (Vercel Preview), E2E/CI production builds and development keep sandbox, mock and local storage", async () => {
    // Staging on Vercel Preview: Midtrans sandbox with local or S3 storage.
    expect((await envWith({ ...base, NODE_ENV: "production", VERCEL_ENV: "preview", PAYMENT_PROVIDER: "midtrans", PAYMENT_ENV: "sandbox", MIDTRANS_SERVER_KEY: "SB-Mid-server-test" })).PAYMENT_ENV).toBe(
      "sandbox",
    );
    // E2E/CI: `next start` (production build) outside Vercel with the mock, local storage and http.
    expect(
      await envWith({ ...base, APP_URL: "http://localhost:3100", NODE_ENV: "production", PAYMENT_PROVIDER: "mock", ALLOW_MOCK_PAYMENTS: "true", STORAGE_DRIVER: "local" }),
    ).toMatchObject({ STORAGE_DRIVER: "local", PAYMENT_PROVIDER: "mock" });
    // Development, even if VERCEL_ENV leaks in (e.g. `vercel env pull`): unchanged.
    expect((await envWith({ ...base, APP_URL: "http://localhost:3000", NODE_ENV: "development", VERCEL_ENV: "production" })).STORAGE_DRIVER).toBe("local");
  });
});

describe("C-5: metadataBase comes from the validated APP_URL", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.resetModules();
  });

  it("uses APP_URL and never falls back to localhost", async () => {
    process.env = { NODE_ENV: "test", APP_URL: "https://enjuacake.example", DATABASE_URL: "postgres://x", AUTH_SECRET: "a".repeat(32), MOCK_PAYMENT_WEBHOOK_SECRET: "m".repeat(16) } as NodeJS.ProcessEnv;
    vi.resetModules();
    const { generateMetadata } = await import("@/app/layout");
    expect(String(generateMetadata().metadataBase)).toBe("https://enjuacake.example/");

    process.env = { NODE_ENV: "test", DATABASE_URL: "postgres://x", AUTH_SECRET: "a".repeat(32) } as NodeJS.ProcessEnv;
    vi.resetModules();
    const layout = await import("@/app/layout");
    expect(() => layout.generateMetadata()).toThrow(/APP_URL/);
  });
});
