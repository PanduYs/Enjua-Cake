import "server-only";

import { eq } from "drizzle-orm";

import { fieldErrorsOf } from "@/lib/validation/admin-catalog";
import { settingsFormSchema } from "@/lib/validation/admin-settings";
import type { Database } from "@/server/db/client";
import { settings } from "@/server/db/schema";
import { writeAudit } from "@/server/observability/audit";

import { getSettings, settingsSchema, type SettingKey } from "./settings";

/**
 * Saves Website Settings (FD-86, FD-87, TD-18). Each value is validated twice: by the
 * form schema (Indonesian messages) and by the stored-value schema. Only changed
 * keys are written; the change is audited (§39). Changes apply to new orders only —
 * existing reservations keep their deadline (FD-120).
 */
export async function updateWebsiteSettings(
  db: Database,
  raw: Record<string, unknown>,
  adminId: string,
): Promise<{ ok: true; changed: string[] } | { ok: false; fieldErrors: Partial<Record<string, string>> }> {
  const parsed = settingsFormSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  const current = await getSettings(db);
  const next = parsed.data as Record<string, unknown>;
  const changed: SettingKey[] = [];
  for (const key of Object.keys(next) as SettingKey[]) {
    const check = settingsSchema[key].schema.safeParse(next[key]);
    if (!check.success) return { ok: false, fieldErrors: { [key]: "Nilai tidak valid." } };
    const before = key === "pickup_cutoff" ? String(current[key]) : current[key];
    if (JSON.stringify(before) !== JSON.stringify(next[key])) changed.push(key);
  }
  if (changed.length === 0) return { ok: true, changed: [] };

  await db.transaction(async (tx) => {
    const now = new Date();
    for (const key of changed) {
      // Cleared optional values fall back to their default (null): no row, nothing invented (FD-88).
      if (next[key] === null) {
        await tx.delete(settings).where(eq(settings.key, key));
        continue;
      }
      await tx
        .insert(settings)
        .values({ key, value: next[key] as never, updatedByAdminId: adminId, updatedAt: now })
        .onConflictDoUpdate({ target: settings.key, set: { value: next[key] as never, updatedByAdminId: adminId, updatedAt: now } });
    }
    await writeAudit(tx, {
      entityType: "settings",
      entityId: null,
      eventType: "SETTINGS_UPDATED",
      oldValue: Object.fromEntries(changed.map((k) => [k, current[k]])),
      newValue: Object.fromEntries(changed.map((k) => [k, next[k]])),
      actor: { type: "ADMIN", adminId },
    });
  });
  return { ok: true, changed };
}
