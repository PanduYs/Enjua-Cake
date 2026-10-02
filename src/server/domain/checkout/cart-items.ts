/**
 * Cart line validation against current product data (FD-27, FD-28, EC-07, EC-15).
 */
export interface CartLineInput {
  productId: string;
  quantity: number;
}

export interface ProductFacts {
  id: string;
  isActive: boolean;
  categoryActive: boolean;
  availability: "AVAILABLE" | "SOLD_OUT";
  maxQuantityPerOrder: number | null;
}

export type CartLineIssue = "NOT_AVAILABLE" | "SOLD_OUT" | "INVALID_QUANTITY" | "EXCEEDS_MAX_QUANTITY" | "DUPLICATE_LINE";

export function validateCartLines(lines: ReadonlyArray<CartLineInput>, products: ReadonlyMap<string, ProductFacts>): Map<string, CartLineIssue> {
  const issues = new Map<string, CartLineIssue>();
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.productId)) {
      issues.set(line.productId, "DUPLICATE_LINE");
      continue;
    }
    seen.add(line.productId);
    const product = products.get(line.productId);
    if (!product || !product.isActive || !product.categoryActive) issues.set(line.productId, "NOT_AVAILABLE");
    else if (product.availability === "SOLD_OUT") issues.set(line.productId, "SOLD_OUT");
    else if (!Number.isInteger(line.quantity) || line.quantity < 1) issues.set(line.productId, "INVALID_QUANTITY");
    else if (product.maxQuantityPerOrder !== null && line.quantity > product.maxQuantityPerOrder) issues.set(line.productId, "EXCEEDS_MAX_QUANTITY");
  }
  return issues;
}
