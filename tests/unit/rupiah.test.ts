import { describe, expect, it } from "vitest";

import { formatRupiah } from "@/lib/format/rupiah";

describe("formatRupiah", () => {
  it("formats like PRD examples", () => {
    expect(formatRupiah(300_000)).toBe("Rp300.000");
    expect(formatRupiah(62_778)).toBe("Rp62.778");
    expect(formatRupiah(1_250_000)).toBe("Rp1.250.000");
    expect(formatRupiah(0)).toBe("Rp0");
    expect(formatRupiah(999)).toBe("Rp999");
    expect(formatRupiah(-5_000)).toBe("-Rp5.000");
  });
  it("rejects non-integers", () => {
    expect(() => formatRupiah(10.5)).toThrow(RangeError);
  });
});
