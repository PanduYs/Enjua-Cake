import { describe, expect, it } from "vitest";

import {
  addCalendarDays,
  calendarDaysBetween,
  compareIsoDates,
  isBeforeWibTimeOfDay,
  parseIsoDate,
  parseTimeOfDay,
  toWibCompactDate,
  toWibDate,
  toWibTime,
  wibDateTimeToInstant,
  type IsoDate,
} from "@/server/domain/time/wib";

const d = (v: string) => parseIsoDate(v);
const t = (v: string) => parseTimeOfDay(v);

describe("WIB calendar helpers", () => {
  it("maps UTC instants to the WIB calendar date (UTC+7)", () => {
    // 16:59:59Z = 23:59:59 WIB same day; 17:00Z = 00:00 WIB next day
    expect(toWibDate(new Date("2026-10-02T16:59:59Z"))).toBe("2026-10-02");
    expect(toWibDate(new Date("2026-10-02T17:00:00Z"))).toBe("2026-10-03");
    expect(toWibTime(new Date("2026-10-02T08:00:00Z"))).toBe("15:00:00");
  });

  it("handles month and year rollover", () => {
    expect(toWibDate(new Date("2026-12-31T17:30:00Z"))).toBe("2027-01-01");
    expect(addCalendarDays(d("2026-12-30"), 3)).toBe("2027-01-02");
    expect(addCalendarDays(d("2026-02-27"), 2)).toBe("2026-03-01");
    expect(addCalendarDays(d("2028-02-28"), 1)).toBe("2028-02-29");
    expect(addCalendarDays(d("2026-10-05"), -5)).toBe("2026-09-30");
  });

  it("converts a WIB wall-clock time to the correct instant", () => {
    expect(wibDateTimeToInstant(d("2026-10-02"), t("15:00")).toISOString()).toBe("2026-10-02T08:00:00.000Z");
    expect(wibDateTimeToInstant(d("2026-10-02")).toISOString()).toBe("2026-10-01T17:00:00.000Z");
  });

  it("treats exactly-at-boundary as not before (cutoff semantics)", () => {
    const cutoff = t("15:00");
    expect(isBeforeWibTimeOfDay(new Date("2026-10-02T07:59:59.999Z"), cutoff)).toBe(true); // 14:59:59.999 WIB
    expect(isBeforeWibTimeOfDay(new Date("2026-10-02T08:00:00.000Z"), cutoff)).toBe(false); // 15:00:00 WIB
    expect(isBeforeWibTimeOfDay(new Date("2026-10-02T16:59:00Z"), cutoff)).toBe(false); // 23:59 WIB
    expect(isBeforeWibTimeOfDay(new Date("2026-10-02T17:01:00Z"), cutoff)).toBe(true); // 00:01 WIB next day
  });

  it("formats the compact WIB date used by order numbers", () => {
    expect(toWibCompactDate(new Date("2026-10-01T18:00:00Z"))).toBe("20261002");
  });

  it("compares and diffs ISO dates", () => {
    expect(compareIsoDates(d("2026-10-02"), d("2026-10-03"))).toBeLessThan(0);
    expect(compareIsoDates(d("2026-10-03"), d("2026-10-03"))).toBe(0);
    expect(calendarDaysBetween(d("2026-10-02"), d("2026-12-01"))).toBe(60);
  });

  it("rejects invalid input", () => {
    expect(() => parseIsoDate("2026-02-30")).toThrow(RangeError);
    expect(() => parseIsoDate("2026-1-1")).toThrow(RangeError);
    expect(() => parseTimeOfDay("24:00")).toThrow(RangeError);
    expect(() => toWibDate(new Date("invalid"))).toThrow(RangeError);
    expect(() => addCalendarDays("2026-10-02" as IsoDate, 1.5)).toThrow(RangeError);
  });
});
