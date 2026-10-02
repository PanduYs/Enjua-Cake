import { TZDate } from "@date-fns/tz";

/**
 * Pure WIB (Asia/Jakarta) calendar helpers — the single place where business
 * dates are derived from instants (FD-09). No I/O and no access to "now":
 * callers pass the current instant from the Clock.
 *
 * Business dates are ISO calendar strings "YYYY-MM-DD"; instants are Date (UTC).
 */
export const WIB_TIME_ZONE = "Asia/Jakarta";

/** ISO calendar date, e.g. "2026-10-02". */
export type IsoDate = string & { readonly __brand: "IsoDate" };
/** Wall-clock time of day "HH:mm" (24h). */
export type TimeOfDay = string & { readonly __brand: "TimeOfDay" };

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

export function parseIsoDate(value: string): IsoDate {
  const match = ISO_DATE_RE.exec(value);
  if (!match) throw new RangeError(`Invalid ISO date: ${value}`);
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw new RangeError(`Invalid calendar date: ${value}`);
  }
  return value as IsoDate;
}

export function parseTimeOfDay(value: string): TimeOfDay {
  if (!TIME_OF_DAY_RE.test(value)) throw new RangeError(`Invalid time of day (HH:mm): ${value}`);
  return value as TimeOfDay;
}

function assertValidInstant(instant: Date): void {
  if (Number.isNaN(instant.getTime())) throw new RangeError("Invalid instant");
}

/** Calendar date in WIB for an instant. */
export function toWibDate(instant: Date): IsoDate {
  assertValidInstant(instant);
  const wib = new TZDate(instant.getTime(), WIB_TIME_ZONE);
  return `${wib.getFullYear()}-${pad(wib.getMonth() + 1)}-${pad(wib.getDate())}` as IsoDate;
}

/** Wall-clock "HH:mm:ss" in WIB for an instant. */
export function toWibTime(instant: Date): string {
  assertValidInstant(instant);
  const wib = new TZDate(instant.getTime(), WIB_TIME_ZONE);
  return `${pad(wib.getHours())}:${pad(wib.getMinutes())}:${pad(wib.getSeconds())}`;
}

/** "YYYYMMDD" of the WIB calendar date (used by the order number format, FD-70). */
export function toWibCompactDate(instant: Date): string {
  return toWibDate(instant).replaceAll("-", "");
}

/** The instant at which the given WIB wall-clock date/time occurs. */
export function wibDateTimeToInstant(date: IsoDate, time: TimeOfDay = "00:00" as TimeOfDay): Date {
  const [y, m, d] = parseIsoDate(date).split("-").map(Number) as [number, number, number];
  const [hh, mm] = parseTimeOfDay(time).split(":").map(Number) as [number, number];
  return new Date(new TZDate(y, m - 1, d, hh, mm, 0, 0, WIB_TIME_ZONE).getTime());
}

/**
 * True when the instant is strictly before the given WIB time on that instant's
 * own WIB date. Exactly at the boundary counts as "not before".
 */
export function isBeforeWibTimeOfDay(instant: Date, time: TimeOfDay): boolean {
  const boundary = wibDateTimeToInstant(toWibDate(instant), time);
  return instant.getTime() < boundary.getTime();
}

/** Pure calendar arithmetic on ISO dates (no time zone involved). */
export function addCalendarDays(date: IsoDate, days: number): IsoDate {
  if (!Number.isInteger(days)) throw new RangeError("days must be an integer");
  const [y, m, d] = parseIsoDate(date).split("-").map(Number) as [number, number, number];
  const result = new Date(Date.UTC(y, m - 1, d + days));
  return `${pad(result.getUTCFullYear(), 4)}-${pad(result.getUTCMonth() + 1)}-${pad(result.getUTCDate())}` as IsoDate;
}

/** Negative if a < b, 0 if equal, positive if a > b. */
export function compareIsoDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Whole calendar days from a to b (b - a). */
export function calendarDaysBetween(a: IsoDate, b: IsoDate): number {
  const toUtc = (v: IsoDate) => {
    const [y, m, d] = v.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(parseIsoDate(b)) - toUtc(parseIsoDate(a))) / 86_400_000);
}
