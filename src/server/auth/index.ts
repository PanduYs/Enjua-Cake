import "server-only";

import { nextCookies } from "better-auth/next-js";

import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";

import { createAuth, type Auth } from "./config";

const globalForAuth = globalThis as unknown as { __enjuaAuth?: Auth };

/** App-wide Better Auth instance. nextCookies() lets server actions set session cookies. */
export function getAuth(): Auth {
  if (!globalForAuth.__enjuaAuth) {
    const env = getEnv();
    globalForAuth.__enjuaAuth = createAuth({
      db: getDb(),
      secret: env.AUTH_SECRET,
      baseURL: env.APP_URL,
      secureCookies: env.NODE_ENV === "production",
      plugins: [nextCookies()],
    });
  }
  return globalForAuth.__enjuaAuth;
}
