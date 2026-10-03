/**
 * Usage: npm run preflight -- --target=production|staging
 * Validates the deployment environment (names/shape only; values are never printed).
 */
import { preflight, type Target } from "../src/server/ops/preflight";

const arg = process.argv.find((a) => a.startsWith("--target="))?.split("=")[1] ?? "production";
if (arg !== "production" && arg !== "staging") {
  console.error("--target must be production or staging");
  process.exit(2);
}
const { errors, warnings } = preflight(process.env, arg as Target);
for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`FAIL  ${e}`);
console.log(errors.length ? `\nPreflight ${arg}: ${errors.length} blocking issue(s).` : `\nPreflight ${arg}: OK (${warnings.length} warning(s)).`);
process.exit(errors.length ? 1 : 0);
