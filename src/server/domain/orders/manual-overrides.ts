import { addCalendarDays, compareIsoDates, type IsoDate, type TimeOfDay } from "../time/wib";
import type { DateCapacityFacts, PickupWindow } from "../checkout/pickup-date";

/**
 * Manual Order overrides (FD-110, FD-119, IMPLEMENTATION-PLAN §22). Only these four
 * rules can be overridden; past dates, blocked dates, products, payment rules,
 * tracking and state transitions never can.
 */
export const OVERRIDE_TYPES = ["MIN_PREORDER_DAYS", "BOOKING_HORIZON", "PICKUP_CUTOFF", "DAILY_CAPACITY"] as const;
export type OverrideType = (typeof OVERRIDE_TYPES)[number];

export interface RequiredOverride {
  type: OverrideType;
  /** Normal rule value (plan §22 table). */
  before: Record<string, unknown>;
  /** Value used for this order. */
  after: Record<string, unknown>;
}

export type ManualDateEvaluation =
  | { ok: true; required: RequiredOverride[] }
  | { ok: false; blocker: "PAST_DATE" | "BLOCKED" };

/**
 * Which overrides a manual order for `date` needs. Overrides not needed are never
 * reported, so nothing is recorded unless a rule was actually bypassed.
 */
export function evaluateManualPickupDate(
  date: IsoDate,
  window: PickupWindow,
  ctx: { cutoff: TimeOfDay; minPreorderDays: number; facts: DateCapacityFacts },
): ManualDateEvaluation {
  if (compareIsoDates(date, window.today) < 0) return { ok: false, blocker: "PAST_DATE" };
  if (ctx.facts.isBlocked) return { ok: false, blocker: "BLOCKED" };

  const required: RequiredOverride[] = [];
  if (compareIsoDates(date, window.latestDate) > 0) {
    required.push({ type: "BOOKING_HORIZON", before: { latestDate: window.latestDate }, after: { pickupDate: date } });
  }

  // Smallest set of {cutoff, minimum Pre-Order} overrides that makes the date reachable.
  const cutoffApplies = compareIsoDates(window.effectiveDate, window.today) > 0;
  const min = window.hasPreorder ? ctx.minPreorderDays : 0;
  const earliest = (skipCutoff: boolean, skipMin: boolean) => addCalendarDays(skipCutoff || !cutoffApplies ? window.today : window.effectiveDate, skipMin ? 0 : min);
  const reachable = (skipCutoff: boolean, skipMin: boolean) => compareIsoDates(date, earliest(skipCutoff, skipMin)) >= 0;
  const [skipCutoff, skipMin] = reachable(false, false) ? [false, false] : reachable(true, false) ? [true, false] : reachable(false, true) ? [false, true] : [true, true];
  if (skipMin) {
    required.push({ type: "MIN_PREORDER_DAYS", before: { earliestDate: earliest(skipCutoff, false), minDays: min }, after: { pickupDate: date } });
  }
  if (skipCutoff) {
    required.push({ type: "PICKUP_CUTOFF", before: { cutoff: ctx.cutoff, earliestDate: earliest(false, skipMin) }, after: { pickupDate: date } });
  }

  if (ctx.facts.used >= ctx.facts.capacity) {
    required.push({ type: "DAILY_CAPACITY", before: { capacity: ctx.facts.capacity, used: ctx.facts.used }, after: { used: ctx.facts.used + 1 } });
  }
  return { ok: true, required };
}
