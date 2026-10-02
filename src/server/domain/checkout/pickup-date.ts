import {
  addCalendarDays,
  calendarDaysBetween,
  compareIsoDates,
  isBeforeWibTimeOfDay,
  toWibDate,
  type IsoDate,
  type TimeOfDay,
} from "../time/wib";

/**
 * Pickup date rules (FD-08, FD-17..21, FD-108, IMPLEMENTATION-PLAN §12). Pure:
 * callers pass "now", settings, and capacity facts.
 */

/** Order date counted for lead time: today before cutoff, otherwise tomorrow (FD-108). */
export function effectiveOrderDate(now: Date, cutoff: TimeOfDay): IsoDate {
  const today = toWibDate(now);
  return isBeforeWibTimeOfDay(now, cutoff) ? today : addCalendarDays(today, 1);
}

/** Longest minimum_preorder_days among Pre-Order items, 0 for Ready Stock-only (FD-18). */
export function maxPreorderDays(items: ReadonlyArray<{ productType: "READY_STOCK" | "PRE_ORDER"; minimumPreorderDays: number | null }>): number {
  return items.reduce((max, item) => (item.productType === "PRE_ORDER" ? Math.max(max, item.minimumPreorderDays ?? 0) : max), 0);
}

export interface PickupWindowInput {
  now: Date;
  cutoff: TimeOfDay;
  bookingHorizonDays: number;
  maxPreorderDays: number;
}

export interface PickupWindow {
  today: IsoDate;
  effectiveDate: IsoDate;
  earliestDate: IsoDate;
  latestDate: IsoDate;
  hasPreorder: boolean;
}

export function pickupWindow({ now, cutoff, bookingHorizonDays, maxPreorderDays: days }: PickupWindowInput): PickupWindow {
  if (!Number.isInteger(bookingHorizonDays) || bookingHorizonDays < 0) throw new RangeError("bookingHorizonDays must be a non-negative integer");
  if (!Number.isInteger(days) || days < 0) throw new RangeError("maxPreorderDays must be a non-negative integer");
  const today = toWibDate(now);
  const effectiveDate = effectiveOrderDate(now, cutoff);
  return {
    today,
    effectiveDate,
    earliestDate: addCalendarDays(effectiveDate, days),
    latestDate: addCalendarDays(today, bookingHorizonDays),
    hasPreorder: days > 0,
  };
}

export type PickupDateReason = "PREORDER_MIN_NOT_MET" | "CUTOFF_PASSED" | "BLOCKED" | "FULL" | "OUTSIDE_HORIZON" | "PAST_DATE";

export interface DateCapacityFacts {
  isBlocked: boolean;
  capacity: number;
  used: number;
}

export type PickupDateStatus =
  | { date: IsoDate; available: true; remaining: number }
  | { date: IsoDate; available: false; reason: PickupDateReason };

/** Evaluates one date in the order of IMPLEMENTATION-PLAN §12. */
export function evaluatePickupDate(date: IsoDate, window: PickupWindow, facts: DateCapacityFacts): PickupDateStatus {
  if (compareIsoDates(date, window.today) < 0) return { date, available: false, reason: "PAST_DATE" };
  if (compareIsoDates(date, window.latestDate) > 0) return { date, available: false, reason: "OUTSIDE_HORIZON" };
  if (compareIsoDates(date, window.earliestDate) < 0) {
    return { date, available: false, reason: window.hasPreorder ? "PREORDER_MIN_NOT_MET" : "CUTOFF_PASSED" };
  }
  if (facts.isBlocked) return { date, available: false, reason: "BLOCKED" };
  if (facts.used >= facts.capacity) return { date, available: false, reason: "FULL" };
  return { date, available: true, remaining: facts.capacity - facts.used };
}

/** All dates from today through the horizon, inclusive. */
export function datesInWindow(window: PickupWindow): IsoDate[] {
  const count = calendarDaysBetween(window.today, window.latestDate);
  return Array.from({ length: count + 1 }, (_, i) => addCalendarDays(window.today, i));
}

export function effectiveCapacity(capacityOverride: number | null, defaultCapacity: number): number {
  return capacityOverride ?? defaultCapacity;
}
