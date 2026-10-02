import { formatRupiah } from "@/lib/format/rupiah";

export interface PriceTagProps {
  effective: number;
  original: number | null;
  discountPercent: number | null;
  size?: "md" | "lg";
}

export function PriceTag({ effective, original, discountPercent, size = "md" }: PriceTagProps) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className={`font-semibold text-foreground ${size === "lg" ? "text-2xl" : "text-lg"}`}>
        {original !== null ? <span className="sr-only">Harga setelah diskon: </span> : null}
        {formatRupiah(effective)}
      </span>
      {original !== null ? (
        <>
          <s className="text-sm text-muted-foreground">
            <span className="sr-only">Harga normal: </span>
            {formatRupiah(original)}
          </s>
          {discountPercent !== null ? (
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">-{discountPercent}%</span>
          ) : null}
        </>
      ) : null}
    </p>
  );
}
