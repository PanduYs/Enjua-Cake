/**
 * Production-safe admin account CLI (TD-10: no public sign-up; §8.1 recovery).
 *
 *   npm run admin -- create --email=owner@domain --name="Nama Admin"
 *   npm run admin -- reset-password --email=owner@domain
 *
 * The password is read from a hidden prompt (or from stdin when piped) — never from
 * argv, so it does not land in shell history or process listings. Requires DATABASE_URL.
 */
import { createInterface } from "node:readline";

import { createAdminSchema } from "@/lib/validation/admin-users";
import { AdminAccountError, createAdminAccount } from "@/server/auth/admin-accounts";
import { createDatabase } from "@/server/db/client";
import { resetAdminPasswordByEmail } from "@/server/services/admin-users";

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function readSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) return line;
    return "";
  }
  process.stdout.write(prompt);
  return new Promise((resolve) => {
    let value = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onData = (chunk: Buffer) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") process.exit(130);
        value = ch === "\u007f" ? value.slice(0, -1) : value + ch;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const command = process.argv[2];
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const email = arg("email");
  if (!email || (command !== "create" && command !== "reset-password")) {
    console.error('Usage: npm run admin -- create --email=… --name="…"  |  npm run admin -- reset-password --email=…');
    process.exit(2);
  }
  const password = await readSecret("Password (min. 12 karakter): ");
  const confirmPassword = process.stdin.isTTY ? await readSecret("Ulangi password: ") : password;

  const handle = createDatabase(url, { max: 1, silenceNotices: true });
  try {
    if (command === "create") {
      const parsed = createAdminSchema.safeParse({ name: arg("name") ?? "", email, password, confirmPassword });
      if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(" "));
      try {
        await createAdminAccount(handle.db, { name: parsed.data.name, email: parsed.data.email, password: parsed.data.password }, { type: "SYSTEM" });
      } catch (error) {
        if (error instanceof AdminAccountError && error.code === "EMAIL_TAKEN") throw new Error("Email sudah dipakai admin lain.");
        throw error;
      }
      console.log(`Admin dibuat: ${parsed.data.email}`);
    } else {
      const result = await resetAdminPasswordByEmail(handle.db, { email, raw: { password, confirmPassword } });
      if (!result.ok) throw new Error(result.error === "NOT_FOUND" ? "Admin tidak ditemukan." : Object.values(result.fieldErrors ?? {}).join(" "));
      console.log("Password direset; semua sesi admin tersebut diakhiri.");
    }
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Gagal");
  process.exit(1);
});
