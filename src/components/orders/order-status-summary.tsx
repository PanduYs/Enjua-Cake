import type { CustomerStatus, StatusRow, StatusTone } from "@/lib/orders/customer-status";

const TONE_CLASS: Record<StatusTone, string> = {
  success: "bg-badge-ready",
  waiting: "bg-pastel-peach",
  info: "bg-pastel-beige",
  danger: "bg-surface border border-danger",
  neutral: "bg-surface-muted",
};

function Row({ title, row, testId }: { title: string; row: StatusRow; testId?: string }) {
  return (
    <div className={`flex flex-col gap-0.5 rounded-control px-3 py-2.5 ${TONE_CLASS[row.tone]}`}>
      <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</dt>
      <dd className="flex flex-col gap-0.5">
        <span className="flex items-center gap-2 font-semibold">
          <span aria-hidden="true" className="w-5 shrink-0 text-center">
            {row.icon}
          </span>
          <span data-testid={testId}>{row.label}</span>
        </span>
        {row.message ? <span className="pl-7 text-sm">{row.message}</span> : null}
      </dd>
    </div>
  );
}

/**
 * Order / payment / processing shown side by side but never merged (order created ≠ paid).
 * Colour is decoration only: every row has an icon and a text label (WCAG 1.4.1).
 */
export function OrderStatusSummary({ status, testIds = {} }: { status: CustomerStatus; testIds?: { order?: string; payment?: string; processing?: string } }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-3" aria-label="Status pesanan dan pembayaran">
      <Row title="Pesanan" row={status.order} testId={testIds.order} />
      <Row title="Pembayaran" row={status.payment} testId={testIds.payment} />
      <Row title="Pemrosesan" row={status.processing} testId={testIds.processing} />
    </dl>
  );
}
