/** Name of the violated unique constraint, if `error` is a PostgreSQL unique violation (23505). */
export function uniqueViolationConstraint(error: unknown): string | null {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  for (const candidate of candidates) {
    const e = candidate as { code?: string; constraint_name?: string } | null;
    if (e && e.code === "23505") return e.constraint_name ?? "";
  }
  return null;
}
