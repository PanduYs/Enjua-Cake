import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { findDestructiveStatements } from "@/server/ops/migration-guard";
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
