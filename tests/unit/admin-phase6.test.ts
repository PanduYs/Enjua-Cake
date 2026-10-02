import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { productFormSchema, slugify } from "@/lib/validation/admin-catalog";
import { settingsFormSchema, settingsFormToObject } from "@/lib/validation/admin-settings";
import { pickupWindow } from "@/server/domain/checkout/pickup-date";
import { evaluateManualPickupDate } from "@/server/domain/orders/manual-overrides";
import { parseIsoDate, parseTimeOfDay } from "@/server/domain/time/wib";

const cutoff = parseTimeOfDay("15:00");
const morning = new Date("2026-10-02T03:00:00Z"); // 10:00 WIB
const afternoon = new Date("2026-10-02T09:00:00Z"); // 16:00 WIB, after cutoff
const facts = (over: Partial<{ isBlocked: boolean; capacity: number; used: number }> = {}) => ({ isBlocked: false, capacity: 10, used: 0, ...over });
const evaluate = (now: Date, date: string, minDays: number, f = facts(), horizon = 60) =>
  evaluateManualPickupDate(parseIsoDate(date), pickupWindow({ now, cutoff, bookingHorizonDays: horizon, maxPreorderDays: minDays }), { cutoff, minPreorderDays: minDays, facts: f });
const types = (r: ReturnType<typeof evaluate>) => (r.ok ? r.required.map((x) => x.type).sort() : r.blocker);

describe("Manual Order overrides (FD-119, plan §22)", () => {
  it("needs nothing when the website rules pass", () => {
    expect(types(evaluate(morning, "2026-10-02", 0))).toEqual([]);
    expect(types(evaluate(morning, "2026-10-04", 2))).toEqual([]);
  });

  it("identifies each overridable rule with before/after values", () => {
    expect(evaluate(morning, "2026-10-03", 2)).toEqual({
      ok: true,
      required: [{ type: "MIN_PREORDER_DAYS", before: { earliestDate: "2026-10-04", minDays: 2 }, after: { pickupDate: "2026-10-03" } }],
    });
    expect(evaluate(afternoon, "2026-10-02", 0)).toEqual({
      ok: true,
      required: [{ type: "PICKUP_CUTOFF", before: { cutoff: "15:00", earliestDate: "2026-10-03" }, after: { pickupDate: "2026-10-02" } }],
    });
    expect(evaluate(morning, "2026-12-10", 0)).toEqual({
      ok: true,
      required: [{ type: "BOOKING_HORIZON", before: { latestDate: "2026-12-01" }, after: { pickupDate: "2026-12-10" } }],
    });
    expect(evaluate(morning, "2026-10-05", 0, facts({ capacity: 10, used: 10 }))).toEqual({
      ok: true,
      required: [{ type: "DAILY_CAPACITY", before: { capacity: 10, used: 10 }, after: { used: 11 } }],
    });
  });

  it("uses the smallest set: after cutoff a Pre-Order date one day short needs only the cutoff override", () => {
    // earliest without cutoff = 10-02 + 2 = 10-04; with cutoff = 10-05.
    expect(types(evaluate(afternoon, "2026-10-04", 2))).toEqual(["PICKUP_CUTOFF"]);
    expect(types(evaluate(afternoon, "2026-10-03", 2))).toEqual(["MIN_PREORDER_DAYS"]);
    expect(types(evaluate(afternoon, "2026-10-02", 2))).toEqual(["MIN_PREORDER_DAYS", "PICKUP_CUTOFF"]);
    expect(types(evaluate(afternoon, "2026-10-02", 2, facts({ used: 10 })))).toEqual(["DAILY_CAPACITY", "MIN_PREORDER_DAYS", "PICKUP_CUTOFF"]);
  });

  it("never allows past or blocked dates", () => {
    expect(evaluate(morning, "2026-10-01", 0)).toEqual({ ok: false, blocker: "PAST_DATE" });
    expect(evaluate(morning, "2026-10-05", 0, facts({ isBlocked: true }))).toEqual({ ok: false, blocker: "BLOCKED" });
  });
});

