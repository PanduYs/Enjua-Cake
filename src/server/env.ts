import "server-only";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  PAYMENT_PROVIDER: z.enum(["mock", "midtrans"]).default("mock"),
  PAYMENT_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  MOCK_PAYMENT_WEBHOOK_SECRET: z.string().min(16).optional(),
  /** Required to run MockProvider in a production build (E2E/staging only). */
  ALLOW_MOCK_PAYMENTS: z.enum(["true", "false"]).default("false"),
  /** Midtrans server key for the environment in PAYMENT_ENV (sandbox key for development/staging). */
  MIDTRANS_SERVER_KEY: z.string().min(1).optional(),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().min(1).default(".storage"),
  /** S3-compatible object storage (TD-16): required when STORAGE_DRIVER=s3. */
  STORAGE_ENDPOINT: z.url().optional(),
  STORAGE_REGION: z.string().min(1).optional(),
  STORAGE_ACCESS_KEY_ID: z.string().min(1).optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  STORAGE_PUBLIC_BUCKET: z.string().min(1).optional(),
  STORAGE_PRIVATE_BUCKET: z.string().min(1).optional(),
  /** Connection pool size per server instance (serverless: keep small and use the provider's pooler). */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  CRON_SECRET: z.string().min(16).optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  /** Set by Vercel: "production" only on the live site's Production deployment (staging uses Preview). */
  VERCEL_ENV: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Validated server environment. Read lazily so that `next build` of static pages
 * does not require runtime secrets.
 */
export function getEnv(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid server environment: ${issues}`);
    }
    // The live site (Vercel Production deployment) must take real payments, keep files in
    // object storage and use its public https URL — the same rules as `preflight --target=production`.
    // NODE_ENV alone cannot tell it apart: E2E (`next start`) and staging (Vercel Preview) are production builds too.
    if (parsed.data.NODE_ENV === "production" && parsed.data.VERCEL_ENV === "production") {
      if (parsed.data.PAYMENT_PROVIDER !== "midtrans" || parsed.data.PAYMENT_ENV !== "production") {
        throw new Error("Vercel Production requires PAYMENT_PROVIDER=midtrans with PAYMENT_ENV=production (sandbox and mock are for Preview/staging)");
      }
      if (parsed.data.STORAGE_DRIVER !== "s3") throw new Error("Vercel Production requires STORAGE_DRIVER=s3 (the local filesystem is not persistent)");
      if (!parsed.data.APP_URL.startsWith("https://")) throw new Error("Vercel Production requires APP_URL to be the public https:// URL");
    }
    if (parsed.data.NODE_ENV === "production" && parsed.data.PAYMENT_ENV === "production" && parsed.data.PAYMENT_PROVIDER === "mock") {
      throw new Error("MockProvider must not be used with PAYMENT_ENV=production");
    }
    // Defense in depth: the mock lets anyone "pay" from the tracking page, so a
    // production build refuses it unless explicitly allowed (E2E / staging UAT).
    if (parsed.data.NODE_ENV === "production" && parsed.data.PAYMENT_PROVIDER === "mock" && parsed.data.ALLOW_MOCK_PAYMENTS !== "true") {
      throw new Error("PAYMENT_PROVIDER=mock in a production build requires ALLOW_MOCK_PAYMENTS=true (never on the live site)");
    }
    if (parsed.data.STORAGE_DRIVER === "s3") {
      const missing = (["STORAGE_ENDPOINT", "STORAGE_REGION", "STORAGE_ACCESS_KEY_ID", "STORAGE_SECRET_ACCESS_KEY", "STORAGE_PUBLIC_BUCKET", "STORAGE_PRIVATE_BUCKET"] as const).filter(
        (key) => !parsed.data[key],
      );
      if (missing.length) throw new Error(`STORAGE_DRIVER=s3 requires: ${missing.join(", ")}`);
    }
    if (parsed.data.PAYMENT_PROVIDER === "midtrans" && !parsed.data.MIDTRANS_SERVER_KEY) {
      throw new Error("MIDTRANS_SERVER_KEY is required when PAYMENT_PROVIDER=midtrans");
    }
    cached = parsed.data;
  }
  return cached;
}
