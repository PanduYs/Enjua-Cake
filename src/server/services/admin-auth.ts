import "server-only";

import { APIError } from "better-auth/api";

import type { Auth } from "@/server/auth/config";
import type { Clock } from "@/server/clock";
import type { Database } from "@/server/db/client";
import { writeAudit } from "@/server/observability/audit";
import { ADMIN_LOGIN_RATE_LIMITS, consumeRateLimit } from "@/server/security/rate-limit";
import { getClientIp } from "@/server/security/request";
import { adminLoginSchema, changePasswordSchema, toFieldErrors } from "@/lib/validation/admin-auth";

export interface AuthServiceDeps {
  auth: Auth;
  db: Database;
  clock: Clock;
}

export type LoginResult =
  | { ok: true; adminId: string; responseHeaders: Headers }
  | { ok: false; code: "INVALID_INPUT"; fieldErrors: Partial<Record<string, string>> }
  | { ok: false; code: "RATE_LIMITED"; retryAfterSeconds: number }
  | { ok: false; code: "INVALID_CREDENTIALS" };

/**
 * Admin login: validate → throttle per IP and per email (DB-backed) → Better Auth
 * sign-in → audit. Failure responses are deliberately generic (no account enumeration).
 */
export async function loginAdmin(deps: AuthServiceDeps, input: unknown, requestHeaders: Headers): Promise<LoginResult> {
  const parsed = adminLoginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", fieldErrors: toFieldErrors(parsed.error) };
  const { email, password } = parsed.data;

  const now = deps.clock.now();
  const ip = getClientIp(requestHeaders);
  const [byIp, byEmail] = await Promise.all([
    consumeRateLimit(deps.db, `admin-login:ip:${ip}`, ADMIN_LOGIN_RATE_LIMITS.perIp, now),
    consumeRateLimit(deps.db, `admin-login:email:${email}`, ADMIN_LOGIN_RATE_LIMITS.perEmail, now),
  ]);
  if (!byIp.allowed || !byEmail.allowed) {
    await writeAudit(deps.db, {
      entityType: "admin_auth",
      entityId: email,
      eventType: "LOGIN_RATE_LIMITED",
      newValue: { ip },
      actor: { type: "ADMIN", adminId: null },
    });
    return { ok: false, code: "RATE_LIMITED", retryAfterSeconds: Math.max(byIp.retryAfterSeconds, byEmail.retryAfterSeconds) };
  }

  try {
    const { headers: responseHeaders, response } = await deps.auth.api.signInEmail({
      body: { email, password, rememberMe: true },
      headers: requestHeaders,
      returnHeaders: true,
    });
    await writeAudit(deps.db, {
      entityType: "admin_auth",
      entityId: response.user.id,
      eventType: "LOGIN_SUCCEEDED",
      newValue: { ip },
      actor: { type: "ADMIN", adminId: response.user.id },
    });
    return { ok: true, adminId: response.user.id, responseHeaders };
  } catch (error) {
    // Only authentication failures map to a generic message; infrastructure errors propagate.
    if (!(error instanceof APIError)) throw error;
    await writeAudit(deps.db, {
      entityType: "admin_auth",
      entityId: email,
      eventType: "LOGIN_FAILED",
      newValue: { ip },
      actor: { type: "ADMIN", adminId: null },
    });
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }
}

export async function logoutAdmin(deps: AuthServiceDeps, adminId: string | null, requestHeaders: Headers): Promise<void> {
  try {
    await deps.auth.api.signOut({ headers: requestHeaders });
  } finally {
    if (adminId) {
      await writeAudit(deps.db, { entityType: "admin_auth", entityId: adminId, eventType: "LOGOUT", actor: { type: "ADMIN", adminId } });
    }
  }
}

export type ChangePasswordResult =
  | { ok: true; responseHeaders: Headers }
  | { ok: false; code: "INVALID_INPUT"; fieldErrors: Partial<Record<string, string>> }
  | { ok: false; code: "WRONG_CURRENT_PASSWORD" };

/**
 * Changes the signed-in admin's password (FD-84) and revokes all of their other
 * sessions (IMPLEMENTATION-PLAN §8.1).
 */
export async function changeAdminPassword(
  deps: AuthServiceDeps,
  adminId: string,
  input: unknown,
  requestHeaders: Headers,
): Promise<ChangePasswordResult> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", fieldErrors: toFieldErrors(parsed.error) };

  try {
    const { headers: responseHeaders } = await deps.auth.api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        revokeOtherSessions: true,
      },
      headers: requestHeaders,
      returnHeaders: true,
    });
    await writeAudit(deps.db, {
      entityType: "admin",
      entityId: adminId,
      eventType: "PASSWORD_CHANGED",
      newValue: { otherSessionsRevoked: true },
      actor: { type: "ADMIN", adminId },
    });
    return { ok: true, responseHeaders };
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
    return { ok: false, code: "WRONG_CURRENT_PASSWORD" };
  }
}
