/**
 * Fails when a migration contains destructive SQL without a reviewed
 * `-- allow-destructive: <reason>` marker. Run: npm run db:check-migrations (also in CI).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { findDestructiveStatements } from "../src/server/ops/migration-guard";

const dir = path.resolve("drizzle");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const findings = files.flatMap((f) => findDestructiveStatements(f, readFileSync(path.join(dir, f), "utf8")));
if (findings.length) {
  for (const f of findings) console.error(`${f.file}:${f.line} destructive statement without review marker: ${f.statement}`);
  process.exit(1);
}
console.log(`Checked ${files.length} migration file(s): no unreviewed destructive statements.`);
