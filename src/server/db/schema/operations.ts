import { sql } from "drizzle-orm";
import { bigserial, boolean, check, date, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { admins } from "./auth";
import { actorTypeEnum } from "./enums";

/**
 * One row per pickup date, created on demand. The row is also the lock target for
 * atomic capacity reservation (IMPLEMENTATION-PLAN §13, TD-06).
 */
export const pickupDates = pgTable(
  "pickup_dates",
  {
    date: date("date", { mode: "string" }).primaryKey(),
    capacityOverride: integer("capacity_override"),
    isBlocked: boolean("is_blocked").notNull().default(false),
    blockReason: text("block_reason"),
    updatedByAdminId: text("updated_by_admin_id").references(() => admins.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("pickup_dates_capacity_non_negative", sql`${t.capacityOverride} IS NULL OR ${t.capacityOverride} >= 0`)],
);

/** Website Settings key → JSON value, validated per key by Zod (IMPLEMENTATION-PLAN §27). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedByAdminId: text("updated_by_admin_id").references(() => admins.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only audit trail (IMPLEMENTATION-PLAN §39). */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    eventType: text("event_type").notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    reason: text("reason"),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorAdminId: text("actor_admin_id").references(() => admins.id, { onDelete: "set null" }),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_created_at_idx").on(t.createdAt),
  ],
);

/** Fixed-window rate limit counters, database-backed so they work on serverless (IMPLEMENTATION-PLAN §30). */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});
