import Link from "next/link";
import type { ReactNode } from "react";

import { PAYMENT_METHOD_LABEL, PAYMENT_OPTION_LABEL } from "@/lib/copy/checkout";
import { formatIsoDateLong } from "@/lib/format/date";
import { formatRupiah } from "@/lib/format/rupiah";
import { customerProgress, customerStatus, type ProgressStep } from "@/lib/orders/customer-status";
import type { TrackingView as View } from "@/lib/orders/tracking-view";

import { OrderStatusSummary } from "./order-status-summary";
import { PriceSummary, UnitPrice } from "./price-display";

const STEP_ICON: Record<ProgressStep["state"], string> = { done: "✓", current: "●", todo: "○" };
const STEP_SR: Record<ProgressStep["state"], string> = { done: "selesai", current: "tahap saat ini", todo: "belum" };

function Progress({ steps }: { steps: ProgressStep[] }) {
  return (
    <ol className="flex flex-col" aria-label="Progres pesanan">
      {steps.map((step, index) => (
        <li key={step.key} aria-current={step.state === "current" ? "step" : undefined} className="relative flex gap-3 pb-3 last:pb-0">
          {index < steps.length - 1 ? (
            <span aria-hidden="true" className={`absolute top-7 left-[0.8125rem] h-[calc(100%-1.5rem)] w-0.5 ${step.state === "done" ? "bg-success" : "bg-border"}`} />
          ) : null}
          <span
            aria-hidden="true"
            className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
              step.state === "done"
                ? "bg-success text-surface"
                : step.state === "current"
                  ? "bg-primary text-primary-foreground ring-4 ring-pastel-peach"
                  : "border-2 border-border bg-background text-muted-foreground"
            }`}
          >
            {STEP_ICON[step.state]}
          </span>
          <span className="flex flex-col pt-0.5">
            <span className={step.state === "current" ? "font-semibold" : step.state === "todo" ? "text-muted-foreground" : ""}>
              {step.label}
              <span className="sr-only"> ({STEP_SR[step.state]})</span>
            </span>
            {step.note ? <span className="text-xs text-muted-foreground">{step.note}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Customer tracking view (FD-66–FD-69): no phone number, no admin notes, no token. */
export function TrackingView({
  view,
  whatsapp,
  paymentSlot,
}: {
  view: View;
  whatsapp: { question: string | null; cancellation: string | null };
  paymentSlot?: ReactNode;
}) {
  const input = {
    orderStatus: view.orderStatus,
    paymentStatus: view.paymentStatus,
    paymentMethod: view.paymentMethod,
    paymentOption: view.paymentOption,
    grandTotal: view.grandTotal,
    dpAmount: view.dpAmount,
    paidAmount: view.paidAmount,
    remainingAmount: view.remainingAmount,
    cancellation: view.cancellation,
    refundedAmount: view.refundedAmount,
  };
  const status = customerStatus(input);
  const progress = customerProgress(input);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <section aria-labelledby="status-pesanan" className="flex flex-col gap-3 rounded-card bg-surface p-4 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="status-pesanan" className="text-xl">
            Pesanan{" "}
            <span className="font-mono" data-testid="tracking-order-number">
              {view.orderNumber}
            </span>
          </h2>
          <p className="text-sm text-muted-foreground">a.n. {view.customerName}</p>
        </div>
        <p className="text-sm sm:text-base" data-testid="tracking-headline">
          {status.headline}
        </p>
        <OrderStatusSummary status={status} testIds={{ payment: "tracking-payment-status", processing: "tracking-status" }} />
        {status.action === "NEW_ORDER" ? (
          <Link href="/produk" className="inline-flex min-h-11 items-center justify-center self-start rounded-full bg-primary px-5 font-semibold text-primary-foreground">
            Buat Pesanan Baru
          </Link>
        ) : null}
      </section>

      {paymentSlot}

      {progress ? (
        <section aria-labelledby="progres" className="flex flex-col gap-3 rounded-card bg-surface p-4 sm:p-6">
          <h2 id="progres" className="text-xl">
            Progres
          </h2>
          <Progress steps={progress} />
        </section>
      ) : null}

      <section aria-labelledby="pembayaran" className="flex flex-col gap-2 rounded-card bg-surface p-4 text-sm sm:p-6">
        <h2 id="pembayaran" className="mb-1 text-xl">
          Rincian Pembayaran
        </h2>
        <p>
          Metode: {PAYMENT_METHOD_LABEL[view.paymentMethod]} · {PAYMENT_OPTION_LABEL[view.paymentOption]}
        </p>
        <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
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
          {view.refundedAmount > 0 ? (
            <>
              <dt>Dana dikembalikan</dt>
              <dd className="text-right">{formatRupiah(view.refundedAmount)}</dd>
            </>
          ) : null}
        </dl>
      </section>

      <section aria-labelledby="detail-pesanan" className="flex flex-col gap-2 rounded-card bg-surface p-4 text-sm sm:p-6">
        <h2 id="detail-pesanan" className="mb-1 text-xl">
          Detail Pesanan
        </h2>
        <p>
          Tanggal pickup: <strong>{formatIsoDateLong(view.pickupDate)}</strong>
        </p>
        <ul className="mt-1 divide-y divide-border">
          {view.items.map((item, index) => (
            <li key={`${item.name}-${index}`} className="flex justify-between gap-4 py-2">
              <span className="flex flex-col">
                <span>
                  {item.name} × {item.quantity}
                </span>
                <UnitPrice normal={item.unitPrice} effective={item.effectiveUnitPrice} />
              </span>
              <span className="whitespace-nowrap">{formatRupiah(item.lineSubtotal)}</span>
            </li>
          ))}
        </ul>
        <PriceSummary subtotal={view.subtotal} discountTotal={view.discountTotal} total={view.grandTotal} className="border-t border-border pt-2" />
      </section>

      {whatsapp.question || whatsapp.cancellation ? (
        <section aria-labelledby="bantuan" className="flex flex-col gap-2 rounded-card bg-surface p-4 text-sm sm:p-6">
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
