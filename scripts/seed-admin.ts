/**
 * Development-only: creates the first ADMIN account from SEED_ADMIN_* variables.
 * Usage: npm run db:seed-admin   (requires DATABASE_URL and a migrated database)
 * Refuses to run when NODE_ENV=production; production admins are created deliberately.
 */
import { AdminAccountError, createAdminAccount } from "@/server/auth/admin-accounts";
import { createDatabase } from "@/server/db/client";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seed-admin is for development only and refuses to run in production.");
  }
  const url = process.env.DATABASE_URL;
  const name = process.env.SEED_ADMIN_NAME ?? "Admin Enjua";
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!url || !email || !password) {
    throw new Error("DATABASE_URL, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required.");
  }

  const handle = createDatabase(url, { max: 1 });
  try {
    const { id } = await createAdminAccount(handle.db, { name, email, password }, { type: "SYSTEM" });
    console.log(`Admin created: ${email} (${id})`);
  } catch (error) {
    if (error instanceof AdminAccountError && error.code === "EMAIL_TAKEN") {
      console.log(`Admin already exists: ${email} — nothing to do.`);
      return;
    }
    throw error;
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
