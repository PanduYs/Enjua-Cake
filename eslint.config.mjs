import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Layer rules (IMPLEMENTATION-PLAN.md §2.1):
 * - src/server/domain is pure: no framework, ORM, provider, storage or I/O imports.
 * - Client-reachable code (components, lib) must not import server-only modules.
 */
const domainForbidden = [
  { group: ["next", "next/*", "react", "react-dom"], message: "Domain layer must not depend on frameworks." },
  { group: ["drizzle-orm", "drizzle-orm/*", "postgres", "better-auth", "better-auth/*"], message: "Domain layer must not depend on ORM/auth libraries." },
  {
    group: ["@/server/db", "@/server/db/*", "@/server/payments", "@/server/payments/*", "@/server/storage", "@/server/storage/*", "@/server/auth", "@/server/auth/*", "@/server/services", "@/server/services/*"],
    message: "Domain layer must not import infrastructure or services.",
  },
];

const config = [
  { ignores: [".next/**", "node_modules/**", "drizzle/**", "coverage/**", "next-env.d.ts"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    files: ["src/server/domain/**/*.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: domainForbidden }] },
  },
  {
    files: ["src/components/**/*.{ts,tsx}", "src/lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/server/*"], message: "Client-reachable code must not import server modules." }] },
      ],
    },
  },
];

export default config;
