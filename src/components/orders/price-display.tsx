import { formatRupiah } from "@/lib/format/rupiah";

/**
 * Presentation only — amounts come from the server totals (computeTotals / stored order):
 * line amounts are already after the sale price, `subtotal` is at normal prices and
 * `discountTotal` is the difference, so Subtotal − Diskon = Total.
 */

/** Per-unit price; a sale shows the normal price struck through next to the price paid. */
export function UnitPrice({ normal, effective }: { normal: number; effective: number }) {
  if (effective >= normal) return <span className="text-xs text-muted-foreground">{formatRupiah(effective)} / item</span>;
  return (
    <span className="text-xs text-muted-foreground">
      <s>
        <span className="sr-only">Harga normal </span>
        {formatRupiah(normal)}
      </s>{" "}
      <span className="font-semibold text-foreground">
        <span className="sr-only">, harga setelah diskon </span>
        {formatRupiah(effective)}
      </span>{" "}
      / item
    </span>
  );
}

/**
 * Subtotal (normal prices) → Diskon → Total. Without a discount only the total is shown,
 * so an amount that already includes the discount is never followed by a "Diskon" row.
 */
export function PriceSummary({
  subtotal,
  discountTotal,
  total,
  totalLabel = "Total",
  className = "",
}: {
  subtotal: number;
  discountTotal: number;
  total: number;
  totalLabel?: string;
  className?: string;
}) {
  const discounted = discountTotal > 0;
  return (
    <dl className={`flex flex-col gap-1 text-sm ${className}`} data-testid="price-summary">
      {discounted ? (
        <>
          <div className="flex justify-between gap-3">
            <dt>Subtotal</dt>
            <dd className="whitespace-nowrap">{formatRupiah(subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Diskon</dt>
            <dd className="whitespace-nowrap">−{formatRupiah(discountTotal)}</dd>
          </div>
        </>
      ) : null}
      <div className={`flex justify-between gap-3 text-base font-semibold ${discounted ? "mt-1 border-t border-border pt-2" : ""}`}>
        <dt>{totalLabel}</dt>
        <dd className="whitespace-nowrap">{formatRupiah(total)}</dd>
      </div>
    </dl>
  );
}
