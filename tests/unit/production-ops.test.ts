import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { findDestructiveStatements } from "@/server/ops/migration-guard";
import { describeDatabaseTarget, describeFailure, secretsFromEnv, summarizeReconcile } from "@/server/ops/reconcile";
import { preflight } from "@/server/ops/preflight";

describe("migration guard (plan §36.1 forward-only)", () => {
  it("flags destructive SQL unless a reviewed marker precedes it", () => {
    const sql = ['CREATE TABLE "x" ("id" int);', 'ALTER TABLE "x" DROP COLUMN "y";', "-- allow-destructive: column unused since v1.2, backed up", 'DROP TABLE "old";', "TRUNCATE orders;"].join("\n");
    expect(findDestructiveStatements("0001.sql", sql).map((f) => f.line)).toEqual([2, 5]);
    expect(findDestructiveStatements("0002.sql", 'ALTER TABLE "orders" ADD COLUMN "z" text;')).toEqual([]);
    expect(findDestructiveStatements("0003.sql", 'ALTER TABLE "a" ALTER COLUMN "b" TYPE bigint;')).toHaveLength(1);
  });
});

// Shape-only dummies; not real credentials.
const strong = (c: string) => c.repeat(40);
const prod = {
  APP_URL: "https://toko.example",
  DATABASE_URL: "postgres://u:p@db.example:5432/app?sslmode=require",
  AUTH_SECRET: strong("a"),
  CRON_SECRET: strong("c"),
  PAYMENT_PROVIDER: "midtrans",
  PAYMENT_ENV: "production",
  MIDTRANS_SERVER_KEY: "Mid-server-dummy",
  STORAGE_DRIVER: "s3",
  STORAGE_ENDPOINT: "https://s3.example",
  STORAGE_REGION: "auto",
  STORAGE_ACCESS_KEY_ID: "id",
  STORAGE_SECRET_ACCESS_KEY: "secret",
  STORAGE_PUBLIC_BUCKET: "pub",
  STORAGE_PRIVATE_BUCKET: "priv",
};

describe("deployment preflight (plan §37)", () => {
  it("accepts a complete production environment", () => {
    expect(preflight(prod, "production")).toEqual({ errors: [], warnings: [] });
  });

  it("blocks the unsafe combinations", () => {
    const errs = (env: Record<string, string | undefined>, t: "production" | "staging" = "production") => preflight(env, t).errors.join(" | ");
    expect(errs({ ...prod, PAYMENT_PROVIDER: "mock" })).toMatch(/mock is not allowed in production/);
    expect(errs({ ...prod, MIDTRANS_SERVER_KEY: "SB-Mid-server-dummy" })).toMatch(/sandbox key but PAYMENT_ENV=production/);
    expect(errs({ ...prod, PAYMENT_ENV: "sandbox", MIDTRANS_SERVER_KEY: "Mid-server-x" }, "staging")).toMatch(/not a sandbox/);
    expect(errs({ ...prod, ALLOW_MOCK_PAYMENTS: "true" })).toMatch(/ALLOW_MOCK_PAYMENTS/);
    expect(errs({ ...prod, APP_URL: "http://toko.example" })).toMatch(/https/);
    expect(errs({ ...prod, DATABASE_URL: "postgres://u:p@localhost/app" })).toMatch(/localhost/);
    expect(errs({ ...prod, AUTH_SECRET: "short" })).toMatch(/AUTH_SECRET/);
    expect(errs({ ...prod, CRON_SECRET: undefined })).toMatch(/CRON_SECRET is missing/);
    expect(errs({ ...prod, CRON_SECRET: prod.AUTH_SECRET })).toMatch(/must be different/);
    expect(errs({ ...prod, STORAGE_PRIVATE_BUCKET: "pub" })).toMatch(/buckets must be different/);
    expect(errs({ ...prod, STORAGE_SECRET_ACCESS_KEY: "" })).toMatch(/STORAGE_SECRET_ACCESS_KEY is missing/);
    expect(errs({ ...prod, NEXT_PUBLIC_MIDTRANS_SERVER_KEY: "x" })).toMatch(/NEXT_PUBLIC_/);
  });

  it("staging may use the mock only explicitly, and says sandbox validation is pending", () => {
    const staging = { ...prod, PAYMENT_PROVIDER: "mock", PAYMENT_ENV: "sandbox", MIDTRANS_SERVER_KEY: undefined };
    expect(preflight(staging, "staging").errors.join()).toMatch(/ALLOW_MOCK_PAYMENTS=true/);
    const allowed = preflight({ ...staging, ALLOW_MOCK_PAYMENTS: "true" }, "staging");
    expect(allowed.errors).toEqual([]);
    expect(allowed.warnings.join()).toMatch(/sandbox validation \(PRD §60\) is still pending/);
  });

  it("warns about local storage and missing TLS, never echoing values", () => {
    const r = preflight({ ...prod, STORAGE_DRIVER: "local", DATABASE_URL: "postgres://u:p4ssw0rd@db.example/app" }, "production");
    expect(r.warnings.join()).toMatch(/persistent/);
    expect(r.warnings.join()).toMatch(/sslmode/);
    expect(JSON.stringify(r)).not.toContain("p4ssw0rd");
  });
});

