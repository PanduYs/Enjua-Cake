"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { PAYMENT_METHOD_LABEL, PAYMENT_OPTION_LABEL } from "@/lib/copy/checkout";
import { formatRupiah } from "@/lib/format/rupiah";
import { useCartStore } from "@/lib/cart/store";
import { readLastOrder, type LastOrder } from "@/lib/orders/last-order";
import { buildWhatsAppLink } from "@/lib/whatsapp";

import { formatIsoDateLong } from "@/lib/format/date";
import { CopyButton } from "./copy-button";

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));

/** Order success (FD-71): order number, access code, copy, tracking link, WhatsApp help. */
export function OrderSuccess({ whatsappNumber, businessName }: { whatsappNumber: string | null; businessName: string }) {
  const [order, setOrder] = useState<LastOrder | null | undefined>(undefined);
  const clearCart = useCartStore((s) => s.clear);

  useEffect(() => {
    const last = readLastOrder();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is only readable after mount
    setOrder(last);
    if (last) clearCart();
  }, [clearCart]);

  if (order === undefined) return <div className="h-64 animate-pulse rounded-card bg-surface" aria-busy="true" aria-label="Memuat pesanan" />;

  if (order === null) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-card bg-surface p-8 text-center">
        <p>Informasi pesanan terakhir tidak ditemukan di perangkat ini.</p>
        <Link href="/lacak" className="inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground">
          Lacak Pesanan
        </Link>
      </div>
    );
  }

  const trackingHref = `/lacak#o=${encodeURIComponent(order.orderNumber)}&t=${encodeURIComponent(order.trackingToken)}`;
  // WhatsApp text carries the order number only, never the access code (FD-77).
  const whatsappHref = whatsappNumber ? buildWhatsAppLink(whatsappNumber, { kind: "order", orderNumber: order.orderNumber }, businessName) : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="rounded-card bg-badge-ready p-5" role="status">
        <p className="font-heading text-2xl">Pesanan berhasil dibuat.</p>
        <p className="mt-1 text-sm">Simpan nomor pesanan dan kode akses di bawah ini.</p>
      </div>

      <section aria-labelledby="nomor-pesanan" className="flex flex-col gap-3 rounded-card bg-surface p-5">
        <h2 id="nomor-pesanan" className="text-xl">
          Nomor Pesanan
        </h2>
        <p className="font-mono text-2xl font-semibold tracking-wide" data-testid="order-number">
          {order.orderNumber}
        </p>
        <CopyButton value={order.orderNumber} label="Salin nomor pesanan" />
      </section>

      <section aria-labelledby="kode-akses" className="flex flex-col gap-3 rounded-card border-2 border-accent bg-surface p-5">
        <h2 id="kode-akses" className="text-xl">
          Kode Akses
        </h2>
        <p className="text-sm font-semibold text-danger">
          Penting: kode ini diperlukan untuk melacak pesanan dan tidak dapat ditampilkan lagi. Simpan sekarang.
        </p>
        <p className="font-mono text-lg break-all" data-testid="tracking-token">
          {order.trackingToken}
        </p>
        <div className="flex flex-wrap gap-2">
          <CopyButton value={order.trackingToken} label="Salin kode akses" />
          <Link href={trackingHref} className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">
            Lacak Pesanan Sekarang
          </Link>
        </div>
      </section>

      <section aria-labelledby="ringkasan" className="flex flex-col gap-2 rounded-card bg-surface p-5 text-sm">
        <h2 id="ringkasan" className="mb-1 text-xl">
          Ringkasan
        </h2>
        <p>Tanggal pickup: {formatIsoDateLong(order.pickupDate)}</p>
        <p>
          Pembayaran: {PAYMENT_METHOD_LABEL[order.paymentMethod]} · {PAYMENT_OPTION_LABEL[order.paymentOption]}
        </p>
        <p>Total pesanan: {formatRupiah(order.payment.total)}</p>
        {order.payment.dpAmount !== null ? (
          <p>
            DP 50%: {formatRupiah(order.payment.dpAmount)} · Sisa: {formatRupiah(order.payment.remaining)}
          </p>
        ) : null}
        <h3 className="mt-3 text-lg">Langkah berikutnya</h3>
        {order.paymentMethod === "CASH" ? (
          <p>Bayar penuh {formatRupiah(order.payment.dueNow)} saat mengambil pesanan.</p>
        ) : (
          <>
            <p>
              Lakukan pembayaran {formatRupiah(order.payment.dueNow)} melalui {PAYMENT_METHOD_LABEL[order.paymentMethod]}
              {order.reservationExpiresAt ? <> sebelum {formatTime(order.reservationExpiresAt)} WIB</> : null}. Jika lewat batas waktu, pesanan dibatalkan
              otomatis.
            </p>
            <p className="text-muted-foreground">Lanjutkan pembayaran melalui tombol Pantau status pesanan dan pembayaran di halaman lacak pesanan.ldquo;Lacak Pesanan SekarangPantau status pesanan dan pembayaran di halaman lacak pesanan.rdquo; di atas.</p>
          </>
        )}
      </section>

      {whatsappHref ? (
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="self-start text-sm font-semibold text-primary underline underline-offset-4">
          Butuh bantuan? Hubungi kami via WhatsApp
        </a>
      ) : null}
    </div>
  );
}