describe("admin form schemas", () => {
  it("slugifies Indonesian names", () => {
    expect(slugify("Kue Ulang Tahun — Spesial!")).toBe("kue-ulang-tahun-spesial");
    expect(slugify("Crème Brûlée")).toBe("creme-brulee");
    expect(slugify("!!!")).toBe("");
  });

  it("validates product rules: sale < price, Pre-Order needs minimum days, Ready Stock drops it", () => {
    const base = { name: "Brownies", slug: "", description: "", categoryId: "8b0f4c1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f", price: "85.000", salePrice: "", productType: "READY_STOCK", minimumPreorderDays: "3", availability: "AVAILABLE", maxQuantityPerOrder: "", isFeatured: "on", isActive: "" };
    expect(productFormSchema.parse(base)).toMatchObject({ price: 85_000, salePrice: null, minimumPreorderDays: null, isFeatured: true, isActive: false });
    expect(productFormSchema.safeParse({ ...base, salePrice: "85000" }).success).toBe(false);
    expect(productFormSchema.safeParse({ ...base, productType: "PRE_ORDER", minimumPreorderDays: "" }).success).toBe(false);
    expect(productFormSchema.safeParse({ ...base, price: "abc" }).success).toBe(false);
    expect(productFormSchema.safeParse({ ...base, slug: "Bad Slug" }).success).toBe(false);
  });

  it("parses settings with indexed rows and never invents values", () => {
    const fd = new FormData();
    const values: Record<string, string> = {
      business_name: "Enjua Cake's",
      business_description: "",
      address: "",
      whatsapp_number: "",
      operating_hours: "",
      pickup_hours: "",
      pickup_instructions: "",
      payment_instructions: "",
      pickup_cutoff: "15:00",
      default_capacity: "10",
      booking_horizon_days: "60",
      qris_reservation_minutes: "30",
      transfer_reservation_minutes: "120",
      "bank_accounts.0.bankName": "",
      "bank_accounts.0.accountNumber": "",
      "bank_accounts.0.accountHolder": "",
      "social_links.0.label": "Instagram",
      "social_links.0.url": "https://instagram.com/contoh",
    };
    for (const [k, v] of Object.entries(values)) fd.set(k, v);
    const parsed = settingsFormSchema.parse(settingsFormToObject(fd));
    expect(parsed).toMatchObject({ address: null, whatsapp_number: null, bank_accounts: [], social_links: [{ label: "Instagram", url: "https://instagram.com/contoh" }], policy_links: [] });

    expect(settingsFormSchema.safeParse({ ...settingsFormToObject(fd), qris_reservation_minutes: "5" }).success).toBe(false); // TD-18 bounds
    expect(settingsFormSchema.safeParse({ ...settingsFormToObject(fd), pickup_cutoff: "25:00" }).success).toBe(false);
    expect(settingsFormSchema.safeParse({ ...settingsFormToObject(fd), whatsapp_number: "021555" }).success).toBe(false);
    fd.set("bank_accounts.0.bankName", "Bank X");
    expect(settingsFormSchema.safeParse(settingsFormToObject(fd)).success).toBe(false); // incomplete bank row
  });
});

describe("server-side authorization of admin mutations (PRD §29)", () => {
  const root = path.resolve(__dirname, "../../src/app/admin/(protected)");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "actions.ts" || name === "page.tsx") files.push(full);
    }
  };
  walk(root);

  it("every admin server action calls requireAdmin() before doing anything else", () => {
    const actions = files.filter((f) => f.endsWith("actions.ts"));
    expect(actions.length).toBeGreaterThanOrEqual(6);
    for (const file of actions) {
      const source = readFileSync(file, "utf8");
      expect(source.startsWith('"use server";'), file).toBe(true);
      const bodies = source.split(/\nexport async function /).slice(1);
      expect(bodies.length, file).toBeGreaterThan(0);
      for (const body of bodies) {
        const name = body.slice(0, body.indexOf("("));
        const firstStatement = body.slice(body.indexOf("{") + 1).trim().split("\n")[0]!;
        if (name === "logoutAction") continue; // logout works without a valid session by design
        expect(firstStatement, `${path.basename(path.dirname(file))}/${name}`).toMatch(/await requireAdmin\(\)/);
      }
    }
  });

  it("every admin page calls requireAdmin()", () => {
    for (const file of files.filter((f) => f.endsWith("page.tsx"))) {
      expect(readFileSync(file, "utf8"), file).toMatch(/await requireAdmin\(\)/);
    }
  });
});
