/**
 * Display pricing (FD-25): price + optional sale_price. Authoritative order totals
 * are computed at checkout (Phase 3); these helpers only shape what is shown.
 */
export interface PriceInput {
  price: number;
  salePrice: number | null;
}

export interface DisplayPrice {
  /** What the customer pays per unit. */
  effective: number;
  /** Original price when discounted, else null. */
  original: number | null;
  /** Rounded discount percentage for display, else null. */
  discountPercent: number | null;
}

export function displayPrice({ price, salePrice }: PriceInput): DisplayPrice {
  if (!Number.isInteger(price) || price < 0) throw new RangeError("price must be a non-negative integer");
  if (salePrice === null || salePrice >= price) {
    return { effective: price, original: null, discountPercent: null };
  }
  if (!Number.isInteger(salePrice) || salePrice < 0) throw new RangeError("salePrice must be a non-negative integer");
  const percent = price === 0 ? 0 : Math.round(((price - salePrice) / price) * 100);
  return { effective: salePrice, original: price, discountPercent: Math.max(1, percent) };
}
