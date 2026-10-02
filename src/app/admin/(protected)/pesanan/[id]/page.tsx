import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { RegenerateTokenForm, TransitionControl } from "@/components/admin/transition-control";
import { PAYMENT_METHOD_LABEL, PAYMENT_OPTION_LABEL } from "@/lib/copy/checkout";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/copy/orders";
import { formatIsoDateLong, formatWibDateTime } from "@/lib/format/date";
import { formatRupiah } from "@/lib/format/rupiah";
import { requireAdmin } from "@/server/auth/session";
import { systemClock } from "@/server/clock";
import { getDb } from "@/server/db/client";
import { getAdminOrderDetail } from "@/server/services/admin-orders";

import { regenerateTokenAction, transitionOrderAction } from "../actions";
import { PaymentSection } from "./payment-section";
import { describeOverride, OVERRIDE_LABEL } from "@/lib/copy/admin";

export const metadata: Metadata = { title: "Detail Pesanan" };

const ACTOR_LABEL = {
  ADMIN: "Admin",
  SYSTEM: "Sistem",
  CUSTOMER: "Customer",
} as const;
const EVENT_LABEL: Record<string, string> = {
  ORDER_CREATED: "Pesanan dibuat",
  ORDER_STATUS_CHANGED: "Status diubah",
  TRACKING_TOKEN_REGENERATED: "Kode akses dibuat ulang",
  QRIS_CREATED: "QRIS dibuat",
  PAYMENT_CONFIRMED: "Pembayaran terverifikasi",
  PAYMENT_FAILED: "Pembayaran gagal",
  PAYMENT_EXPIRED: "Pembayaran kedaluwarsa",
  PAYMENT_EXCEPTION_OPENED: "Payment Exception dibuat",
  PAYMENT_EXCEPTION_RESOLVED: "Payment Exception diselesaikan",
  PAYMENT_PROOF_UPLOADED: "Bukti transfer diunggah",
  PAYMENT_PROOF_APPROVED: "Bukti transfer disetujui",
  PAYMENT_PROOF_REJECTED: "Bukti transfer ditolak",
  TRANSFER_REMAINING_STARTED: "Pelunasan via transfer dimulai",
  CASH_MARKED_PAID: "Cash ditandai lunas",
  MANUAL_ORDER_CREATED: "Manual Order dibuat",
  ORDER_OVERRIDE_APPLIED: "Override validasi",
  REFUND_RECORDED: "Refund dicatat",
  REFUND_COMPLETED: "Refund selesai",
};
function describeChange(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { orderStatus?: keyof typeof ORDER_STATUS_LABEL };
  return v.orderStatus ? ORDER_STATUS_LABEL[v.orderStatus] : null;
}

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const detail = await getAdminOrderDetail(getDb(), id, systemClock);
  if (!detail) notFound();
  const { order, items, audit, cancelledBy, allowed, blocked } = detail;

  return (
    <section className="flex flex-col gap-6">
      <Link href="/admin/pesanan" className="self-start underline underline-offset-4">
        ← Semua pesanan
      </Link>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-mono text-2xl sm:text-3xl">{order.orderNumber}</h1>
        <p data-testid="admin-order-status" className="rounded-full bg-surface-muted px-4 py-1 font-semibold">
          {ORDER_STATUS_LABEL[order.orderStatus]}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <section aria-labelledby="customer" className="rounded-card bg-surface p-5 text-sm">
            <h2 id="customer" className="mb-2 text-xl">
              Customer &amp; Pickup
            </h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt>Nama</dt>
              <dd>{order.customerName}</dd>
              <dt>WhatsApp</dt>
              <dd>
                <a
                  href={`https://wa.me/${order.customerPhone.replace(/^\+/, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-4"
                >
                  {order.customerPhone}
                </a>
              </dd>
              <dt>Tanggal pickup</dt>
              <dd>{formatIsoDateLong(order.pickupDate)}</dd>
              <dt>Sumber</dt>
              <dd>{order.source === "MANUAL" ? "Manual Order" : "Website"}</dd>
              <dt>Dibuat</dt>
              <dd>{formatWibDateTime(order.createdAt)} WIB</dd>
              {order.notes ? (
                <>
                  <dt>Catatan</dt>
                  <dd className="whitespace-pre-wrap">{order.notes}</dd>
                </>
              ) : null}
            </dl>
          </section>

          <section aria-labelledby="items" className="rounded-card bg-surface p-5 text-sm">
            <h2 id="items" className="mb-2 text-xl">
              Item
            </h2>
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.id} className="flex justify-between gap-4 py-2">
                  <span>
                    {item.productNameSnapshot} × {item.quantity} @ {formatRupiah(item.effectiveUnitPrice)}
                  </span>
                  <span>{formatRupiah(item.lineSubtotal)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="payment" className="rounded-card bg-surface p-5 text-sm">
            <h2 id="payment" className="mb-2 text-xl">
              Pembayaran
            </h2>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
              <dt>Metode</dt>
              <dd className="text-right">
                {PAYMENT_METHOD_LABEL[order.paymentMethod]} · {PAYMENT_OPTION_LABEL[order.paymentOption]}
              </dd>
              <dt>Status pembayaran</dt>
              <dd className="text-right">{PAYMENT_STATUS_LABEL[order.paymentStatus]}</dd>
              <dt>Subtotal</dt>
              <dd className="text-right">{formatRupiah(order.subtotal)}</dd>
              {order.discountTotal > 0 ? (
                <>
                  <dt>Diskon</dt>
                  <dd className="text-right">−{formatRupiah(order.discountTotal)}</dd>
                </>
              ) : null}
              <dt>Total</dt>
              <dd className="text-right font-semibold">{formatRupiah(order.grandTotal)}</dd>
              {order.dpAmount !== null ? (
                <>
                  <dt>DP 50%</dt>
                  <dd className="text-right">{formatRupiah(order.dpAmount)}</dd>
                </>
              ) : null}
              <dt>Dibayar</dt>
              <dd className="text-right">{formatRupiah(order.paidAmount)}</dd>
              <dt>Sisa</dt>
              <dd className="text-right">{formatRupiah(order.remainingAmount)}</dd>
              {order.reservationExpiresAt && order.orderStatus === "NEW" ? (
                <>
                  <dt>Batas pembayaran</dt>
                  <dd className="text-right">{formatWibDateTime(order.reservationExpiresAt)} WIB</dd>
                </>
              ) : null}
            </dl>
          </section>

          {detail.overrides.length > 0 ? (
            <section aria-labelledby="override" className="rounded-card border border-accent bg-surface p-5 text-sm">
              <h2 id="override" className="mb-2 text-xl">
                Override Manual Order
              </h2>
              <ul className="flex flex-col gap-2">
                {detail.overrides.map((o) => (
                  <li key={o.id} className="border-l-2 border-accent pl-3">
                    <p className="font-semibold">{OVERRIDE_LABEL[o.type]}</p>
                    <p>{describeOverride(o.type, o.before as Record<string, unknown>, o.after as Record<string, unknown>)}</p>
                    <p>Alasan: {o.reason}</p>
                    <p className="text-muted-foreground">
                      {o.adminName ?? "Admin"} · {formatWibDateTime(o.createdAt)} WIB
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <PaymentSection detail={detail} />
        </div>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="status-actions" className="rounded-card bg-surface p-5">
            <h2 id="status-actions" className="mb-3 text-xl">
              Ubah Status
            </h2>
            {order.orderStatus === "CANCELLED" ? (
              <div className="mb-3 text-sm">
                <p>
                  Dibatalkan oleh {order.cancelledByType === "SYSTEM" ? "Sistem" : (cancelledBy ?? "Admin")}
                  {order.cancelledAt ? <> pada {formatWibDateTime(order.cancelledAt)} WIB</> : null}.
                </p>
                <p>Alasan: {order.cancellationReason === "PAYMENT_EXPIRED" ? "Batas waktu pembayaran habis" : order.cancellationReason}</p>
              </div>
            ) : null}
            <TransitionControl
              key={order.orderStatus}
              orderId={order.id}
              current={order.orderStatus}
              allowed={allowed}
              blocked={blocked}
              action={transitionOrderAction}
            />
          </section>

          <section aria-labelledby="access-code" className="rounded-card bg-surface p-5 text-sm">
            <h2 id="access-code" className="mb-2 text-xl">
              Kode Akses
            </h2>
            <p className="mb-3 text-muted-foreground">Kode akses tidak dapat ditampilkan ulang. Buat kode baru jika customer kehilangan kodenya.</p>
            <RegenerateTokenForm orderId={order.id} action={regenerateTokenAction} />
          </section>

          <section aria-labelledby="history" className="rounded-card bg-surface p-5 text-sm">
            <h2 id="history" className="mb-2 text-xl">
              Riwayat
            </h2>
            <ol className="flex flex-col gap-2">
              {audit.map((entry) => {
                const to = describeChange(entry.newValue);
                return (
                  <li key={entry.id} className="border-l-2 border-border pl-3">
                    <p className="font-semibold">
                      {EVENT_LABEL[entry.eventType] ?? entry.eventType}
                      {to ? <> → {to}</> : null}
                    </p>
                    <p className="text-muted-foreground">
                      {formatWibDateTime(entry.createdAt)} WIB · {entry.actorName ?? ACTOR_LABEL[entry.actorType]}
                    </p>
                    {entry.reason ? <p>Alasan: {entry.reason === "PAYMENT_EXPIRED" ? "Batas waktu pembayaran habis" : entry.reason}</p> : null}
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>
    </section>
  );
}
