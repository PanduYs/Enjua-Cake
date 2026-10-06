import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { categories } from "@/server/db/schema";

import { openTestDatabase } from "../support/db";

/**
 * Defence in depth for the Supabase Data API (drizzle/0001_enable_rls.sql): every application
 * table has RLS on and no policies, so roles without BYPASSRLS (anon, authenticated) get nothing
 * even if a grant is added later, while the app — connected as the table owner — is unaffected.
 */

let handle: DatabaseHandle;
const declared = (Object.values(schema) as unknown[]).filter((value): value is PgTable => value instanceof PgTable).map((table) => getTableConfig(table));

beforeAll(() => {
  handle = openTestDatabase();
});
afterAll(async () => {
  await handle.close();
});

class Rollback extends Error {}

describe("row-level security on application tables", () => {
  it("is declared in the Drizzle schema and enabled (not forced, no policies) on every public table", async () => {
    expect(declared).toHaveLength(19);
    expect(declared.filter((t) => !t.enableRLS).map((t) => t.name)).toEqual([]);

    const tables = await handle.db.execute<{ name: string; rls: boolean; forced: boolean }>(sql`
      select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as forced
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' order by c.relname`);
    expect(tables.map((t) => t.name)).toEqual(declared.map((t) => t.name).sort());
    expect(tables.filter((t) => !t.rls || t.forced)).toEqual([]);

    const [{ policies }] = (await handle.db.execute<{ policies: number }>(sql`select count(*)::int as policies from pg_policies where schemaname = 'public'`)) as unknown as [{ policies: number }];
    expect(policies).toBe(0);
  });

  it("the application's own connection still reads and writes", async () => {
    const slug = `rls-${Date.now()}`;
    const [created] = await handle.db.insert(categories).values({ name: "RLS", slug }).returning({ id: categories.id });
    expect(await handle.db.select({ slug: categories.slug }).from(categories).where(eq(categories.id, created!.id))).toEqual([{ slug }]);
    await handle.db.delete(categories).where(eq(categories.id, created!.id));
  });

  it("a role without BYPASSRLS sees no rows and cannot insert, even with table grants", async () => {
    const slug = `rls-hidden-${Date.now()}`;
    await expect(
      handle.db.transaction(async (tx) => {
        await tx.insert(categories).values({ name: "Hidden", slug });
        // Like Supabase's anon role: not the owner, no BYPASSRLS. Created and dropped inside this transaction.
        await tx.execute(sql.raw("CREATE ROLE rls_probe NOLOGIN NOBYPASSRLS"));
        await tx.execute(sql.raw("GRANT USAGE ON SCHEMA public TO rls_probe"));
        await tx.execute(sql.raw("GRANT SELECT, INSERT ON categories TO rls_probe"));
        await tx.execute(sql.raw("SET LOCAL ROLE rls_probe"));

        const [{ visible }] = (await tx.execute<{ visible: number }>(sql`select count(*)::int as visible from categories`)) as unknown as [{ visible: number }];
        expect(visible).toBe(0);
        await expect(tx.transaction(async (sp) => sp.execute(sql`insert into categories (name, slug) values ('Probe', ${`${slug}-probe`})`))).rejects.toMatchObject({
          cause: expect.objectContaining({ code: "42501" }),
        });
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);

    // Everything above was rolled back: no role, no row.
    const [{ roles }] = (await handle.db.execute<{ roles: number }>(sql`select count(*)::int as roles from pg_roles where rolname = 'rls_probe'`)) as unknown as [{ roles: number }];
    expect(roles).toBe(0);
    expect(await handle.db.select().from(categories).where(eq(categories.slug, slug))).toEqual([]);
  });
});
