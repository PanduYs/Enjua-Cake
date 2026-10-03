import { describe, expect, it } from "vitest";

import {
  datesInWindow,
  effectiveCapacity,
  effectiveOrderDate,
  evaluatePickupDate,
  maxPreorderDays,
  pickupWindow,
  type PickupWindow,
} from "@/server/domain/checkout/pickup-date";
import { parseIsoDate, parseTimeOfDay, type IsoDate } from "@/server/domain/time/wib";

const cutoff = parseTimeOfDay("15:00");
const d = (v: string) => parseIsoDate(v);
/** WIB wall-clock → instant (UTC+7). */
const wib = (date: string, time: string) => new Date(`${date}T${time}+07:00`);
const open = { isBlocked: false, capacity: 10, used: 0 };

const window = (now: Date, days: number, horizon = 60): PickupWindow =>
  pickupWindow({ now, cutoff, bookingHorizonDays: horizon, maxPreorderDays: days });

describe("effective order date and cutoff (FD-19..21, FD-108)", () => {
  it("before cutoff counts as today; at/after cutoff counts as tomorrow", () => {
    expect(effectiveOrderDate(wib("2026-10-02", "14:59:59"), cutoff)).toBe("2026-10-02");
    expect(effectiveOrderDate(wib("2026-10-02", "15:00:00"), cutoff)).toBe("2026-10-03");
    expect(effectiveOrderDate(wib("2026-10-02", "23:59:59"), cutoff)).toBe("2026-10-03");
    expect(effectiveOrderDate(wib("2026-12-31", "16:00:00"), cutoff)).toBe("2027-01-01");
  });

  it("Ready Stock-only: same-day before cutoff, next day after", () => {
    expect(window(wib("2026-10-02", "10:00:00"), 0).earliestDate).toBe("2026-10-02");
    const after = window(wib("2026-10-02", "16:00:00"), 0);
    expect(after.earliestDate).toBe("2026-10-03");
    expect(evaluatePickupDate(d("2026-10-02"), after, open)).toEqual({ date: "2026-10-02", available: false, reason: "CUTOFF_PASSED" });
  });

  it("Pre-Order counts from the effective date (DI-03 amended)", () => {
    expect(window(wib("2026-10-02", "14:00:00"), 3).earliestDate).toBe("2026-10-05");
    expect(window(wib("2026-10-02", "16:00:00"), 3).earliestDate).toBe("2026-10-06");
  });
});

describe("mixed carts (FD-18)", () => {
  it("uses the longest Pre-Order minimum, ignoring Ready Stock", () => {
    expect(
      maxPreorderDays([
        { productType: "READY_STOCK", minimumPreorderDays: null },
        { productType: "PRE_ORDER", minimumPreorderDays: 1 },
        { productType: "PRE_ORDER", minimumPreorderDays: 3 },
      ]),
    ).toBe(3);
    expect(maxPreorderDays([{ productType: "READY_STOCK", minimumPreorderDays: null }])).toBe(0);
    expect(maxPreorderDays([])).toBe(0);
  });
});

describe("booking horizon (FD-08)", () => {
  it("spans today..today+60 inclusive, measured from today not the effective date", () => {
    const w = window(wib("2026-10-02", "16:00:00"), 0);
    expect(w.latestDate).toBe("2026-12-01");
    const dates = datesInWindow(w);
    expect(dates).toHaveLength(61);
    expect(dates[0]).toBe("2026-10-02");
    expect(dates.at(-1)).toBe("2026-12-01");
    expect(evaluatePickupDate(d("2026-12-02"), w, open)).toMatchObject({ available: false, reason: "OUTSIDE_HORIZON" });
    expect(evaluatePickupDate(d("2026-10-01"), w, open)).toMatchObject({ available: false, reason: "PAST_DATE" });
  });

  it("supports a configurable horizon", () => {
    expect(window(wib("2026-10-02", "09:00:00"), 0, 7).latestDate).toBe("2026-10-09");
  });
});

describe("evaluatePickupDate check order (IMPLEMENTATION-PLAN §12)", () => {
  const w = window(wib("2026-10-02", "10:00:00"), 2); // earliest 2026-10-04
  const date = (v: string) => v as IsoDate;

  it("lead time beats blocked/full", () => {
    expect(evaluatePickupDate(date("2026-10-03"), w, { isBlocked: true, capacity: 0, used: 0 })).toMatchObject({ reason: "PREORDER_MIN_NOT_MET" });
  });
  it("blocked beats full", () => {
    expect(evaluatePickupDate(date("2026-10-04"), w, { isBlocked: true, capacity: 10, used: 10 })).toMatchObject({ reason: "BLOCKED" });
  });
  it("full when used >= capacity (including overbooked)", () => {
    expect(evaluatePickupDate(date("2026-10-04"), w, { isBlocked: false, capacity: 10, used: 10 })).toMatchObject({ reason: "FULL" });
    expect(evaluatePickupDate(date("2026-10-04"), w, { isBlocked: false, capacity: 10, used: 11 })).toMatchObject({ reason: "FULL" });
    expect(evaluatePickupDate(date("2026-10-04"), w, { isBlocked: false, capacity: 0, used: 0 })).toMatchObject({ reason: "FULL" });
  });
  it("available with remaining slots", () => {
    expect(evaluatePickupDate(date("2026-10-04"), w, { isBlocked: false, capacity: 10, used: 9 })).toEqual({ date: "2026-10-04", available: true, remaining: 1 });
  });
});

