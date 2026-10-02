import "server-only";

import type { Database } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";

export type AuditActor = { type: "ADMIN"; adminId: string | null } | { type: "SYSTEM" } | { type: "CUSTOMER" };

export interface AuditEntry {
  entityType: string;
  entityId?: string | null;
  eventType: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  actor: AuditActor;
  requestId?: string | null;
}

/** Append-only audit trail (IMPLEMENTATION-PLAN §39). Pass a transaction to keep it atomic with the change. */
export async function writeAudit(db: Pick<Database, "insert">, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    eventType: entry.eventType,
    oldValue: entry.oldValue ?? null,
    newValue: entry.newValue ?? null,
    reason: entry.reason ?? null,
    actorType: entry.actor.type,
    actorAdminId: entry.actor.type === "ADMIN" ? entry.actor.adminId : null,
    requestId: entry.requestId ?? null,
  });
}
