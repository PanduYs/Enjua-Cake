/**
 * Deployment preflight (plan §36–§37). Checks names, presence and shape of the
 * environment for a target — never prints values. Pure: pass any env record.
 */
export type Target = "production" | "staging";
export interface PreflightResult {
  errors: string[];
  warnings: string[];
}

const EXAMPLE_SECRETS = new Set(["", "changeme", "secret", "e2e-only-secret-not-for-production-0123456789"]);
const STORAGE_KEYS = ["STORAGE_ENDPOINT", "STORAGE_REGION", "STORAGE_ACCESS_KEY_ID", "STORAGE_SECRET_ACCESS_KEY", "STORAGE_PUBLIC_BUCKET", "STORAGE_PRIVATE_BUCKET"] as const;

function isLocalHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export function preflight(env: Record<string, string | undefined>, target: Target): PreflightResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const get = (k: string) => env[k]?.trim() ?? "";
  const need = (k: string, why: string) => {
    if (!get(k)) errors.push(`${k} is missing (${why})`);
  };

  // Application & secrets
  need("APP_URL", "public base URL");
  if (get("APP_URL") && !get("APP_URL").startsWith("https://")) errors.push("APP_URL must use https:// (secure cookies, HSTS)");
  need("DATABASE_URL", "PostgreSQL connection");
  if (get("DATABASE_URL") && isLocalHost(get("DATABASE_URL"))) errors.push(`DATABASE_URL points to localhost; use the ${target} database`);
  if (get("DATABASE_URL") && !isLocalHost(get("DATABASE_URL")) && !/sslmode=(require|verify-full|verify-ca)/.test(get("DATABASE_URL"))) {
    warnings.push("DATABASE_URL has no sslmode=require — confirm the provider enforces TLS");
  }
  need("AUTH_SECRET", "session signing");
  if (get("AUTH_SECRET") && (get("AUTH_SECRET").length < 32 || EXAMPLE_SECRETS.has(get("AUTH_SECRET")))) errors.push("AUTH_SECRET must be a fresh random value of at least 32 characters");
  need("CRON_SECRET", "reservation-expiry sweeper (TD-07)");
  if (get("CRON_SECRET") && get("CRON_SECRET").length < 32) errors.push("CRON_SECRET must be at least 32 random characters");
  if (get("AUTH_SECRET") && get("AUTH_SECRET") === get("CRON_SECRET")) errors.push("AUTH_SECRET and CRON_SECRET must be different");
  for (const key of Object.keys(env)) {
    if (key.startsWith("NEXT_PUBLIC_") && /SECRET|KEY|TOKEN|PASSWORD|DATABASE/i.test(key)) errors.push(`${key} would expose a secret to the browser (no NEXT_PUBLIC_ secrets, §37)`);
  }

  // Payments (TD-08)
  const provider = get("PAYMENT_PROVIDER") || "mock";
  const paymentEnv = get("PAYMENT_ENV") || "sandbox";
  if (provider === "mock") {
    if (target === "production") errors.push("PAYMENT_PROVIDER=mock is not allowed in production (use midtrans with production credentials)");
    else if (get("ALLOW_MOCK_PAYMENTS") !== "true") errors.push("staging with MockProvider needs ALLOW_MOCK_PAYMENTS=true (or configure the Midtrans sandbox)");
    else warnings.push("staging uses MockProvider — real sandbox validation (PRD §60) is still pending");
  } else if (provider === "midtrans") {
    need("MIDTRANS_SERVER_KEY", "Midtrans credential");
    const key = get("MIDTRANS_SERVER_KEY");
    const sandboxKey = key.startsWith("SB-");
    if (target === "production" && paymentEnv !== "production") errors.push("production requires PAYMENT_ENV=production");
    if (target === "staging" && paymentEnv !== "sandbox") errors.push("staging must use PAYMENT_ENV=sandbox");
    if (key && paymentEnv === "production" && sandboxKey) errors.push("MIDTRANS_SERVER_KEY is a sandbox key but PAYMENT_ENV=production");
    if (key && paymentEnv === "sandbox" && !sandboxKey) errors.push("PAYMENT_ENV=sandbox but MIDTRANS_SERVER_KEY is not a sandbox (SB-) key");
  } else {
    errors.push(`PAYMENT_PROVIDER=${provider} is not supported`);
  }
  if (target === "production" && get("ALLOW_MOCK_PAYMENTS") === "true") errors.push("ALLOW_MOCK_PAYMENTS must not be true in production");

  // Storage (TD-16)
  const driver = get("STORAGE_DRIVER") || "local";
  if (driver === "s3") {
    for (const k of STORAGE_KEYS) need(k, "S3-compatible storage");
    if (get("STORAGE_PUBLIC_BUCKET") && get("STORAGE_PUBLIC_BUCKET") === get("STORAGE_PRIVATE_BUCKET")) errors.push("public and private buckets must be different (FD-51)");
  } else if (driver === "local") {
    warnings.push("STORAGE_DRIVER=local: only valid on a single server with a persistent, backed-up volume (TD-17 Opsi B); serverless hosting needs s3");
  } else {
    errors.push(`STORAGE_DRIVER=${driver} is not supported`);
  }

  if (get("LOG_LEVEL") === "debug" || get("LOG_LEVEL") === "trace") warnings.push("LOG_LEVEL is verbose for production");
  return { errors, warnings };
}
