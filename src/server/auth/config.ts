import "server-only";

import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { adminAccounts, admins, adminSessions, authVerifications } from "@/server/db/schema";
import {
  hashPassword,
  MAX_ADMIN_PASSWORD_LENGTH,
  MIN_ADMIN_PASSWORD_LENGTH,
  verifyPassword,
} from "@/server/security/password";

/** Idle timeout: sliding 8 h (IMPLEMENTATION-PLAN §8.1). */
export const ADMIN_SESSION_IDLE_SECONDS = 8 * 60 * 60;
/** Sliding refresh granularity. */
export const ADMIN_SESSION_UPDATE_AGE_SECONDS = 60 * 60;
/** Absolute lifetime regardless of activity: 7 days (enforced in session.ts). */
export const ADMIN_SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;

export interface CreateAuthOptions {
  db: Database;
  secret: string;
  baseURL: string;
  secureCookies: boolean;
  plugins?: BetterAuthPlugin[];
}

/**
 * Better Auth for admins only (TD-10):
 * - email + password, public sign-up disabled (accounts are created by seed/admins);
 * - Argon2id hashing (password.ts) instead of the library default;
 * - database sessions in admin_sessions, HttpOnly cookies with the "enjua" prefix;
 * - inactive admins cannot create sessions.
 */
export function createAuth(options: CreateAuthOptions) {
  const { db } = options;

  return betterAuth({
    appName: "Enjua Cake's",
    baseURL: options.baseURL,
    secret: options.secret,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: admins,
        session: adminSessions,
        account: adminAccounts,
        verification: authVerifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_ADMIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_ADMIN_PASSWORD_LENGTH,
      password: {
        hash: hashPassword,
        verify: ({ hash, password }) => verifyPassword(hash, password),
      },
    },
    user: {
      additionalFields: {
        role: { type: "string", input: false, required: true, defaultValue: "ADMIN" },
        isActive: { type: "boolean", input: false, required: true, defaultValue: true },
      },
    },
    session: {
      expiresIn: ADMIN_SESSION_IDLE_SECONDS,
      updateAge: ADMIN_SESSION_UPDATE_AGE_SECONDS,
    },
    // Login throttling is done by our database-backed limiter in the login action;
    // the Better Auth HTTP handler is not mounted (all calls go through server actions).
    rateLimit: { enabled: false },
    advanced: {
      cookiePrefix: "enjua",
      useSecureCookies: options.secureCookies,
    },
    telemetry: { enabled: false },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const [admin] = await db
              .select({ isActive: admins.isActive, role: admins.role })
              .from(admins)
              .where(eq(admins.id, session.userId))
              .limit(1);
            if (!admin || !admin.isActive || admin.role !== "ADMIN") return false;
          },
        },
      },
    },
    plugins: options.plugins ?? [],
  });
}

export type Auth = ReturnType<typeof createAuth>;
