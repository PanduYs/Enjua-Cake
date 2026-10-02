import { PRODUCT_TYPE_LABEL, SOLD_OUT_LABEL, type ProductTypeCode } from "@/lib/format/labels";

/** Badges carry text, not just color (PRD-Design §14, §19). Terms are fixed (FD-117). */
export function ProductBadges({ productType, soldOut, className = "" }: { productType: ProductTypeCode; soldOut: boolean; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold text-foreground ${productType === "READY_STOCK" ? "bg-badge-ready" : "bg-badge-preorder"}`}
      >
        {PRODUCT_TYPE_LABEL[productType]}
      </span>
      {soldOut ? (
        <span className="rounded-full bg-badge-soldout px-2.5 py-0.5 text-xs font-semibold text-badge-soldout-foreground">{SOLD_OUT_LABEL}</span>
      ) : null}
    </div>
  );
}
