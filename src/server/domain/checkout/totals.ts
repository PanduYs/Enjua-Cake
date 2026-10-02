import { displayPrice } from "../catalog/pricing";

/** PostgreSQL `integer` upper bound — the only quantity/amount ceiling (TD-19, FD-28). */
export const MAX_DB_INTEGER = 2_147_483_647;

export interface PricedItemInput {
  productId: string;
  quantity: number;
  price: number;
  salePrice: number | null;
}

export interface PricedLine {
  productId: string;
  quantity: number;
  unitPrice: number;
  salePrice: number | null;
  effectiveUnitPrice: number;
  lineSubtotal: number;
}

export interface OrderTotals {
  lines: PricedLine[];
  /** Sum of normal price × quantity. */
  subtotal: number;
  /** Sum of (normal − effective) × quantity. */
  discountTotal: number;
  grandTotal: number;
}

export class TotalsOverflowError extends Error {
  constructor() {
    super("Order amount exceeds the supported range");
    this.name = "TotalsOverflowError";
  }
}

/** Server-side totals from database prices only (FD-32, PRD §37). Integer Rupiah. */
export function computeTotals(items: ReadonlyArray<PricedItemInput>): OrderTotals {
  let subtotal = 0;
  let grandTotal = 0;
  const lines = items.map((item) => {
    const price = displayPrice({ price: item.price, salePrice: item.salePrice });
    const lineSubtotal = price.effective * item.quantity;
    subtotal += item.price * item.quantity;
    grandTotal += lineSubtotal;
    if (!Number.isSafeInteger(lineSubtotal) || subtotal > MAX_DB_INTEGER || grandTotal > MAX_DB_INTEGER) throw new TotalsOverflowError();
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.price,
      salePrice: price.original === null ? null : item.salePrice,
      effectiveUnitPrice: price.effective,
      lineSubtotal,
    };
  });
  return { lines, subtotal, discountTotal: subtotal - grandTotal, grandTotal };
}
