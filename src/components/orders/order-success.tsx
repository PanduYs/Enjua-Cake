"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { PAYMENT_METHOD_LABEL, PAYMENT_OPTION_LABEL } from "@/lib/copy/checkout";
import { formatIsoDateLong } from "@/lib/format/date";
import { formatRupiah } from "@/lib/format/rupiah";
import { useCartStore } from "@/lib/cart/store";
import { customerStatus } from "@/lib/orders/customer-status";
import { readLastOrder, type LastOrder } from "@/lib/orders/last-order";
import { buildWhatsAppLink } from "@/lib/whatsapp";

import { CopyButton } from "./copy-button";
import { OrderStatusSummary } from "./order-status-summary";
import { PriceSummary, UnitPrice } from "./price-display";

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));

const primaryLink = "inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-center font-semibold text-primary-foreground hover:opacity-90";
const secondaryLink = "inline-flex min-h-11 items-center justify-center rounded-full border-2 border-primary px-5 text-center text-sm font-semibold text-primary";

/**
 * After checkout (FD-71): the order is recorded, but payment is a separate step. The status
 * shown is the order's real state at creation — nothing can be paid before this page loads:
 * QRIS/Transfer start WAITING_PAYMENT, Cash UNPAID (paid at pickup). Live status is on /lacak.
 */
