import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AdminAccountError, createAdminAccount } from "@/server/auth/admin-accounts";
import { ADMIN_SESSION_ABSOLUTE_MS, createAuth, type Auth } from "@/server/auth/config";
import { resolveAdminSession } from "@/server/auth/session";
import { createFixedClock } from "@/server/clock";
import type { DatabaseHandle } from "@/server/db/client";
import { adminAccounts, admins, adminSessions, auditLogs } from "@/server/db/schema";
import { changeAdminPassword, loginAdmin, logoutAdmin, type AuthServiceDeps } from "@/server/services/admin-auth";

import { openTestDatabase, resetAuthTables } from "../support/db";

const PASSWORD = "kue-enak-sekali-123";
const EMAIL = "admin@example.test";

let handle: DatabaseHandle;
let auth: Auth;

/** Builds a Cookie header from Set-Cookie response headers. */
function cookieHeaderFrom(responseHeaders: Headers): Headers {
  const cookies = responseHeaders.getSetCookie().map((c) => c.split(";")[0]);
  return new Headers({ cookie: cookies.join("; "), "x-forwarded-for": "203.0.113.10" });
}

function requestHeaders(ip = "203.0.113.10"): Headers {
  return new Headers({ "x-forwarded-for": ip });
}

function deps(clock = createFixedClock(new Date())): AuthServiceDeps {
  return { auth, db: handle.db, clock };
}

async function login(email = EMAIL, password = PASSWORD, ip?: string) {
  return loginAdmin(deps(), { email, password }, requestHeaders(ip));
}

beforeAll(() => {
  handle = openTestDatabase();
  auth = createAuth({
    db: handle.db,
    secret: "integration-test-secret-at-least-32-characters",
    baseURL: "http://localhost:3000",
    secureCookies: false,
  });
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await resetAuthTables(handle);
  await createAdminAccount(handle.db, { name: "Admin Enjua", email: EMAIL, password: PASSWORD }, { type: "SYSTEM" });
});

describe("admin accounts", () => {
  it("stores an Argon2id credential account, never the plaintext", async () => {
    const [account] = await handle.db.select().from(adminAccounts);
    expect(account?.providerId).toBe("credential");
    expect(account?.password?.startsWith("$argon2id$")).toBe(true);
    expect(account?.password).not.toContain(PASSWORD);
  });

  it("refuses duplicate emails (case-insensitive)", async () => {
    await expect(
      createAdminAccount(handle.db, { name: "Dup", email: "ADMIN@example.test", password: PASSWORD }, { type: "SYSTEM" }),
    ).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
  });

  it("enforces the minimum password length", async () => {
    await expect(
      createAdminAccount(handle.db, { name: "X", email: "x@example.test", password: "short" }, { type: "SYSTEM" }),
    ).rejects.toBeInstanceOf(AdminAccountError);
  });

  it("public sign-up is disabled", async () => {
    await expect(
      auth.api.signUpEmail({ body: { name: "Intruder", email: "intruder@example.test", password: "intruder-password-1" } }),
    ).rejects.toThrow();
    const rows = await handle.db.select().from(admins).where(eq(admins.email, "intruder@example.test"));
    expect(rows).toHaveLength(0);
  });
});

