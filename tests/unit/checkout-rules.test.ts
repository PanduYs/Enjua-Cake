import { describe, expect, it } from "vitest";

import { normalizeIndonesianMobile } from "@/lib/validation/checkout";
import { validateCartLines, type ProductFacts } from "@/server/domain/checkout/cart-items";
import { allowedOptions, dpAmount, isMethodAllowed, paymentBreakdown, validatePaymentSelection } from "@/server/domain/checkout/payment-rules";
import { computeTotals, MAX_DB_INTEGER, TotalsOverflowError } from "@/server/domain/checkout/totals";

describe("DP and payment breakdown (FD-42..44)", () => {
  it("DP is ceil(total × 0.5); remaining = total − DP", () => {
    expect(paymentBreakdown(300_000, "DP_50")).toEqual({ total: 300_000, dpAmount: 150_000, dueNow: 150_000, remaining: 150_000 });
    expect(paymentBreakdown(125_555, "DP_50")).toEqual({ total: 125_555, dpAmount: 62_778, dueNow: 62_778, remaining: 62_777 });
    expect(dpAmount(1)).toBe(1);
    expect(dpAmount(0)).toBe(0);
  });
  it("full payment has no remaining", () => {
    expect(paymentBreakdown(300_000, "FULL")).toEqual({ total: 300_000, dpAmount: null, dueNow: 300_000, remaining: 0 });
  });
  it("rejects non-integer totals", () => {
    expect(() => dpAmount(10.5)).toThrow(RangeError);
  });
});

describe("payment method rules (FD-39..41)", () => {
  it("Cash is unavailable when the order has any Pre-Order", () => {
    expect(isMethodAllowed("CASH", true)).toBe(false);
    expect(isMethodAllowed("CASH", false)).toBe(true);
    expect(isMethodAllowed("QRIS", true)).toBe(true);
    expect(isMethodAllowed("BANK_TRANSFER", true)).toBe(true);
  });
  it("Cash is full payment only; QRIS/Transfer allow DP", () => {
    expect(allowedOptions("CASH")).toEqual(["FULL"]);
    expect(allowedOptions("QRIS")).toEqual(["DP_50", "FULL"]);
    expect(validatePaymentSelection("CASH", "DP_50", false)).toBe("OPTION_NOT_ALLOWED_FOR_METHOD");
    expect(validatePaymentSelection("CASH", "FULL", true)).toBe("CASH_NOT_ALLOWED_FOR_PREORDER");
    expect(validatePaymentSelection("BANK_TRANSFER", "DP_50", true)).toBeNull();
  });
});

describe("totals from database prices", () => {
  it("computes subtotal at normal price, discount, and grand total at effective price", () => {
    const totals = computeTotals([
      { productId: "a", quantity: 2, price: 250_000, salePrice: 225_000 },
      { productId: "b", quantity: 3, price: 60_000, salePrice: null },
    ]);
    expect(totals.subtotal).toBe(680_000);
    expect(totals.discountTotal).toBe(50_000);
    expect(totals.grandTotal).toBe(630_000);
    expect(totals.lines[0]).toMatchObject({ effectiveUnitPrice: 225_000, lineSubtotal: 450_000, salePrice: 225_000 });
    expect(totals.lines[1]).toMatchObject({ effectiveUnitPrice: 60_000, salePrice: null });
  });
  it("has no business quantity cap, only an integer-overflow guard (TD-19)", () => {
    expect(computeTotals([{ productId: "a", quantity: 1000, price: 50_000, salePrice: null }]).grandTotal).toBe(50_000_000);
    expect(() => computeTotals([{ productId: "a", quantity: MAX_DB_INTEGER, price: 2, salePrice: null }])).toThrow(TotalsOverflowError);
  });
});

describe("cart line validation", () => {
  const facts = (over: Partial<ProductFacts> = {}): ProductFacts => ({
    id: "p",
    isActive: true,
    categoryActive: true,
    availability: "AVAILABLE",
    maxQuantityPerOrder: null,
    ...over,
  });
  it("flags unavailable, sold out, invalid and over-max lines", () => {
    const products = new Map<string, ProductFacts>([
      ["ok", facts({ id: "ok" })],
      ["inactive", facts({ id: "inactive", isActive: false })],
      ["hiddencat", facts({ id: "hiddencat", categoryActive: false })],
      ["soldout", facts({ id: "soldout", availability: "SOLD_OUT" })],
      ["max", facts({ id: "max", maxQuantityPerOrder: 2 })],
    ]);
    const issues = validateCartLines(
      [
        { productId: "ok", quantity: 5 },
        { productId: "inactive", quantity: 1 },
        { productId: "hiddencat", quantity: 1 },
        { productId: "missing", quantity: 1 },
        { productId: "soldout", quantity: 1 },
        { productId: "max", quantity: 3 },
      ],
      products,
    );
    expect(Object.fromEntries(issues)).toEqual({
      inactive: "NOT_AVAILABLE",
      hiddencat: "NOT_AVAILABLE",
      missing: "NOT_AVAILABLE",
      soldout: "SOLD_OUT",
      max: "EXCEEDS_MAX_QUANTITY",
    });
  });
  it("flags duplicate lines and zero quantities", () => {
    const products = new Map([["p", facts()]]);
    expect(Object.fromEntries(validateCartLines([{ productId: "p", quantity: 0 }], products))).toEqual({ p: "INVALID_QUANTITY" });
    expect(
      Object.fromEntries(
        validateCartLines(
          [
            { productId: "p", quantity: 1 },
            { productId: "p", quantity: 1 },
          ],
          products,
        ),
      ),
    ).toEqual({ p: "DUPLICATE_LINE" });
  });
});

describe("WhatsApp number normalization (PRD §37)", () => {
  it("accepts Indonesian mobile formats and returns E.164", () => {
    expect(normalizeIndonesianMobile("081234567890")).toBe("+6281234567890");
    expect(normalizeIndonesianMobile("+62 812-3456-7890")).toBe("+6281234567890");
    expect(normalizeIndonesianMobile("6281234567890")).toBe("+6281234567890");
  });
  it("rejects landlines, foreign, and malformed numbers", () => {
    expect(normalizeIndonesianMobile("0215551234")).toBeNull();
    expect(normalizeIndonesianMobile("+14155550123")).toBeNull();
    expect(normalizeIndonesianMobile("12345")).toBeNull();
    expect(normalizeIndonesianMobile("")).toBeNull();
  });
});
