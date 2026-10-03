/**
 * Production-safety check for SQL migrations (plan §36.1: forward-only, tested on
 * staging). Destructive statements fail the check unless the migration carries an
 * explicit reviewed marker on the line above: `-- allow-destructive: <reason>`.
 */
const DESTRUCTIVE = [
  /\bDROP\s+(TABLE|COLUMN|TYPE|SCHEMA|INDEX|CONSTRAINT|VIEW|SEQUENCE)\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bALTER\s+TABLE\b[^;]*\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i,
  /\bALTER\s+TABLE\b[^;]*\bRENAME\b/i,
];

export interface MigrationFinding {
  file: string;
  line: number;
  statement: string;
}

export function findDestructiveStatements(file: string, sql: string): MigrationFinding[] {
  const lines = sql.split("\n");
  const findings: MigrationFinding[] = [];
  lines.forEach((text, index) => {
    if (!DESTRUCTIVE.some((re) => re.test(text))) return;
    const previous = lines[index - 1] ?? "";
    if (/--\s*allow-destructive:\s*\S/.test(previous)) return;
    findings.push({ file, line: index + 1, statement: text.trim().slice(0, 160) });
  });
  return findings;
}
