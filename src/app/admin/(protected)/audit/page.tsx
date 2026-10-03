import type { Metadata } from "next";
import Link from "next/link";

import { formatWibDateTime } from "@/lib/format/date";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { AUDIT_ENTITY_TYPES, listAuditLogs } from "@/server/services/admin-audit";
import { listAdmins } from "@/server/services/admin-users";

export const metadata: Metadata = { title: "Audit Log" };

const ENTITY_LABEL: Record<(typeof AUDIT_ENTITY_TYPES)[number], string> = {
  order: "Pesanan",
  payment_transaction: "Pembayaran",
  product: "Produk",
  category: "Kategori",
  pickup_date: "Kapasitas",
  settings: "Pengaturan",
  admin: "Akun admin",
  admin_auth: "Login admin",
};
const ACTOR_LABEL = { ADMIN: "Admin", SYSTEM: "Sistem", CUSTOMER: "Customer" } as const;
const select = "min-h-11 rounded-control border border-border bg-background px-3";

/** Values are shown as compact JSON; payloads never contain tokens or proof contents (§39). */
function compact(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = JSON.stringify(value);
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const entityType = AUDIT_ENTITY_TYPES.find((t) => t === params.jenis);
  const adminId = params.admin || undefined;
  const before = params.sebelum && /^\d+$/.test(params.sebelum) ? Number(params.sebelum) : undefined;
  const db = getDb();
  const [{ rows, nextBefore }, admins] = await Promise.all([listAuditLogs(db, { entityType, adminId, before }), listAdmins(db)]);
  const query = (extra: Record<string, string>) => new URLSearchParams({ ...(entityType ? { jenis: entityType } : {}), ...(adminId ? { admin: adminId } : {}), ...extra }).toString();

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl sm:text-3xl">Audit Log</h1>
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-card bg-surface p-4" aria-label="Filter audit log">
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-jenis" className="text-sm font-semibold">
            Jenis
          </label>
          <select id="audit-jenis" name="jenis" defaultValue={entityType ?? ""} className={select}>
            <option value="">Semua</option>
            {AUDIT_ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ENTITY_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-admin" className="text-sm font-semibold">
            Admin
          </label>
          <select id="audit-admin" name="admin" defaultValue={adminId ?? ""} className={select}>
            <option value="">Semua</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="min-h-11 rounded-control bg-primary px-5 font-semibold text-primary-foreground">
          Terapkan
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-center text-muted-foreground">Belum ada catatan.</p>
      ) : (
        <ol className="flex flex-col gap-2" aria-label="Catatan audit">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 rounded-card bg-surface p-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold">{r.eventType}</span>
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs">{ENTITY_LABEL[r.entityType as keyof typeof ENTITY_LABEL] ?? r.entityType}</span>
                {r.entityType === "order" && r.entityId ? (
                  <Link href={`/admin/pesanan/${r.entityId}`} className="text-primary underline underline-offset-4">
                    Buka pesanan
                  </Link>
                ) : r.entityId ? (
                  <span className="break-all text-muted-foreground">{r.entityId}</span>
                ) : null}
              </div>
              <p className="text-muted-foreground">
                {formatWibDateTime(r.createdAt)} WIB · {r.actorName ?? ACTOR_LABEL[r.actorType]}
              </p>
              {r.reason ? <p>Alasan: {r.reason}</p> : null}
              {compact(r.oldValue) ? <p className="font-mono text-xs break-all">sebelum: {compact(r.oldValue)}</p> : null}
              {compact(r.newValue) ? <p className="font-mono text-xs break-all">sesudah: {compact(r.newValue)}</p> : null}
            </li>
          ))}
        </ol>
      )}
      {nextBefore ? (
        <Link href={`/admin/audit?${query({ sebelum: String(nextBefore) })}`} className="self-start font-semibold text-primary underline underline-offset-4">
          Catatan lebih lama →
        </Link>
      ) : null}
    </section>
  );
}
