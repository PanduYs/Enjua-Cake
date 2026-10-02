import "server-only";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { adminAccounts, admins } from "@/server/db/schema";
import { writeAudit, type AuditActor } from "@/server/observability/audit";
import { hashPassword, MAX_ADMIN_PASSWORD_LENGTH, MIN_ADMIN_PASSWORD_LENGTH } from "@/server/security/password";

export interface CreateAdminInput {
  name: string;
  email: string;
  password: string;
}

export class AdminAccountError extends Error {
  constructor(
    public readonly code: "EMAIL_TAKEN" | "INVALID_INPUT",
    message: string,
  ) {
    super(message);
    this.name = "AdminAccountError";
  }
}

/**
 * Creates an ADMIN with a "credential" account in the shape Better Auth expects.
 * Public sign-up is disabled, so this is the only way admins are created (seed now,
 * admin management UI in Phase 6).
 */
export async function createAdminAccount(db: Database, input: CreateAdminInput, actor: AuditActor): Promise<{ id: string }> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!name || !email.includes("@")) {
    throw new AdminAccountError("INVALID_INPUT", "Name and a valid email are required.");
  }
  if (input.password.length < MIN_ADMIN_PASSWORD_LENGTH || input.password.length > MAX_ADMIN_PASSWORD_LENGTH) {
    throw new AdminAccountError(
      "INVALID_INPUT",
      `Password must be ${MIN_ADMIN_PASSWORD_LENGTH}-${MAX_ADMIN_PASSWORD_LENGTH} characters.`,
    );
  }

  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: admins.id }).from(admins).where(eq(admins.email, email)).limit(1);
    if (existing.length > 0) {
      throw new AdminAccountError("EMAIL_TAKEN", "An admin with this email already exists.");
    }

    const id = randomUUID();
    await tx.insert(admins).values({ id, name, email, emailVerified: true, role: "ADMIN", isActive: true });
    await tx.insert(adminAccounts).values({
      id: randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: passwordHash,
    });
    await writeAudit(tx, {
      entityType: "admin",
      entityId: id,
      eventType: "ADMIN_CREATED",
      newValue: { email, name },
      actor,
    });
    return { id };
  });
}
