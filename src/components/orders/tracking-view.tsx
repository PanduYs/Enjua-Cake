import { PAYMENT_METHOD_LABEL, PAYMENT_OPTION_LABEL } from "@/lib/copy/checkout";
import { CUSTOMER_CANCELLATION_REASON, ORDER_STATUS_LABEL, ORDER_TIMELINE, PAYMENT_STATUS_LABEL } from "@/lib/copy/orders";
import { formatIsoDateLong, formatWibDateTime } from "@/lib/format/date";
import { formatRupiah } from "@/lib/format/rupiah";
import type { TrackingView as View } from "@/lib/orders/tracking-view";

function Timeline({ status }: { status: View["orderStatus"] }) {
  const current = ORDER_TIMELINE.indexOf(status as (typeof ORDER_TIMELINE)[number]);
  return (
    <ol className="grid gap-2 sm:grid-cols-5" aria-label="Progres pesanan">
      {ORDER_TIMELINE.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={step}
            aria-current={active ? "step" : undefined}
            className={`flex items-center gap-2 rounded-control border px-3 py-2 text-sm ${
              active
                ? "border-primary bg-primary font-semibold text-primary-foreground"
                : done
                  ? "border-border bg-badge-ready"
                  : "border-border bg-background text-muted-foreground"
            }`}
          >
            <span aria-hidden="true">{done ? "✓" : index + 1}</span>
            <span>
              {ORDER_STATUS_LABEL[step]}
              {done ? <span className="sr-only"> (selesai)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Customer tracking view (FD-66–FD-69): no phone number, no admin notes, no token. */
export function TrackingView({ view, whatsapp }: { view: View; whatsapp: { question: string | null; cancellation: string | null } }) {
  const cancelled = view.orderStatus === "CANCELLED";
  const outstanding = view.paymentMethod !== "CASH" && view.orderStatus === "NEW" && view.paidAmount === 0;
  const dueNow = view.paymentOption === "DP_50" && view.dpAmount !== null ? view.dpAmount : view.grandTotal;

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="status-pesanan" className="flex flex-col gap-4 rounded-card bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="status-pesanan" className="text-xl">
            Pesanan{" "}
            <span className="font-mono" data-testid="tracking-order-number">
              {view.orderNumber}
            </span>
          </h2>
          <p className="text-sm text-muted-foreground">a.n. {view.customerName}</p>
        </div>
        <p className="text-lg" data-testid="tracking-status">
          Status: <strong>{ORDER_STATUS_LABEL[view.orderStatus]}</strong>
        </p>
        {cancelled ? (
          <p role="status" className="rounded-control border border-danger bg-background px-4 py-3 text-sm">
            {CUSTOMER_CANCELLATION_REASON[view.cancellation ?? "ADMIN"]}
          </p>
        ) : (
          <Timeline status={view.orderStatus} />
        )}
      </section>

      <section aria-labelledby="pembayaran" className="flex flex-col gap-2 rounded-card bg-surface p-5 text-sm sm:p-6">
        <h2 id="pembayaran" className="mb-1 text-xl">
          Pembayaran
        </h2>
        <p>
          Status pembayaran:{" "}
          <strong data-testid="tracking-payment-status">
            {PAYMENT_STATUS_LABEL[view.paymentStatus as keyof typeof PAYMENT_STATUS_LABEL] ?? view.paymentStatus}
          </strong>
        </p>
        <p>
          Metode: {PAYMENT_METHOD_LABEL[view.paymentMethod]} · {PAYMENT_OPTION_LABEL[view.paymentOption]}
        </p>
        <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          <dt>Total pesanan</dt>
          <dd className="text-right font-semibold">{formatRupiah(view.grandTotal)}</dd>
          {view.dpAmount !== null ? (
            <>
              <dt>DP 50%</dt>
              <dd className="text-right">{formatRupiah(view.dpAmount)}</dd>
            </>
          ) : null}
          <dt>Sudah dibayar</dt>
          <dd className="text-right">{formatRupiah(view.paidAmount)}</dd>
          <dt>Sisa pembayaran</dt>
          <dd className="text-right">{formatRupiah(view.remainingAmount)}</dd>
        </dl>
        {outstanding && view.reservationExpiresAt ? (
          <p className="mt-2 rounded-control bg-pastel-peach px-4 py-3">
            Bayar {formatRupiah(dueNow)} sebelum <strong>{formatWibDateTime(view.reservationExpiresAt)} WIB</strong>. Jika lewat batas waktu, pesanan dibatalkan
            otomatis.
          </p>
        ) : null}
        {view.paymentMethod === "CASH" && !cancelled && view.remainingAmount > 0 ? <p className="mt-2">Bayar penuh saat mengambil pesanan.</p> : null}
      </section>

      <section aria-labelledby="detail-pesanan" className="flex flex-col gap-2 rounded-card bg-surface p-5 text-sm sm:p-6">
        <h2 id="detail-pesanan" className="mb-1 text-xl">
          Detail Pesanan
        </h2>
        <p>
          Tanggal pickup: <strong>{formatIsoDateLong(view.pickupDate)}</strong>
        </p>
        <ul className="mt-2 divide-y divide-border">
          {view.items.map((item, index) => (
            <li key={`${item.name}-${index}`} className="flex justify-between gap-4 py-2">
              <span>
                {item.name} × {item.quantity}
              </span>
              <span>{formatRupiah(item.lineSubtotal)}</span>
            </li>
          ))}
        </ul>
        {view.discountTotal > 0 ? <p>Diskon: −{formatRupiah(view.discountTotal)}</p> : null}
      </section>

      {whatsapp.question || whatsapp.cancellation ? (
        <section aria-labelledby="bantuan" className="flex flex-col gap-2 rounded-card bg-surface p-5 text-sm sm:p-6">
          <h2 id="bantuan" className="mb-1 text-xl">
            Bantuan
          </h2>
          {whatsapp.question ? (
            <a href={whatsapp.question} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline underline-offset-4">
              Tanya tentang pesanan ini via WhatsApp
            </a>
          ) : null}
          {whatsapp.cancellation ? (
            <a href={whatsapp.cancellation} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline underline-offset-4">
              Ajukan pembatalan via WhatsApp
            </a>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
