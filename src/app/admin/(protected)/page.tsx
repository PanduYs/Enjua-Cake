import type { Metadata } from "next";
import Link from "next/link";

import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/copy/orders";
import { formatIsoDateLong } from "@/lib/format/date";
import { formatRupiah } from "@/lib/format/rupiah";
import { requireAdmin } from "@/server/auth/session";
import { systemClock } from "@/server/clock";
import { getDb } from "@/server/db/client";
import { getDashboard } from "@/server/services/admin-dashboard";

export const metadata: Metadata = { title: "Dashboard" };

const card = "flex flex-col gap-1 rounded-card bg-surface p-4";
const link = "font-semibold text-primary underline underline-offset-4";

function Stat({ label, value, href, testId }: { label: string; value: string | number; href?: string; testId?: string }) {
  const body = (
    <>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-heading text-3xl" data-testid={testId}>
        {value}
      </span>
    </>
  );
  return href ? (
    <Link href={href} className={`${card} hover:bg-surface-muted`}>
      {body}
    </Link>
  ) : (
    <div className={card}>{body}</div>
  );
}

/** Operational dashboard (PRD §30, FD-90, Design §20). Every block links to where the work is done. */
export default async function AdminDashboardPage() {
  const admin = await requireAdmin();
  const d = await getDashboard(getDb(), systemClock);
  const needsAttention = d.pendingProofs + d.openExceptions + d.refundCandidates + d.attention.cashUnconfirmed.length + d.attention.readyUnpaid.length;

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Dashboard</h1>
          <p className="text-muted-foreground">Halo, {admin.name}. Hari ini {formatIsoDateLong(d.today)}.</p>
        </div>
        <Link href="/admin/pesanan/baru" className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 font-semibold text-primary-foreground">
          Buat Manual Order
        </Link>
      </div>

      <section aria-labelledby="perhatian" className="flex flex-col gap-3">
        <h2 id="perhatian" className="text-xl">
          Perlu Perhatian {needsAttention > 0 ? `(${needsAttention})` : ""}
        </h2>
        {needsAttention === 0 ? (
          <p className="rounded-card bg-surface p-4 text-muted-foreground">Tidak ada yang perlu ditindaklanjuti saat ini.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.pendingProofs > 0 ? <Stat label="Bukti transfer menunggu verifikasi" value={d.pendingProofs} href="/admin/pembayaran" testId="stat-proofs" /> : null}
            {d.openExceptions > 0 ? <Stat label="Payment Exception perlu direview" value={d.openExceptions} href="/admin/pembayaran" testId="stat-exceptions" /> : null}
            {d.refundCandidates > 0 ? <Stat label="Pesanan dibatalkan dengan dana diterima" value={d.refundCandidates} href="/admin/pembayaran" /> : null}
            {d.attention.cashUnconfirmed.length > 0 ? (
              <div className={card}>
                <span className="text-sm text-muted-foreground">Pesanan Cash belum dikonfirmasi</span>
                <ul className="flex flex-col gap-1 text-sm">
                  {d.attention.cashUnconfirmed.map((o) => (
                    <li key={o.id}>
                      <Link href={`/admin/pesanan/${o.id}`} className={link}>
                        {o.orderNumber}
                      </Link>{" "}
                      · {o.customerName} · pickup {o.pickupDate}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {d.attention.readyUnpaid.length > 0 ? (
              <div className={card}>
                <span className="text-sm text-muted-foreground">Siap Diambil tetapi belum lunas</span>
                <ul className="flex flex-col gap-1 text-sm">
                  {d.attention.readyUnpaid.map((o) => (
                    <li key={o.id}>
                      <Link href={`/admin/pesanan/${o.id}`} className={link}>
                        {o.orderNumber}
                      </Link>{" "}
                      · {PAYMENT_STATUS_LABEL[o.paymentStatus]}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section aria-labelledby="status-pesanan" className="flex flex-col gap-3">
        <h2 id="status-pesanan" className="text-xl">
          Pesanan per Status
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(Object.keys(d.byStatus) as Array<keyof typeof d.byStatus>).map((s) => (
            <Stat key={s} label={ORDER_STATUS_LABEL[s]} value={d.byStatus[s]} href={`/admin/pesanan?status=${s}`} testId={`stat-status-${s}`} />
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="pickup-mendatang" className="flex flex-col gap-3">
          <h2 id="pickup-mendatang" className="text-xl">
            Pickup & Kapasitas 7 Hari
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-card bg-surface text-sm">
            {d.upcoming.map((u) => (
              <li key={u.date} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <Link href={`/admin/pesanan?tanggal=${u.date}`} className={link}>
                  {formatIsoDateLong(u.date)}
                </Link>
                <span>
                  {u.isBlocked ? "Diblokir · " : ""}
                  {u.used}/{u.capacity} slot terpakai
                </span>
              </li>
            ))}
          </ul>
          <Link href="/admin/kapasitas" className={`${link} self-start text-sm`}>
            Kelola kapasitas
          </Link>
        </section>

        <section aria-labelledby="pickup-hari-ini" className="flex flex-col gap-3">
          <h2 id="pickup-hari-ini" className="text-xl">
            Pickup Hari Ini ({d.todayOrders.length})
          </h2>
          {d.todayOrders.length === 0 ? (
            <p className="rounded-card bg-surface p-4 text-sm text-muted-foreground">Belum ada pesanan untuk diambil hari ini.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-card bg-surface text-sm">
              {d.todayOrders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <span>
                    <Link href={`/admin/pesanan/${o.id}`} className={`${link} font-mono`}>
                      {o.orderNumber}
                    </Link>{" "}
                    · {o.customerName}
                  </span>
                  <span>
                    {ORDER_STATUS_LABEL[o.orderStatus]} · {PAYMENT_STATUS_LABEL[o.paymentStatus]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="pendapatan" className="flex flex-col gap-3">
        <h2 id="pendapatan" className="text-xl">
          Ringkasan Pendapatan
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Total pembayaran diterima (setelah refund)" value={formatRupiah(d.revenue.receivedTotal)} testId="stat-received" />
          <Stat label="Diterima bulan ini" value={formatRupiah(d.revenue.receivedThisMonth)} />
          <Stat label={`Sisa pembayaran (${d.revenue.outstandingOrders} pesanan aktif)`} value={formatRupiah(d.revenue.outstandingTotal)} />
        </div>
        <p className="text-xs text-muted-foreground">Payment Exception tidak dihitung. Ringkasan operasional, bukan laporan keuangan.</p>
      </section>
    </section>
  );
}
