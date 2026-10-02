import "server-only";

import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { systemClock, type Clock } from "@/server/clock";
import { getDb, type Database } from "@/server/db/client";
import { adminSessions } from "@/server/db/schema";

import { ADMIN_SESSION_ABSOLUTE_MS, type Auth } from "./config";
import { getAuth } from "./index";

export interface AdminSession {
  sessionId: string;
  adminId: string;
  name: string;
  email: string;
}

/**
 * Resolves the current admin from the request cookies, enforcing role, active flag
 * and the 7-day absolute session lifetime. Returns null when not authenticated.
 */
export async function resolveAdminSession(
  auth: Auth,
  db: Database,
  requestHeaders: Headers,
  clock: Clock = systemClock,
): Promise<AdminSession | null> {
  const result = await auth.api.getSession({ headers: requestHeaders });
  if (!result) return null;

  const { session, user } = result;
  if (user.role !== "ADMIN" || user.isActive !== true) return null;

  const createdAt = new Date(session.createdAt).getTime();
  if (clock.now().getTime() - createdAt > ADMIN_SESSION_ABSOLUTE_MS) {
    await db.delete(adminSessions).where(eq(adminSessions.id, session.id));
    return null;
  }

  return { sessionId: session.id, adminId: user.id, name: user.name, email: user.email };
}

export async function getAdminSession(): Promise<AdminSession | null> {
  // Read the request first: this marks the route dynamic before any env/DB access.
  const requestHeaders = new Headers(await headers());
  // `cookies()` reflects cookies set earlier in the same server action (e.g. the
  // rotated session after a password change); the raw Cookie header does not.
  const cookieStore = await cookies();
  requestHeaders.set(
    "cookie",
    cookieStore
      .getAll()
      .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
      .join("; "),
  );
  return resolveAdminSession(getAuth(), getDb(), requestHeaders);
}

/**
 * Server-side authorization gate. Must be called by every admin page, server action
 * and route handler — never rely on layout checks alone (PRD §29).
 */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}