export function OrderSuccess({ whatsappNumber, businessName }: { whatsappNumber: string | null; businessName: string }) {
  const [order, setOrder] = useState<LastOrder | null | undefined>(undefined);
  const clearCart = useCartStore((s) => s.clear);

  useEffect(() => {
    const last = readLastOrder();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is only readable after mount
    setOrder(last);
    if (last) clearCart();
  }, [clearCart]);

  if (order === undefined) {
    return (
      <>
        <h1 className="sr-only">Pesanan</h1>
        <div className="h-64 animate-pulse rounded-card bg-surface" aria-busy="true" aria-label="Memuat pesanan" />
      </>
    );
  }

  if (order === null) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-card bg-surface p-8 text-center">
        <h1 className="text-2xl">Pesanan</h1>
        <p>Informasi pesanan terakhir tidak ditemukan di perangkat ini.</p>
        <Link href="/lacak" className={primaryLink}>
          Lacak Pesanan
        </Link>
      </div>
    );
  }

  const isCash = order.paymentMethod === "CASH";
  const isDp = order.payment.dpAmount !== null;
  const status = customerStatus({
    orderStatus: "NEW",
    paymentStatus: isCash ? "UNPAID" : "WAITING_PAYMENT",
    paymentMethod: order.paymentMethod,
    paymentOption: order.paymentOption,
    grandTotal: order.payment.total,
    dpAmount: order.payment.dpAmount,
    paidAmount: 0,
    remainingAmount: order.payment.total,
    cancellation: null,
  });

  // Subtotal/Diskon come from the confirmation step; shown only when they add up to the server total.
  const priced = order.subtotal !== undefined && order.discountTotal !== undefined && order.subtotal - order.discountTotal === order.payment.total;
  const summarySubtotal = priced ? order.subtotal! : order.payment.total;
  const summaryDiscount = priced ? order.discountTotal! : 0;

  const trackingHref = `/lacak#o=${encodeURIComponent(order.orderNumber)}&t=${encodeURIComponent(order.trackingToken)}`;
  // WhatsApp text carries the order number only, never the access code (FD-77).
  const whatsappHref = whatsappNumber ? buildWhatsAppLink(whatsappNumber, { kind: "order", orderNumber: order.orderNumber }, businessName) : null;
  const payCta = order.paymentMethod === "QRIS" ? "Bayar Sekarang dengan QRIS" : order.paymentMethod === "BANK_TRANSFER" ? "Lihat Instruksi Pembayaran" : null;
  const payHint =
    order.paymentMethod === "QRIS"
      ? "QRIS ditampilkan di halaman Lacak Pesanan. Pindai dengan aplikasi bank atau e-wallet."
      : order.paymentMethod === "BANK_TRANSFER"
        ? "Rekening tujuan dan tempat unggah bukti transfer ada di halaman Lacak Pesanan."
        : "Status pesanan bisa dipantau kapan saja di halaman Lacak Pesanan.";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 sm:gap-5">
      <section aria-labelledby="pesanan-tercatat" className="flex flex-col gap-4 rounded-card bg-surface p-4 sm:p-6">
        <div role="status" className="flex flex-col gap-1">
          <h1 id="pesanan-tercatat" className="text-[1.75rem] leading-tight sm:text-4xl">
            Pesanan kamu sudah tercatat <span aria-hidden="true">🎉</span>
          </h1>
          {/* The h1 already says "tercatat"; only the payment consequence is added here. */}
          <p className="text-sm sm:text-base" data-testid="success-headline">
            {isCash ? "Pembayaran dilakukan secara tunai saat pengambilan." : "Pesanan belum dapat diproses sampai pembayaran dikonfirmasi."}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-background px-3 py-2">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Nomor Pesanan</p>
            <p className="font-mono text-lg font-semibold tracking-wide sm:text-xl" data-testid="order-number">
              {order.orderNumber}
            </p>
          </div>
          <CopyButton value={order.orderNumber} label="Salin nomor pesanan" />
        </div>

        <OrderStatusSummary status={status} testIds={{ payment: "success-payment-status", processing: "success-processing-status" }} />

        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm" data-testid="success-amounts">
          <dt>Total Pesanan</dt>
          <dd className="text-right font-semibold">{formatRupiah(order.payment.total)}</dd>
          {isDp ? (
            <>
              <dt>DP yang Harus Dibayar</dt>
              <dd className="text-right font-semibold">{formatRupiah(order.payment.dpAmount!)}</dd>
              <dt>Sisa Pembayaran</dt>
              <dd className="text-right">{formatRupiah(order.payment.remaining)}</dd>
            </>
          ) : (
            <>
              <dt>{isCash ? "Dibayar saat pengambilan" : "Yang Harus Dibayar"}</dt>
              <dd className="text-right font-semibold">{formatRupiah(order.payment.dueNow)}</dd>
            </>
          )}
        </dl>

        {!isCash && order.reservationExpiresAt ? (
          <p className="rounded-control bg-pastel-peach px-3 py-2 text-sm">
            Bayar sebelum <strong>{formatTime(order.reservationExpiresAt)} WIB</strong>. Jika lewat batas waktu, pesanan dibatalkan otomatis dan slot pickup dilepas.
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {payCta ? (
              <Link href={trackingHref} className={primaryLink}>
                {payCta}
              </Link>
            ) : null}
            <Link href={trackingHref} className={payCta ? secondaryLink : primaryLink}>
              Lacak Pesanan Sekarang
            </Link>
          </div>
          <p className="text-sm text-muted-foreground" data-testid="payment-next-step">
            {payHint}
          </p>
        </div>
      </section>

      <section aria-labelledby="kode-akses" className="flex flex-col gap-2 rounded-card border-2 border-accent bg-surface p-4 sm:p-6">
        <h2 id="kode-akses" className="text-xl">
          Kode Akses
        </h2>
        <p className="text-sm font-semibold text-danger">Simpan kode ini sekarang. Kode diperlukan untuk melacak pesanan dan tidak dapat ditampilkan lagi.</p>
        <p className="font-mono text-base break-all sm:text-lg" data-testid="tracking-token">
          {order.trackingToken}
        </p>
        <CopyButton value={order.trackingToken} label="Salin kode akses" />
      </section>

      <section aria-labelledby="ringkasan" className="flex flex-col gap-2 rounded-card bg-surface p-4 text-sm sm:p-6">
        <h2 id="ringkasan" className="text-xl">
          Ringkasan Pesanan
        </h2>
        {order.lines && order.lines.length > 0 ? (
          <ul className="divide-y divide-border">
            {order.lines.map((line, index) => (
              <li key={`${line.name}-${index}`} className="flex justify-between gap-3 py-1.5">
                <span className="flex flex-col">
                  <span>
                    {line.name} × {line.quantity}
                  </span>
                  {line.unitPrice !== undefined && line.effectiveUnitPrice !== undefined ? <UnitPrice normal={line.unitPrice} effective={line.effectiveUnitPrice} /> : null}
                </span>
                <span className="whitespace-nowrap">{formatRupiah(line.lineSubtotal)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <PriceSummary subtotal={summarySubtotal} discountTotal={summaryDiscount} total={order.payment.total} className="border-t border-border pt-2" />
        <p>Tanggal pickup: {formatIsoDateLong(order.pickupDate)}</p>
        <p>
          Pembayaran: {PAYMENT_METHOD_LABEL[order.paymentMethod]} · {PAYMENT_OPTION_LABEL[order.paymentOption]}
        </p>
      </section>

      {whatsappHref ? (
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="self-start text-sm font-semibold text-primary underline underline-offset-4">
          Butuh bantuan? Hubungi kami via WhatsApp
        </a>
      ) : null}
    </div>
  );
}
