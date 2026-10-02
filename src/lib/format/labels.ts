/**
 * Product badge labels are fixed terms and are NOT translated (FD-117).
 */
export const PRODUCT_TYPE_LABEL = {
  READY_STOCK: "Ready Stock",
  PRE_ORDER: "Pre-Order",
} as const;

export const SOLD_OUT_LABEL = "Sold Out";

export type ProductTypeCode = keyof typeof PRODUCT_TYPE_LABEL;

export function preorderLeadTimeText(minimumPreorderDays: number): string {
  return `Pesan minimal ${minimumPreorderDays} hari sebelum pickup`;
}
