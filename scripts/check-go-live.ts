/**
 * Usage: DATABASE_URL=… npm run check:go-live
 * Prints the GL-01…GL-12 data checklist from the target database. Read-only.
 */
import { createDatabase } from "@/server/db/client";
import { goLiveChecklist } from "@/server/ops/go-live";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const handle = createDatabase(url, { max: 1, silenceNotices: true });
  try {
    const items = await goLiveChecklist(handle.db);
    for (const i of items) console.log(`${i.status.padEnd(11)} ${i.id.padEnd(6)} ${i.label}${i.note ? ` — ${i.note}` : ""}`);
    const blocking = items.filter((i) => i.status === "MISSING" || i.status === "SAMPLE_DATA");
    console.log(blocking.length ? `\n${blocking.length} item(s) need client data before go-live.` : "\nAll automatically checkable items are OK; review MANUAL items.");
    process.exitCode = blocking.length ? 1 : 0;
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "check failed");
  process.exit(2);
});
