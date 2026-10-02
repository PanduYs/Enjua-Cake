/** Indonesian copy for Phase 6 admin modules (FD-91). */
export const OVERRIDE_LABEL = {
  MIN_PREORDER_DAYS: "Minimum hari Pre-Order",
  BOOKING_HORIZON: "Booking horizon",
  PICKUP_CUTOFF: "Pickup cutoff",
  DAILY_CAPACITY: "Kapasitas harian",
} as const;

export const MANUAL_DATE_BLOCKER = {
  PAST_DATE: "Tanggal pickup sudah lewat. Pilih tanggal hari ini atau setelahnya.",
  BLOCKED: "Tanggal ini diblokir. Buka blokir di menu Kapasitas atau pilih tanggal lain.",
} as const;

/** Human-readable before → after for an override (plan §22 table). */
export function describeOverride(type: keyof typeof OVERRIDE_LABEL, before: Record<string, unknown>, after: Record<string, unknown>): string {
  switch (type) {
    case "MIN_PREORDER_DAYS":
      return `Normal: paling cepat ${String(before.earliestDate)} (minimum ${String(before.minDays)} hari) → dipakai: ${String(after.pickupDate)}`;
    case "BOOKING_HORIZON":
      return `Normal: paling lambat ${String(before.latestDate)} → dipakai: ${String(after.pickupDate)}`;
    case "PICKUP_CUTOFF":
      return `Normal: cutoff ${String(before.cutoff)} WIB, paling cepat ${String(before.earliestDate)} → dipakai: ${String(after.pickupDate)}`;
    case "DAILY_CAPACITY":
      return `Normal: kapasitas ${String(before.capacity)}, terisi ${String(before.used)} → terisi menjadi ${String(after.used)}`;
  }
}

export const CAPACITY_STATUS_LABEL = { AVAILABLE: "Tersedia", FULL: "Penuh", BLOCKED: "Diblokir" } as const;