describe("capacity", () => {
  it("override wins over default (FD-07)", () => {
    expect(effectiveCapacity(null, 10)).toBe(10);
    expect(effectiveCapacity(15, 10)).toBe(15);
    expect(effectiveCapacity(0, 10)).toBe(0);
  });
  it("rejects invalid window parameters", () => {
    expect(() => pickupWindow({ now: new Date(), cutoff, bookingHorizonDays: -1, maxPreorderDays: 0 })).toThrow(RangeError);
    expect(() => pickupWindow({ now: new Date(), cutoff, bookingHorizonDays: 60, maxPreorderDays: 1.5 })).toThrow(RangeError);
  });
});

describe("checkout date matrix — cutoff/midnight boundaries in WIB (FD-17, FD-19..21, FD-108)", () => {
  // [WIB wall clock, effective order date, earliest Ready Stock, earliest Pre-Order (3 days)]
  const cases: ReadonlyArray<readonly [string, string, string, string, string]> = [
    ["one minute before cutoff", "2026-10-02T14:59:00", "2026-10-02", "2026-10-02", "2026-10-05"],
    ["one millisecond before cutoff", "2026-10-02T14:59:59.999", "2026-10-02", "2026-10-02", "2026-10-05"],
    ["exactly at cutoff", "2026-10-02T15:00:00", "2026-10-03", "2026-10-03", "2026-10-06"],
    ["one minute after cutoff", "2026-10-02T15:01:00", "2026-10-03", "2026-10-03", "2026-10-06"],
    ["23:59 WIB", "2026-10-02T23:59:00", "2026-10-03", "2026-10-03", "2026-10-06"],
    ["00:00 WIB (new calendar day, before cutoff)", "2026-10-03T00:00:00", "2026-10-03", "2026-10-03", "2026-10-06"],
  ];

  it.each(cases)("%s", (_label, wall, effective, earliestReady, earliestPreorder) => {
    const now = new Date(`${wall}+07:00`);
    expect(effectiveOrderDate(now, cutoff)).toBe(effective);
    expect(window(now, 0).earliestDate).toBe(earliestReady);
    const pre = window(now, 3);
    expect(pre.earliestDate).toBe(earliestPreorder);
    // The day before the earliest date is refused with the reason the customer sees.
    const dayBefore = d(new Date(Date.parse(`${earliestPreorder}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10));
    expect(evaluatePickupDate(dayBefore, pre, open)).toMatchObject({ available: false, reason: "PREORDER_MIN_NOT_MET" });
    expect(evaluatePickupDate(d(earliestPreorder), pre, open)).toMatchObject({ available: true });
  });

  it("23:59 WIB is 16:59 UTC the same day and 00:00 WIB is 17:00 UTC the previous day — WIB, not UTC, decides", () => {
    // A UTC-based implementation would call 2026-10-02T17:00Z "2 October" and allow same-day pickup on the 2nd.
    const midnightWib = new Date("2026-10-02T17:00:00Z");
    expect(window(midnightWib, 0).today).toBe("2026-10-03");
    expect(evaluatePickupDate(d("2026-10-02"), window(midnightWib, 0), open)).toMatchObject({ available: false, reason: "PAST_DATE" });
  });
});

describe("checkout date matrix — Pre-Order minimum, horizon, past dates", () => {
  const now = wib("2026-10-02", "10:00:00");

  it("exactly the minimum is accepted; one day earlier is refused; later is accepted", () => {
    const w = window(now, 2);
    expect(evaluatePickupDate(d("2026-10-03"), w, open)).toMatchObject({ available: false, reason: "PREORDER_MIN_NOT_MET" });
    expect(evaluatePickupDate(d("2026-10-04"), w, open)).toMatchObject({ available: true });
    expect(evaluatePickupDate(d("2026-10-20"), w, open)).toMatchObject({ available: true });
  });

  it("the longest minimum governs a cart with two Pre-Order products (1 and 3 days)", () => {
    const days = maxPreorderDays([
      { productType: "PRE_ORDER", minimumPreorderDays: 1 },
      { productType: "PRE_ORDER", minimumPreorderDays: 3 },
    ]);
    const w = window(now, days);
    expect(evaluatePickupDate(d("2026-10-03"), w, open)).toMatchObject({ available: false, reason: "PREORDER_MIN_NOT_MET" });
    expect(evaluatePickupDate(d("2026-10-04"), w, open)).toMatchObject({ available: false, reason: "PREORDER_MIN_NOT_MET" });
    expect(evaluatePickupDate(d("2026-10-05"), w, open)).toMatchObject({ available: true });
  });

  it("horizon: day 60 accepted, day 61 refused, for Ready Stock and Pre-Order alike", () => {
    for (const days of [0, 3]) {
      const w = window(now, days);
      expect(evaluatePickupDate(d("2026-12-01"), w, open)).toMatchObject({ available: true });
      expect(evaluatePickupDate(d("2026-12-02"), w, open)).toMatchObject({ available: false, reason: "OUTSIDE_HORIZON" });
    }
  });

  it("a minimum longer than the horizon leaves no selectable date", () => {
    const w = window(now, 61);
    expect(datesInWindow(w).map((date) => evaluatePickupDate(date, w, open)).filter((s) => s.available)).toEqual([]);
  });

  it("past dates are refused even when open", () => {
    expect(evaluatePickupDate(d("2026-10-01"), window(now, 0), open)).toMatchObject({ available: false, reason: "PAST_DATE" });
  });

  it("blocked and full dates are refused for Pre-Order too", () => {
    const w = window(now, 1);
    expect(evaluatePickupDate(d("2026-10-05"), w, { ...open, isBlocked: true })).toMatchObject({ available: false, reason: "BLOCKED" });
    expect(evaluatePickupDate(d("2026-10-05"), w, { ...open, used: 10 })).toMatchObject({ available: false, reason: "FULL" });
  });
});
