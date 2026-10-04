import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PriceSummary, UnitPrice } from "@/components/orders/price-display";
import { computeTotals } from "@/server/domain/checkout/totals";

/** Visible + screen-reader text with tags removed and whitespace collapsed (no styling/DOM coupling). */
const text = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(el)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The summary is fed exactly the server totals (computeTotals), never recomputed in the UI. */
const summaryOf = (items: Parameters<typeof computeTotals>[0]) => {
  const totals = computeTotals(items);
  return { totals, out: text(createElement(PriceSummary, { subtotal: totals.subtotal, discountTotal: totals.discountTotal, total: totals.grandTotal })) };
};

describe("price presentation (Subtotal at normal price − Diskon = Total)", () => {
  it("discounted product: Rp250.000 → Rp225.000 shows Subtotal, Diskon, Total that add up", () => {
    const { totals, out } = summaryOf([{ productId: "cheesecake", quantity: 1, price: 250_000, salePrice: 225_000 }]);
    expect(totals).toMatchObject({ subtotal: 250_000, discountTotal: 25_000, grandTotal: 225_000 });
    expect(out).toBe("Subtotal Rp250.000 Diskon −Rp25.000 Total Rp225.000");
  });

  it("product without a discount: only the total, no Diskon row and no Rp0 noise", () => {
    const { totals, out } = summaryOf([{ productId: "brownies", quantity: 1, price: 85_000, salePrice: null }]);
    expect(totals.discountTotal).toBe(0);
    expect(out).toBe("Total Rp85.000");
    expect(out).not.toContain("Diskon");
  });

  it("quantity > 1 and multiple items (mixed sale / normal price)", () => {
    const { totals, out } = summaryOf([
      { productId: "cheesecake", quantity: 2, price: 250_000, salePrice: 225_000 },
      { productId: "cookies", quantity: 3, price: 60_000, salePrice: 54_000 },
      { productId: "brownies", quantity: 2, price: 85_000, salePrice: null },
    ]);
    // 500.000 + 180.000 + 170.000 normal; 450.000 + 162.000 + 170.000 paid.
    expect(totals).toMatchObject({ subtotal: 850_000, discountTotal: 68_000, grandTotal: 782_000 });
    expect(totals.lines.map((l) => l.lineSubtotal)).toEqual([450_000, 162_000, 170_000]);
    expect(out).toBe("Subtotal Rp850.000 Diskon −Rp68.000 Total Rp782.000");
  });

  it("the total row can carry a page-specific label", () => {
    expect(text(createElement(PriceSummary, { subtotal: 250_000, discountTotal: 25_000, total: 225_000, totalLabel: "Total Pesanan" }))).toBe(
      "Subtotal Rp250.000 Diskon −Rp25.000 Total Pesanan Rp225.000",
    );
  });

  it("unit price: a sale shows the normal price struck through and the price paid, named for screen readers", () => {
    const html = renderToStaticMarkup(createElement(UnitPrice, { normal: 250_000, effective: 225_000 }));
    expect(html).toMatch(/<s>.*Rp250\.000<\/s>/);
    expect(text(createElement(UnitPrice, { normal: 250_000, effective: 225_000 }))).toBe("Harga normal Rp250.000 , harga setelah diskon Rp225.000 / item");
  });

  it("unit price without a sale: just the price, nothing struck through", () => {
    const html = renderToStaticMarkup(createElement(UnitPrice, { normal: 85_000, effective: 85_000 }));
    expect(html).not.toContain("<s>");
    expect(text(createElement(UnitPrice, { normal: 85_000, effective: 85_000 }))).toBe("Rp85.000 / item");
  });
});
