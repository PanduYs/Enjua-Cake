import "server-only";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  PAYMENT_PROVIDER: z.enum(["mock"]).default("mock"),
  PAYMENT_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  MOCK_PAYMENT_WEBHOOK_SECRET: z.string().min(16).optional(),
  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().min(1).default(".storage"),
  CRON_SECRET: z.string().min(16).optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
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
    if (parsed.data.NODE_ENV === "production" && parsed.data.PAYMENT_ENV === "production" && parsed.data.PAYMENT_PROVIDER === "mock") {
      throw new Error("MockProvider must not be used with PAYMENT_ENV=production");
    }
    cached = parsed.data;
  }
  return cached;
}
