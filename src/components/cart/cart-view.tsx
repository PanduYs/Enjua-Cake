"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import type { validateCartAction } from "@/app/(public)/_actions/checkout";
import { CART_ISSUE_LABEL, CASH_UNAVAILABLE_REASON } from "@/lib/copy/checkout";
import { cartLinesForServer, useCartStore } from "@/lib/cart/store";
import { PRODUCT_TYPE_LABEL } from "@/lib/format/labels";
import { formatRupiah } from "@/lib/format/rupiah";

import { CakeIcon } from "../public/icons";
import { QuantityStepper } from "./quantity-stepper";

type Validation = Awaited<ReturnType<typeof validateCartAction>>;

export function CartView({ validate }: { validate: typeof validateCartAction }) {
  const { items, hydrated, setQuantity, remove, refreshSnapshots } = useCartStore();
  const [validation, setValidation] = useState<Validation | null>(null);
  const [pending, startTransition] = useTransition();
  const key = JSON.stringify(cartLinesForServer(items));

  useEffect(() => {
    if (!hydrated || items.length === 0) return;
    startTransition(async () => {
      const result = await validate(JSON.parse(key));
      setValidation(result);
      refreshSnapshots(
        result.lines.flatMap((l) =>
          l.product
            ? [{ productId: l.productId, name: l.product.name, unitPrice: l.product.price.effective, maxQuantityPerOrder: l.product.maxQuantityPerOrder, productType: l.product.productType }]
            : [],
        ),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-validate when cart contents change
  }, [hydrated, key]);

  if (!hydrated) {
    return <div className="h-40 animate-pulse rounded-card bg-surface" aria-busy="true" aria-label="Memuat keranjang" />;
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-card bg-surface p-10 text-center">
        <CakeIcon width={56} height={56} className="text-accent-soft" />
        <p className="text-lg">Keranjangmu masih kosong. Yuk, pilih kue favoritmu.</p>
        <Link href="/produk" className="inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground">
          Lihat Produk
        </Link>
      </div>
    );
  }

  const issueOf = (productId: string) => validation?.lines.find((l) => l.productId === productId)?.issue ?? null;
  const fresh = validation && validation.lines.length === items.length;
  const canCheckout = Boolean(fresh && validation.canCheckout && !pending);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <ul className="flex flex-col gap-4" aria-label="Isi keranjang">
        {items.map((item) => {
          const issue = issueOf(item.productId);
          return (
            <li key={item.productId} className="flex flex-col gap-3 rounded-card bg-surface p-4 sm:flex-row sm:items-center">
              <div className="flex flex-1 gap-3">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-control bg-surface-muted">
                  {item.imageUrl ? <Image src={item.imageUrl} alt="" fill sizes="80px" className="object-cover" /> : null}
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <Link href={`/produk/${item.slug}`} className="font-heading text-lg leading-snug underline-offset-4 hover:underline">
                    {item.name}
                  </Link>
                  <span className={`w-fit rounded-full px-2 py-0.5 text-xs font-semibold ${item.productType === "READY_STOCK" ? "bg-badge-ready" : "bg-badge-preorder"}`}>
                    {PRODUCT_TYPE_LABEL[item.productType]}
                  </span>
                  <span className="text-sm text-muted-foreground">{formatRupiah(item.unitPrice)} / item</span>
                  {issue ? (
                    <p role="alert" className="text-sm font-medium text-danger">
                      {CART_ISSUE_LABEL[issue]}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                <QuantityStepper
                  id={`qty-${item.productId}`}
                  label={`Jumlah ${item.name}`}
                  value={item.quantity}
                  max={item.maxQuantityPerOrder}
                  onChange={(q) => setQuantity(item.productId, q)}
                />
                <span className="min-w-24 text-right font-semibold">{formatRupiah(item.unitPrice * item.quantity)}</span>
                <button
                  type="button"
                  onClick={() => remove(item.productId)}
                  className="min-h-11 rounded-control px-3 text-sm font-medium text-danger underline underline-offset-4"
                  aria-label={`Hapus ${item.name} dari keranjang`}
                >
                  Hapus
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <aside aria-labelledby="ringkasan-keranjang" className="h-fit rounded-card bg-surface p-5 lg:sticky lg:top-24">
        <h2 id="ringkasan-keranjang" className="mb-4 text-2xl">
          Ringkasan
        </h2>
        {fresh ? (
          <dl className="flex flex-col gap-2 text-sm" aria-live="polite">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{formatRupiah(validation.totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Diskon</dt>
              <dd>{validation.totals.discountTotal > 0 ? `-${formatRupiah(validation.totals.discountTotal)}` : formatRupiah(0)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd>{formatRupiah(validation.totals.grandTotal)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground" aria-busy="true">
            Memeriksa harga terbaru…
          </p>
        )}
        {validation?.hasPreorder ? (
          <div className="mt-4 flex flex-col gap-1 rounded-control bg-badge-preorder p-3 text-sm">
            <p>Keranjang berisi produk Pre-Order: tanggal pickup paling awal mengikuti waktu minimum produksi terlama.</p>
            <p>{CASH_UNAVAILABLE_REASON}</p>
          </div>
        ) : null}
        <p className="mt-4 text-xs text-muted-foreground">Total final dihitung ulang saat checkout. Tanggal pickup dipilih di halaman checkout.</p>
        {canCheckout ? (
          <Link href="/checkout" className="mt-4 flex min-h-12 items-center justify-center rounded-full bg-primary px-6 font-semibold text-primary-foreground hover:opacity-90">
            Lanjut ke Checkout
          </Link>
        ) : (
          <button type="button" disabled className="mt-4 min-h-12 w-full rounded-full bg-primary px-6 font-semibold text-primary-foreground opacity-60">
            Lanjut ke Checkout
          </button>
        )}
      </aside>
    </div>
  );
}
