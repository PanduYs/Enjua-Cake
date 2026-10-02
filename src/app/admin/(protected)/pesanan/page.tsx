import type { Metadata } from "next";
import Link from "next/link";

import { PAYMENT_METHOD_LABEL } from "@/lib/copy/checkout";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/copy/orders";
import { formatIsoDateLong } from "@/lib/format/date";
import { formatRupiah } from "@/lib/format/rupiah";
import { requireAdmin } from "@/server/auth/session";
import { systemClock } from "@/server/clock";
import { getDb } from "@/server/db/client";
import { ADMIN_ORDER_STATUSES, listAdminOrders } from "@/server/services/admin-orders";

export const metadata: Metadata = { title: "Pesanan" };

const isStatus = (v: unknown): v is (typeof ADMIN_ORDER_STATUSES)[number] => ADMIN_ORDER_STATUSES.includes(v as never);
const METHODS = ["QRIS", "BANK_TRANSFER", "CASH"] as const;
const isMethod = (v: unknown): v is (typeof METHODS)[number] => METHODS.includes(v as never);
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const status = isStatus(params.status) ? params.status : undefined;
  const pickupDate = isDate(params.tanggal) ? params.tanggal : undefined;
  const paymentMethod = isMethod(params.metode) ? params.metode : undefined;
  const rows = await listAdminOrders(getDb(), systemClock, { status, pickupDate, paymentMethod });

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl">Pesanan</h1>
        <Link href="/admin/pesanan/baru" className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 font-semibold text-primary-foreground">
          Buat Manual Order
        </Link>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-card bg-surface p-4" aria-label="Filter pesanan">
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-status" className="text-sm font-semibold">
            Status
          </label>
          <select id="filter-status" name="status" defaultValue={status ?? ""} className="min-h-11 rounded-control border border-border bg-background px-3">
            <option value="">Semua status</option>
            {ADMIN_ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-date" className="text-sm font-semibold">
            Tanggal pickup
          </label>
          <input
            id="filter-date"
            type="date"
            name="tanggal"
            defaultValue={pickupDate ?? ""}
            className="min-h-11 rounded-control border border-border bg-background px-3"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-method" className="text-sm font-semibold">
            Metode
          </label>
          <select id="filter-method" name="metode" defaultValue={paymentMethod ?? ""} className="min-h-11 rounded-control border border-border bg-background px-3">
            <option value="">Semua metode</option>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="min-h-11 rounded-control bg-primary px-5 font-semibold text-primary-foreground">
          Terapkan
        </button>
        {status || pickupDate || paymentMethod ? (
          <Link href="/admin/pesanan" className="inline-flex min-h-11 items-center px-2 underline underline-offset-4">
            Reset
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-center text-muted-foreground">Belum ada pesanan yang cocok.</p>
      ) : (
        <>
          {/* Mobile: card list (PRD §35.4) */}
          <ul className="flex flex-col gap-3 md:hidden" aria-label="Daftar pesanan">
            {rows.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/pesanan/${o.id}`} className="flex flex-col gap-1 rounded-card bg-surface p-4">
                  <span className="font-mono font-semibold">{o.orderNumber}</span>
                  <span>
                    {o.customerName}
                    {o.source === "MANUAL" ? " · Manual Order" : ""}
                  </span>
                  <span className="text-sm">Pickup: {formatIsoDateLong(o.pickupDate)}</span>
                  <span className="text-sm">
                    {ORDER_STATUS_LABEL[o.orderStatus]} · {PAYMENT_STATUS_LABEL[o.paymentStatus]}
                  </span>
                  <span className="text-sm font-semibold">{formatRupiah(o.grandTotal)}</span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-card bg-surface md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Daftar pesanan</caption>
              <thead className="border-b border-border">
                <tr>
                  <th scope="col" className="p-3">
                    Nomor
                  </th>
                  <th scope="col" className="p-3">
                    Customer
                  </th>
                  <th scope="col" className="p-3">
                    Pickup
                  </th>
                  <th scope="col" className="p-3">
                    Status
                  </th>
                  <th scope="col" className="p-3">
                    Pembayaran
                  </th>
                  <th scope="col" className="p-3 text-right">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="border-b border-border last:border-0">
                    <td className="p-3">
                      <Link href={`/admin/pesanan/${o.id}`} className="font-mono font-semibold text-primary underline underline-offset-4">
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="p-3">
                      {o.customerName}
                      {o.source === "MANUAL" ? <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs">Manual</span> : null}
                    </td>
                    <td className="p-3">{o.pickupDate}</td>
                    <td className="p-3">{ORDER_STATUS_LABEL[o.orderStatus]}</td>
                    <td className="p-3">
                      {PAYMENT_STATUS_LABEL[o.paymentStatus]} · {PAYMENT_METHOD_LABEL[o.paymentMethod]}
                    </td>
                    <td className="p-3 text-right">{formatRupiah(o.grandTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
