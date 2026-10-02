/** "Jumat, 9 Oktober 2026" for a business date (YYYY-MM-DD); timezone-independent. */
export function formatIsoDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "2 Oktober 2026 14.30" in WIB, for instants such as payment deadlines. */
export function formatWibDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
