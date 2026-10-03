import type { Metadata } from "next";
import Link from "next/link";

import { EXCEPTION_KIND_LABEL, PAYMENT_PURPOSE_LABEL } from "@/lib/copy/payments";
import { PAYMENT_STATUS_LABEL } from "@/lib/copy/orders";
import { formatWibDateTime } from "@/lib/format/date";
import { formatRupiah } from "@/lib/format/rupiah";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getPaymentQueue } from "@/server/services/payment-admin";

export const metadata: Metadata = { title: "Pembayaran" };

const linkClass = "font-mono font-semibold text-primary underline underline-offset-4";

/** Work queue (§26): proofs to verify, open Payment Exceptions, cancelled orders holding money. */
export default async function AdminPaymentsPage() {
  await requireAdmin();
  const { proofs, exceptions, refundCandidates } = await getPaymentQueue(getDb());

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl sm:text-3xl">Pembayaran</h1>

      <section aria-labelledby="verifikasi" className="rounded-card bg-surface p-5 text-sm">
        <h2 id="verifikasi" className="mb-3 text-xl">
          Menunggu Verifikasi ({proofs.length})
        </h2>
        {proofs.length === 0 ? (
          <p className="text-muted-foreground">Tidak ada bukti transfer yang menunggu verifikasi.</p>
        ) : (
          <ul className="divide-y divide-border">
            {proofs.map((p) => (
              <li key={p.proofId} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <Link href={`/admin/pesanan/${p.orderId}`} className={linkClass}>
                    {p.orderNumber}
                  </Link>{" "}
                  · {p.customerName} · {PAYMENT_PURPOSE_LABEL[p.purpose]}
                </span>
                <span>
                  {formatRupiah(p.amount)} · {formatWibDateTime(p.uploadedAt)} WIB
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="exception" className="rounded-card bg-surface p-5 text-sm">
        <h2 id="exception" className="mb-3 text-xl">
          Payment Exception ({exceptions.length})
        </h2>
        {exceptions.length === 0 ? (
          <p className="text-muted-foreground">Tidak ada Payment Exception yang terbuka.</p>
        ) : (
          <ul className="divide-y divide-border">
            {exceptions.map((e) => (
              <li key={e.exceptionId} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <Link href={`/admin/pesanan/${e.orderId}`} className={linkClass}>
                    {e.orderNumber}
                  </Link>{" "}
                  · {EXCEPTION_KIND_LABEL[e.kind]}
                </span>
                <span>{formatRupiah(e.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="refund" className="rounded-card bg-surface p-5 text-sm">
        <h2 id="refund" className="mb-3 text-xl">
          Perlu Pencatatan Refund ({refundCandidates.length})
        </h2>
        {refundCandidates.length === 0 ? (
          <p className="text-muted-foreground">Tidak ada pesanan dibatalkan yang masih menyimpan pembayaran.</p>
        ) : (
          <ul className="divide-y divide-border">
            {refundCandidates.map((r) => (
              <li key={r.orderId} className="flex flex-wrap justify-between gap-2 py-2">
                <Link href={`/admin/pesanan/${r.orderId}`} className={linkClass}>
                  {r.orderNumber}
                </Link>
                <span>
                  Diterima {formatRupiah(r.paidAmount)} · {PAYMENT_STATUS_LABEL[r.paymentStatus]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
