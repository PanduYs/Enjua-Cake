import { describe, expect, it } from "vitest";

import { displayPrice } from "@/server/domain/catalog/pricing";

describe("displayPrice (FD-25)", () => {
  it("uses price when there is no sale price", () => {
    expect(displayPrice({ price: 85_000, salePrice: null })).toEqual({ effective: 85_000, original: null, discountPercent: null });
  });
  it("uses sale price and computes a rounded discount for display", () => {
    expect(displayPrice({ price: 250_000, salePrice: 225_000 })).toEqual({ effective: 225_000, original: 250_000, discountPercent: 10 });
    expect(displayPrice({ price: 300_000, salePrice: 199_000 }).discountPercent).toBe(34);
  });
  it("never shows 0% for a tiny discount", () => {
    expect(displayPrice({ price: 100_000, salePrice: 99_900 }).discountPercent).toBe(1);
  });
  it("ignores an invalid sale price that is not lower than price", () => {
    expect(displayPrice({ price: 50_000, salePrice: 50_000 }).original).toBeNull();
  });
  it("rejects invalid prices", () => {
    expect(() => displayPrice({ price: -1, salePrice: null })).toThrow(RangeError);
    expect(() => displayPrice({ price: 100, salePrice: 10.5 })).toThrow(RangeError);
  });
});
