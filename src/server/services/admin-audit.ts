import "server-only";

import { and, desc, eq, lt, type SQL } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { admins, auditLogs } from "@/server/db/schema";

export const AUDIT_ENTITY_TYPES = ["order", "payment_transaction", "product", "category", "pickup_date", "settings", "admin", "admin_auth"] as const;
const PAGE = 50;

/** Audit log, newest first, filterable (IMPLEMENTATION-PLAN §39). Keyset pagination by id. */
export async function listAuditLogs(db: Database, filters: { entityType?: (typeof AUDIT_ENTITY_TYPES)[number]; adminId?: string; entityId?: string; before?: number } = {}) {
  const where: SQL[] = [];
  if (filters.entityType) where.push(eq(auditLogs.entityType, filters.entityType));
  if (filters.adminId) where.push(eq(auditLogs.actorAdminId, filters.adminId));
  if (filters.entityId) where.push(eq(auditLogs.entityId, filters.entityId));
  if (filters.before) where.push(lt(auditLogs.id, filters.before));
  const rows = await db
    .select({
      id: auditLogs.id,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      eventType: auditLogs.eventType,
      oldValue: auditLogs.oldValue,
      newValue: auditLogs.newValue,
      reason: auditLogs.reason,
      actorType: auditLogs.actorType,
      actorName: admins.name,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(admins, eq(auditLogs.actorAdminId, admins.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(auditLogs.id))
    .limit(PAGE + 1);
  return { rows: rows.slice(0, PAGE), nextBefore: rows.length > PAGE ? rows[PAGE - 1]!.id : null };
}
