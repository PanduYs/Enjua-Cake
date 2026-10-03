import "server-only";

import { and, asc, count, eq, ne } from "drizzle-orm";

import { fieldErrorsOf } from "@/lib/validation/admin-catalog";
import { createAdminSchema, resetPasswordSchema } from "@/lib/validation/admin-users";
import { AdminAccountError, createAdminAccount } from "@/server/auth/admin-accounts";
import type { Database } from "@/server/db/client";
import { adminAccounts, admins, adminSessions } from "@/server/db/schema";
import { writeAudit } from "@/server/observability/audit";
import { hashPassword } from "@/server/security/password";

type Fail = { ok: false; error: "INVALID_INPUT" | "EMAIL_TAKEN" | "NOT_FOUND" | "SELF" | "LAST_ACTIVE_ADMIN"; fieldErrors?: Partial<Record<string, string>> };

/** Admin accounts (FD-81, FD-82: several ADMINs, one permission level). */
export async function listAdmins(db: Database) {
  return db
    .select({ id: admins.id, name: admins.name, email: admins.email, isActive: admins.isActive, createdAt: admins.createdAt })
    .from(admins)
    .orderBy(asc(admins.name));
}

export async function createAdmin(db: Database, raw: unknown, actorAdminId: string): Promise<{ ok: true; adminId: string } | Fail> {
  const parsed = createAdminSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT", fieldErrors: fieldErrorsOf(parsed.error) };
  try {
    const { id } = await createAdminAccount(db, { name: parsed.data.name, email: parsed.data.email, password: parsed.data.password }, { type: "ADMIN", adminId: actorAdminId });
    return { ok: true, adminId: id };
  } catch (error) {
    if (error instanceof Error && error.name === "AdminAccountError" && (error as AdminAccountError).code === "EMAIL_TAKEN") {
      return { ok: false, error: "EMAIL_TAKEN", fieldErrors: { email: "Email sudah dipakai admin lain." } };
    }
    throw error;
  }
}

/**
 * Deactivate/reactivate another admin. Deactivation revokes their sessions at once;
 * the session resolver also rejects inactive admins. The last active admin and the
 * acting admin cannot be deactivated (no lock-out).
 */
export async function setAdminActive(db: Database, args: { targetId: string; active: boolean; actorAdminId: string }): Promise<{ ok: true } | Fail> {
  if (args.targetId === args.actorAdminId) return { ok: false, error: "SELF" };
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(admins).where(eq(admins.id, args.targetId)).for("update");
    if (!target) return { ok: false, error: "NOT_FOUND" } as const;
    if (!args.active) {
      const [{ n }] = (await tx.select({ n: count() }).from(admins).where(and(eq(admins.isActive, true), ne(admins.id, args.targetId)))) as [{ n: number }];
      if (n === 0) return { ok: false, error: "LAST_ACTIVE_ADMIN" } as const;
    }
    await tx.update(admins).set({ isActive: args.active, updatedAt: new Date() }).where(eq(admins.id, args.targetId));
    if (!args.active) await tx.delete(adminSessions).where(eq(adminSessions.userId, args.targetId));
    await writeAudit(tx, {
      entityType: "admin",
      entityId: args.targetId,
      eventType: args.active ? "ADMIN_ACTIVATED" : "ADMIN_DEACTIVATED",
      oldValue: { isActive: target.isActive },
      newValue: { isActive: args.active, sessionsRevoked: !args.active },
      actor: { type: "ADMIN", adminId: args.actorAdminId },
    });
    return { ok: true } as const;
  });
}

/** Another admin resets a password (§8.1: no public forgot-password, FD-85); all their sessions end. */
export async function resetAdminPassword(db: Database, args: { targetId: string; raw: unknown; actorAdminId: string }): Promise<{ ok: true } | Fail> {
  if (args.targetId === args.actorAdminId) return { ok: false, error: "SELF" };
  const parsed = resetPasswordSchema.safeParse(args.raw);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT", fieldErrors: fieldErrorsOf(parsed.error) };
  const hash = await hashPassword(parsed.data.password);
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(adminAccounts)
      .set({ password: hash, updatedAt: new Date() })
      .where(and(eq(adminAccounts.userId, args.targetId), eq(adminAccounts.providerId, "credential")))
      .returning({ id: adminAccounts.id });
    if (updated.length === 0) return { ok: false, error: "NOT_FOUND" } as const;
    await tx.delete(adminSessions).where(eq(adminSessions.userId, args.targetId));
    await writeAudit(tx, {
      entityType: "admin",
      entityId: args.targetId,
      eventType: "ADMIN_PASSWORD_RESET",
      newValue: { sessionsRevoked: true },
      actor: { type: "ADMIN", adminId: args.actorAdminId },
    });
    return { ok: true } as const;
  });
}

/**
 * Server-side recovery (§8.1): sets a password by email from the admin CLI when no
 * other admin can do it. Ends every session of that admin; audited as SYSTEM.
 */
export async function resetAdminPasswordByEmail(db: Database, args: { email: string; raw: unknown }): Promise<{ ok: true } | Fail> {
  const parsed = resetPasswordSchema.safeParse(args.raw);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT", fieldErrors: fieldErrorsOf(parsed.error) };
  const [target] = await db.select({ id: admins.id }).from(admins).where(eq(admins.email, args.email.trim().toLowerCase())).limit(1);
  if (!target) return { ok: false, error: "NOT_FOUND" };
  const hash = await hashPassword(parsed.data.password);
  await db.transaction(async (tx) => {
    await tx.update(adminAccounts).set({ password: hash, updatedAt: new Date() }).where(and(eq(adminAccounts.userId, target.id), eq(adminAccounts.providerId, "credential")));
    await tx.delete(adminSessions).where(eq(adminSessions.userId, target.id));
    await writeAudit(tx, { entityType: "admin", entityId: target.id, eventType: "ADMIN_PASSWORD_RESET", newValue: { sessionsRevoked: true, via: "cli" }, actor: { type: "SYSTEM" } });
  });
  return { ok: true };
}
