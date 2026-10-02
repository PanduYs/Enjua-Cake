"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { SOLD_OUT_LABEL } from "@/lib/format/labels";
import { useCartStore, type CartItem } from "@/lib/cart/store";

import { QuantityStepper } from "./quantity-stepper";

export type AddToCartProduct = Omit<CartItem, "quantity"> & { soldOut: boolean };

/** Product detail CTA. Sold Out → disabled with the fixed "Sold Out" label (FD-117, Design §12). */
export function AddToCart({ product }: { product: AddToCartProduct }) {
  const add = useCartStore((s) => s.add);
  const inCart = useCartStore((s) => (s.hydrated ? (s.items.find((i) => i.productId === product.productId)?.quantity ?? 0) : 0));
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const id = useId();

  if (product.soldOut) {
    return (
      <button type="button" disabled className="min-h-12 w-full rounded-full bg-badge-soldout px-6 font-semibold text-badge-soldout-foreground opacity-80 sm:w-auto">
        {SOLD_OUT_LABEL}
      </button>
    );
  }

  const max = product.maxQuantityPerOrder;
  const remainingAllowance = max === null ? null : Math.max(0, max - inCart);
  const atMax = remainingAllowance === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <QuantityStepper id={`${id}-qty`} label="Jumlah" value={quantity} onChange={setQuantity} max={remainingAllowance || max} />
        <button
          type="button"
          disabled={atMax}
          onClick={() => {
            const { soldOut: _soldOut, ...item } = product;
            void _soldOut;
            add(item, quantity);
            setMessage(`${quantity} × ${product.name} ditambahkan ke keranjang.`);
            setQuantity(1);
          }}
          className="min-h-12 flex-1 rounded-full bg-primary px-6 font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
        >
          Tambah ke Keranjang
        </button>
      </div>
      {atMax ? <p className="text-sm text-muted-foreground">Jumlah di keranjang sudah mencapai batas maksimal per pesanan.</p> : null}
      <p role="status" aria-live="polite" className="text-sm font-medium text-success">
        {message ? (
          <>
            {message}{" "}
            <Link href="/keranjang" className="underline underline-offset-4">
              Lihat keranjang
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}

/** Compact add button for product cards; sits above the card's stretched link. */
export function QuickAddButton({ product }: { product: AddToCartProduct }) {
  const add = useCartStore((s) => s.add);
  const [added, setAdded] = useState(false);
  if (product.soldOut) return null;
  return (
    <button
      type="button"
      onClick={() => {
        const { soldOut: _soldOut, ...item } = product;
        void _soldOut;
        add(item, 1);
        setAdded(true);
        window.setTimeout(() => setAdded(false), 2000);
      }}
      aria-label={`Tambah ${product.name} ke keranjang`}
      className="relative z-10 mt-2 min-h-11 w-full rounded-full border-2 border-primary px-3 text-sm font-semibold text-primary hover:bg-surface-muted"
    >
      <span aria-live="polite">{added ? "Ditambahkan ✓" : "Tambah"}</span>
    </button>
  );
}