describe("Vercel Cron fits the Hobby plan (at most once per day)", () => {
  it("every cron runs at a fixed minute and hour, and the sweeper is configured", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: Array<{ path: string; schedule: string }> };
    expect(config.crons.map((c) => c.path)).toContain("/api/cron/expire-reservations");
    for (const { schedule } of config.crons) {
      const [minute, hour, ...rest] = schedule.trim().split(/\s+/);
      expect(rest).toHaveLength(3);
      // "*/5", "*", ranges or lists would run more than once a day and fail a Hobby deployment.
      expect(minute).toMatch(/^\d{1,2}$/);
      expect(hour).toMatch(/^\d{1,2}$/);
    }
  });
});

describe("Vercel Functions run next to the database", () => {
  it("pins the single function region to Singapore (sin1), where Supabase PostgreSQL and Storage live", () => {
    // The default (iad1) puts ~250 ms between every query and the database in ap-southeast-1.
    // Hobby allows exactly one region; more would fail the deployment before the build.
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as { regions?: string[] };
    expect(config.regions).toEqual(["sin1"]);
  });
});

describe("payments:reconcile output (safe diagnostics, empty window)", () => {
  // Test-only fake values.
  const env = {
    DATABASE_URL: "postgresql://postgres.abcdefghijkl:p%40ss-W0rd-x@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
    MIDTRANS_SERVER_KEY: "SB-Mid-server-TEST-ONLY-fake",
    AUTH_SECRET: "auth-secret-test-only-0123456789abcdef",
  } as unknown as NodeJS.ProcessEnv;

  it("names the database without credentials", () => {
    expect(describeDatabaseTarget(env.DATABASE_URL!)).toBe("aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres");
    expect(describeDatabaseTarget("not a url")).toBe("(unparseable DATABASE_URL)");
  });

  it("shows the PostgreSQL code hidden in the Drizzle cause, and never a secret", () => {
    const pg = Object.assign(new Error('password authentication failed for user "postgres"'), { name: "PostgresError", code: "28P01" });
    const drizzle = Object.assign(new Error('Failed query: select "payment_transactions"."id" from "payment_transactions"\nparams: QRIS,midtrans'), { name: "DrizzleQueryError", cause: pg });
    expect(describeFailure(drizzle, secretsFromEnv(env))).toEqual([
      'error: DrizzleQueryError: Failed query: select "payment_transactions"."id" from "payment_transactions"',
      'cause: PostgresError [28P01]: password authentication failed for user "postgres"',
    ]);

    const leaky = Object.assign(new Error(`connect failed for ${env.DATABASE_URL} using ${env.MIDTRANS_SERVER_KEY} and p@ss-W0rd-x`), {
      cause: new Error(`Basic ${Buffer.from(`${env.MIDTRANS_SERVER_KEY}:`).toString("base64")} rejected; auth ${env.AUTH_SECRET}`),
    });
    const printed = describeFailure(leaky, secretsFromEnv(env)).join("\n");
    for (const secret of ["p%40ss-W0rd-x", "p@ss-W0rd-x", "SB-Mid-server-TEST-ONLY-fake", env.AUTH_SECRET!, Buffer.from(`${env.MIDTRANS_SERVER_KEY}:`).toString("base64")]) {
      expect(printed).not.toContain(secret);
    }
    expect(printed).toContain("[redacted]");
    // Credentials in any URL are removed even when the value is not a configured secret.
    expect(describeFailure(new Error("bad url postgres://someone:hunter22@db.example:5432/x"), [])).toEqual(["error: Error: bad url postgres://someone:[redacted]@db.example:5432/x"]);
  });

  it("an empty window is not a success unless explicitly allowed", () => {
    expect(summarizeReconcile([])).toEqual({ checked: 0, mismatches: 0, unchecked: 0, empty: true, exitCode: 1 });
    expect(summarizeReconcile([], { allowEmpty: true })).toEqual({ checked: 0, mismatches: 0, unchecked: 0, empty: true, exitCode: 0 });
    const ok = { transactionId: "t", orderNumber: "ENC-1", amount: 10_000, dbStatus: "EXPIRED", providerStatus: "EXPIRED", mismatch: false };
    expect(summarizeReconcile([ok])).toEqual({ checked: 1, mismatches: 0, unchecked: 0, empty: false, exitCode: 0 });
    expect(summarizeReconcile([{ ...ok, providerStatus: "PAID", mismatch: true }], { allowEmpty: true }).exitCode).toBe(1);
  });
});

