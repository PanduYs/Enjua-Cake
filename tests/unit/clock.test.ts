import { describe, expect, it } from "vitest";

import { createFixedClock, systemClock } from "@/server/clock";

describe("Clock", () => {
  it("fixed clock is controllable and returns copies", () => {
    const clock = createFixedClock(new Date("2026-10-02T08:00:00Z"));
    const first = clock.now();
    first.setUTCFullYear(2000);
    expect(clock.now().toISOString()).toBe("2026-10-02T08:00:00.000Z");
    clock.advanceBy(30 * 60 * 1000);
    expect(clock.now().toISOString()).toBe("2026-10-02T08:30:00.000Z");
    clock.set(new Date("2027-01-01T00:00:00Z"));
    expect(clock.now().toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("system clock returns the current time", () => {
    expect(Math.abs(systemClock.now().getTime() - Date.now())).toBeLessThan(1000);
  });
});