describe("login / session / logout", () => {
  it("logs in, resolves the session from the cookie, and audits", async () => {
    const result = await login();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const setCookie = result.responseHeaders.getSetCookie().join("\n");
    expect(setCookie).toMatch(/enjua\.session_token=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);

    const session = await resolveAdminSession(auth, handle.db, cookieHeaderFrom(result.responseHeaders));
    expect(session).toMatchObject({ email: EMAIL, name: "Admin Enjua" });

    const events = await handle.db.select({ eventType: auditLogs.eventType }).from(auditLogs);
    expect(events.map((e) => e.eventType)).toContain("LOGIN_SUCCEEDED");
  });

  it("rejects wrong passwords and unknown emails with the same generic result", async () => {
    await expect(login(EMAIL, "wrong-password-999")).resolves.toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
    await expect(login("nobody@example.test", PASSWORD)).resolves.toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
    const failures = await handle.db.select().from(auditLogs).where(eq(auditLogs.eventType, "LOGIN_FAILED"));
    expect(failures).toHaveLength(2);
  });

  it("validates input before touching auth", async () => {
    const result = await loginAdmin(deps(), { email: "not-an-email", password: "" }, requestHeaders());
    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });

  it("rate-limits repeated attempts per email (5 per 15 minutes)", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(login(EMAIL, "wrong-password-999", `198.51.100.${i}`)).resolves.toMatchObject({ code: "INVALID_CREDENTIALS" });
    }
    // Even the correct password is refused while the window is exhausted.
    await expect(login(EMAIL, PASSWORD, "198.51.100.99")).resolves.toMatchObject({ ok: false, code: "RATE_LIMITED" });
  });

  it("inactive admins cannot log in", async () => {
    await handle.db.update(admins).set({ isActive: false }).where(eq(admins.email, EMAIL));
    await expect(login()).resolves.toMatchObject({ ok: false, code: "INVALID_CREDENTIALS" });
    const sessions = await handle.db.select().from(adminSessions);
    expect(sessions).toHaveLength(0);
  });

  it("deactivating an admin invalidates their existing session", async () => {
    const result = await login();
    if (!result.ok) throw new Error("login failed");
    await handle.db.update(admins).set({ isActive: false }).where(eq(admins.email, EMAIL));
    await expect(resolveAdminSession(auth, handle.db, cookieHeaderFrom(result.responseHeaders))).resolves.toBeNull();
  });

  it("enforces the 7-day absolute session lifetime", async () => {
    const result = await login();
    if (!result.ok) throw new Error("login failed");
    const cookies = cookieHeaderFrom(result.responseHeaders);
    const later = createFixedClock(new Date(Date.now() + ADMIN_SESSION_ABSOLUTE_MS + 60_000));
    // Keep the sliding expiry alive so only the absolute limit applies.
    await handle.db.update(adminSessions).set({ expiresAt: new Date(Date.now() + 30 * 86_400_000) });
    await expect(resolveAdminSession(auth, handle.db, cookies, later)).resolves.toBeNull();
    await expect(handle.db.select().from(adminSessions)).resolves.toHaveLength(0);
  });

  it("logout deletes the session", async () => {
    const result = await login();
    if (!result.ok) throw new Error("login failed");
    const cookies = cookieHeaderFrom(result.responseHeaders);
    await logoutAdmin(deps(), result.adminId, cookies);
    await expect(resolveAdminSession(auth, handle.db, cookies)).resolves.toBeNull();
  });

  it("returns null without a session cookie", async () => {
    await expect(resolveAdminSession(auth, handle.db, new Headers())).resolves.toBeNull();
  });
});

describe("change password", () => {
  it("rejects a wrong current password", async () => {
    const result = await login();
    if (!result.ok) throw new Error("login failed");
    const outcome = await changeAdminPassword(
      deps(),
      result.adminId,
      { currentPassword: "wrong-current-pw", newPassword: "brand-new-password-1", confirmPassword: "brand-new-password-1" },
      cookieHeaderFrom(result.responseHeaders),
    );
    expect(outcome).toEqual({ ok: false, code: "WRONG_CURRENT_PASSWORD" });
  });

  it("changes the password, revokes other sessions, and audits", async () => {
    const deviceA = await login(EMAIL, PASSWORD, "203.0.113.1");
    const deviceB = await login(EMAIL, PASSWORD, "203.0.113.2");
    if (!deviceA.ok || !deviceB.ok) throw new Error("login failed");

    const outcome = await changeAdminPassword(
      deps(),
      deviceA.adminId,
      { currentPassword: PASSWORD, newPassword: "brand-new-password-1", confirmPassword: "brand-new-password-1" },
      cookieHeaderFrom(deviceA.responseHeaders),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    // Other device is signed out; the acting device continues with its refreshed session cookie.
    await expect(resolveAdminSession(auth, handle.db, cookieHeaderFrom(deviceB.responseHeaders))).resolves.toBeNull();
    await expect(resolveAdminSession(auth, handle.db, cookieHeaderFrom(outcome.responseHeaders))).resolves.not.toBeNull();

    await expect(login(EMAIL, PASSWORD, "203.0.113.3")).resolves.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(login(EMAIL, "brand-new-password-1", "203.0.113.4")).resolves.toMatchObject({ ok: true });

    const [changed] = await handle.db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(eq(auditLogs.eventType, "PASSWORD_CHANGED"));
    expect(changed?.count).toBe(1);
  });
});
