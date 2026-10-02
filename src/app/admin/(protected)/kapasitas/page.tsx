import type { Metadata } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/admin/action-form";
import { CAPACITY_STATUS_LABEL } from "@/lib/copy/admin";
import { formatIsoDateLong } from "@/lib/format/date";
import { requireAdmin } from "@/server/auth/session";
import { systemClock } from "@/server/clock";
import { getDb } from "@/server/db/client";
import { addCalendarDays, parseIsoDate } from "@/server/domain/time/wib";
import { listCapacity } from "@/server/services/admin-capacity";

import { blockDateAction, capacityOverrideAction } from "./actions";

export const metadata: Metadata = { title: "Kapasitas" };

const DAYS = 14;
const input = "min-h-11 w-24 rounded-control border border-muted-foreground bg-surface px-3";

const STATUS_CLASS = {
  AVAILABLE: "bg-badge-ready",
  FULL: "bg-pastel-blush",
  BLOCKED: "bg-badge-soldout text-badge-soldout-foreground",
} as const;

/** Pickup capacity per date (PRD §11, Design §20): capacity, used, remaining, status; block and override. */
export default async function AdminCapacityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const { rows, defaultCapacity, horizonDays, today } = await listCapacity(getDb(), systemClock, { from: params.dari, days: DAYS });
  const from = rows[0]!.date;
  const prev = addCalendarDays(from, -DAYS);
  const next = addCalendarDays(from, DAYS);
  const canGoBack = prev >= today || from > today;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl">Kapasitas Pickup</h1>
        <p className="text-sm text-muted-foreground">
          Kapasitas default {defaultCapacity} pesanan per tanggal, booking horizon {horizonDays} hari (ubah di{" "}
          <Link href="/admin/pengaturan" className="underline underline-offset-4">
            Pengaturan
          </Link>
          ). Memblokir tanggal atau menurunkan kapasitas tidak membatalkan pesanan yang sudah ada.
        </p>
      </div>

      <nav aria-label="Rentang tanggal" className="flex flex-wrap items-center gap-2">
        {canGoBack ? (
          <Link href={`/admin/kapasitas?dari=${prev < today ? today : prev}`} className="inline-flex min-h-11 items-center rounded-control border border-primary px-4 font-semibold text-primary">
            ← Sebelumnya
          </Link>
        ) : null}
        <span className="text-sm">
          {formatIsoDateLong(from)} – {formatIsoDateLong(rows[rows.length - 1]!.date)}
        </span>
        <Link href={`/admin/kapasitas?dari=${next}`} className="inline-flex min-h-11 items-center rounded-control border border-primary px-4 font-semibold text-primary">
          Berikutnya →
        </Link>
      </nav>

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Kapasitas per tanggal">
        {rows.map((r) => (
          <li key={r.date} className="flex flex-col gap-3 rounded-card bg-surface p-4" data-testid={`capacity-${r.date}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-base font-semibold">{formatIsoDateLong(parseIsoDate(r.date))}</h2>
              <span className={`rounded-full px-3 py-0.5 text-sm font-semibold ${STATUS_CLASS[r.status]}`}>{CAPACITY_STATUS_LABEL[r.status]}</span>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <dt className="text-muted-foreground">Kapasitas</dt>
                <dd className="text-lg font-semibold">
                  {r.capacity}
                  {r.capacityOverride !== null ? <span className="sr-only"> (override)</span> : null}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Terisi</dt>
                <dd className="text-lg font-semibold">{r.used}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Sisa</dt>
                <dd className="text-lg font-semibold">{r.remaining}</dd>
              </div>
            </dl>
            {r.capacityOverride !== null ? <p className="text-xs text-muted-foreground">Override kapasitas (default {defaultCapacity}).</p> : null}
            {r.isBlocked && r.blockReason ? <p className="text-sm">Alasan blokir: {r.blockReason}</p> : null}
            {r.used > 0 ? (
              <Link href={`/admin/pesanan?tanggal=${r.date}`} className="text-sm font-semibold text-primary underline underline-offset-4">
                Lihat {r.used} pesanan
              </Link>
            ) : null}

            <details className="text-sm">
              <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Ubah tanggal ini</summary>
              <div className="mt-2 flex flex-col gap-4">
                <ActionForm action={capacityOverrideAction} submitLabel="Simpan Kapasitas" variant="secondary">
                  <input type="hidden" name="date" value={r.date} />
                  <label htmlFor={`cap-${r.date}`} className="font-semibold">
                    Kapasitas tanggal ini
                  </label>
                  <input id={`cap-${r.date}`} name="capacity" inputMode="numeric" defaultValue={r.capacityOverride ?? ""} placeholder={String(defaultCapacity)} className={input} />
                  <p className="text-muted-foreground">Kosongkan untuk memakai kapasitas default.</p>
                </ActionForm>
                <ActionForm action={blockDateAction} submitLabel={r.isBlocked ? "Buka Blokir" : "Blokir Tanggal"} variant={r.isBlocked ? "secondary" : "danger"}>
                  <input type="hidden" name="date" value={r.date} />
                  <input type="hidden" name="blocked" value={r.isBlocked ? "false" : "true"} />
                  {!r.isBlocked ? (
                    <>
                      <label htmlFor={`reason-${r.date}`} className="font-semibold">
                        Alasan blokir (opsional, internal)
                      </label>
                      <input id={`reason-${r.date}`} name="reason" maxLength={200} className="min-h-11 rounded-control border border-muted-foreground bg-surface px-3" />
                    </>
                  ) : null}
                </ActionForm>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
