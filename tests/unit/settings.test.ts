import { describe, expect, it, vi } from "vitest";

import { resolveSettings, toPublicSiteSettings } from "@/server/services/settings";

describe("resolveSettings", () => {
  it("returns plan defaults and leaves business facts empty (never invented)", () => {
    const s = resolveSettings([]);
    expect(s.business_name).toBe("Enjua Cake's");
    expect(s.pickup_cutoff).toBe("15:00");
    expect(s.default_capacity).toBe(10);
    expect(s.booking_horizon_days).toBe(60);
    expect(s.qris_reservation_minutes).toBe(30);
    expect(s.transfer_reservation_minutes).toBe(120);
    expect(s.qris_remaining_payment_minutes).toBe(30);
    expect(s.transfer_remaining_payment_minutes).toBe(120);
    expect(s.whatsapp_number).toBeNull();
    expect(s.address).toBeNull();
    expect(s.bank_accounts).toEqual([]);
  });

  it("uses valid stored values", () => {
    const s = resolveSettings([
      { key: "pickup_cutoff", value: "14:30" },
      { key: "whatsapp_number", value: "081234567890" },
      { key: "social_links", value: [{ label: "Instagram", url: "https://instagram.com/x" }] },
    ]);
    expect(s.pickup_cutoff).toBe("14:30");
    expect(s.whatsapp_number).toBe("081234567890");
    expect(s.social_links).toHaveLength(1);
  });

  it("falls back to the default and reports invalid stored values", () => {
    const onInvalid = vi.fn();
    const s = resolveSettings(
      [
        { key: "pickup_cutoff", value: "25:00" },
        { key: "qris_reservation_minutes", value: 5 },
        { key: "social_links", value: [{ label: "x", url: "not-a-url" }] },
      ],
      onInvalid,
    );
    expect(s.pickup_cutoff).toBe("15:00");
    expect(s.qris_reservation_minutes).toBe(30);
    expect(s.social_links).toEqual([]);
    expect(onInvalid.mock.calls.map((c) => c[0])).toEqual(["social_links", "pickup_cutoff", "qris_reservation_minutes"]);
  });

  it("public settings exclude operational and bank fields", () => {
    const pub = toPublicSiteSettings(resolveSettings([]));
    expect(Object.keys(pub)).not.toContain("bank_accounts");
    expect(Object.keys(pub)).not.toContain("default_capacity");
  });
});
