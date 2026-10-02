import { ActionForm } from "@/components/admin/action-form";
import { PAYMENT_METHOD_LABEL } from "@/lib/copy/checkout";
import { EXCEPTION_KIND_LABEL, PAYMENT_PURPOSE_LABEL, PROOF_STATUS_LABEL, REFUND_STATUS_LABEL, TRANSACTION_STATUS_LABEL } from "@/lib/copy/payments";
import { formatWibDateTime } from "@/lib/format/date";
import { formatRupiah } from "@/lib/format/rupiah";
import type { getAdminOrderDetail } from "@/server/services/admin-orders";

import {
  adminUploadProofAction,
  approveProofAction,
  completeRefundAction,
  markCashPaidAction,
  recordRefundAction,
  rejectProofAction,
  resolveExceptionAction,
} from "../../pembayaran/actions";

type Detail = NonNullable<Awaited<ReturnType<typeof getAdminOrderDetail>>>;

const fieldClass = "min-h-11 rounded-control border border-border bg-background px-3";

/**
 * Admin payment tools for one order (§17, §18, §23): verify proofs, mark Cash
 * paid, upload a WhatsApp proof, resolve exceptions, record refunds.
 * No manual QRIS confirmation exists (FD-111).
 */
export function PaymentSection({ detail }: { detail: Detail }) {
  const { order, transactions, payments } = detail;
  const closed = order.orderStatus === "CANCELLED" || order.orderStatus === "COMPLETED";
  const pendingTransfer = transactions.some((t) => t.method === "BANK_TRANSFER" && t.status === "WAITING_PAYMENT" && !t.isException);
  const receivedAny = transactions.some((t) => t.status === "PAID");

  return (
    <section aria-labelledby="payment-admin" className="flex flex-col gap-4 rounded-card bg-surface p-5 text-sm">
      <h2 id="payment-admin" className="text-xl">
        Kelola Pembayaran
      </h2>

      {transactions.length > 0 ? (
        <div>
          <h3 className="mb-1 font-semibold">Transaksi</h3>
          <ul className="divide-y divide-border" data-testid="admin-transactions">
            {transactions.map((t) => (
              <li key={t.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {PAYMENT_PURPOSE_LABEL[t.purpose]} · {PAYMENT_METHOD_LABEL[t.method]} · {TRANSACTION_STATUS_LABEL[t.status]}
                  {t.isException ? <strong className="text-danger"> · Exception</strong> : null}
                  {t.paidAt ? <span className="text-muted-foreground"> · {formatWibDateTime(t.paidAt)} WIB</span> : null}
                </span>
                <span>{formatRupiah(t.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {order.paymentMethod === "QRIS" && order.orderStatus === "NEW" ? (
        <p className="text-muted-foreground">Pembayaran QRIS dikonfirmasi otomatis oleh sistem setelah notifikasi payment gateway terverifikasi.</p>
      ) : null}

      {order.paymentMethod === "CASH" && !closed && order.paidAmount === 0 ? (
        <ActionForm action={markCashPaidAction} submitLabel="Tandai Lunas (Cash)" confirmText={`Catat pembayaran Cash ${formatRupiah(order.grandTotal)}?`}>
          <input type="hidden" name="orderId" value={order.id} />
          <p>Tandai lunas saat customer membayar {formatRupiah(order.grandTotal)} di lokasi pickup.</p>
        </ActionForm>
      ) : null}

      {payments.proofs.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="font-semibold">Bukti Transfer</h3>
          {payments.proofs.map((p) => (
            <div key={p.id} className="flex flex-col gap-2 rounded-control border border-border p-3" data-testid="proof-item">
              <p>
                {PROOF_STATUS_LABEL[p.verificationStatus]} · diunggah {formatWibDateTime(p.uploadedAt)} WIB ·{" "}
                <a href={`/api/admin/files/${p.id}`} className="font-semibold text-primary underline underline-offset-4">
                  Unduh bukti ({p.mimeType === "application/pdf" ? "PDF" : "gambar"})
                </a>
              </p>
              {p.rejectionReason ? <p>Alasan penolakan: {p.rejectionReason}</p> : null}
              {p.verificationStatus === "PENDING" ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <ActionForm action={approveProofAction} submitLabel="Setujui Pembayaran">
                    <input type="hidden" name="proofId" value={p.id} />
                    <input type="hidden" name="orderId" value={order.id} />
                  </ActionForm>
                  <ActionForm action={rejectProofAction} submitLabel="Tolak Bukti" variant="danger" className="flex-1">
                    <input type="hidden" name="proofId" value={p.id} />
                    <input type="hidden" name="orderId" value={order.id} />
                    <label htmlFor={`reject-${p.id}`} className="font-semibold">
                      Alasan penolakan <span aria-hidden="true">*</span>
                    </label>
                    <input id={`reject-${p.id}`} name="reason" required maxLength={500} className={fieldClass} />
                  </ActionForm>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {pendingTransfer && !closed ? (
        <ActionForm action={adminUploadProofAction} submitLabel="Unggah Bukti">
          <input type="hidden" name="orderId" value={order.id} />
          <label htmlFor="admin-proof" className="font-semibold">
            Unggah bukti dari WhatsApp
          </label>
          <input id="admin-proof" name="file" type="file" accept=".jpg,.jpeg,.png,.pdf" required />
          <p className="text-muted-foreground">JPG, PNG, atau PDF, maksimal 5 MB.</p>
        </ActionForm>
      ) : null}

      {payments.exceptions.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="font-semibold">Payment Exception</h3>
          {payments.exceptions.map((e) => (
            <div key={e.id} className="flex flex-col gap-2 rounded-control border border-danger p-3">
              <p>
                <strong>{EXCEPTION_KIND_LABEL[e.kind]}</strong> · {e.status === "OPEN" ? "Perlu ditangani" : "Selesai"}
                {e.resolutionNote ? <> · {e.resolutionNote}</> : null}
              </p>
              {e.status === "OPEN" ? (
                <ActionForm action={resolveExceptionAction} submitLabel="Simpan Penyelesaian">
                  <input type="hidden" name="exceptionId" value={e.id} />
                  <input type="hidden" name="orderId" value={order.id} />
                  <fieldset className="flex flex-wrap gap-4">
                    <legend className="mb-1 font-semibold">Penyelesaian</legend>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="resolution" value="REFUNDED" defaultChecked /> Refund ke customer
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="resolution" value="RESOLVED_MANUALLY" /> Selesai manual
                    </label>
                  </fieldset>
                  <label htmlFor={`note-${e.id}`} className="font-semibold">
                    Catatan <span aria-hidden="true">*</span>
                  </label>
                  <input id={`note-${e.id}`} name="note" required maxLength={500} className={fieldClass} />
                  <p className="text-muted-foreground">Pesanan yang dibatalkan tidak dapat diaktifkan kembali; customer dapat membuat pesanan baru.</p>
                </ActionForm>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {payments.refunds.length > 0 ? (
        <div>
          <h3 className="mb-1 font-semibold">Refund</h3>
          <ul className="divide-y divide-border">
            {payments.refunds.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-2">
                <span>
                  {formatRupiah(r.amount)} · {REFUND_STATUS_LABEL[r.status as keyof typeof REFUND_STATUS_LABEL] ?? r.status} · {r.reason}
                  {r.refundedAt ? <> · {formatWibDateTime(r.refundedAt)} WIB</> : null}
                </span>
                {r.status === "PENDING" ? (
                  <ActionForm action={completeRefundAction} submitLabel="Tandai Refund Selesai" variant="secondary">
                    <input type="hidden" name="refundId" value={r.id} />
                    <input type="hidden" name="orderId" value={order.id} />
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {receivedAny && order.orderStatus === "CANCELLED" ? (
        <details className="rounded-control border border-border p-3">
          <summary className="cursor-pointer font-semibold">Catat Refund</summary>
          <ActionForm action={recordRefundAction} submitLabel="Simpan Refund" className="mt-3">
            <input type="hidden" name="orderId" value={order.id} />
            <label htmlFor="refund-amount" className="font-semibold">
              Nominal (Rp)
            </label>
            <input id="refund-amount" name="amount" inputMode="numeric" required className={fieldClass} />
            <label htmlFor="refund-reason" className="font-semibold">
              Alasan
            </label>
            <input id="refund-reason" name="reason" required maxLength={500} className={fieldClass} />
            <label htmlFor="refund-status" className="font-semibold">
              Status
            </label>
            <select id="refund-status" name="status" defaultValue="COMPLETED" className={fieldClass}>
              <option value="COMPLETED">Selesai (dana sudah dikembalikan)</option>
              <option value="PENDING">Diproses</option>
            </select>
            <p className="text-muted-foreground">Kebijakan refund ditentukan pemilik usaha; sistem hanya mencatat.</p>
          </ActionForm>
        </details>
      ) : null}
    </section>
  );
}
