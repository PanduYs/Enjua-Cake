import "server-only";

import { z } from "zod";

import type { Database } from "@/server/db/client";
import { settings } from "@/server/db/schema";
import { parseTimeOfDay } from "@/server/domain/time/wib";
import { logger } from "@/server/observability/logger";

const optionalText = z.string().trim().min(1).nullable();
const linkSchema = z.object({ label: z.string().trim().min(1), url: z.url() });

/**
 * Website Settings schema (IMPLEMENTATION-PLAN §27). Defaults are development
 * values; business facts default to null and are hidden until the client
 * provides them (FD-88, FD-99) — nothing is invented.
 */
export const settingsSchema = {
  business_name: { schema: z.string().trim().min(1), default: "Enjua Cake's" },
  business_description: { schema: optionalText, default: null },
  address: { schema: optionalText, default: null },
  whatsapp_number: { schema: optionalText, default: null },
  social_links: { schema: z.array(linkSchema), default: [] as Array<z.infer<typeof linkSchema>> },
  policy_links: { schema: z.array(linkSchema), default: [] as Array<z.infer<typeof linkSchema>> },
  operating_hours: { schema: optionalText, default: null },
  pickup_hours: { schema: optionalText, default: null },
  pickup_instructions: { schema: optionalText, default: null },
  pickup_cutoff: { schema: z.string().transform((v, ctx) => {
    try {
      return parseTimeOfDay(v);
    } catch {
      ctx.addIssue({ code: "custom", message: "pickup_cutoff must be HH:mm" });
      return z.NEVER;
    }
  }), default: parseTimeOfDay("15:00") },
  default_capacity: { schema: z.number().int().min(0), default: 10 },
  booking_horizon_days: { schema: z.number().int().min(1), default: 60 },
  bank_accounts: {
    schema: z.array(z.object({ bankName: z.string().min(1), accountNumber: z.string().min(1), accountHolder: z.string().min(1) })),
    default: [] as Array<{ bankName: string; accountNumber: string; accountHolder: string }>,
  },
  payment_instructions: { schema: optionalText, default: null },
  qris_reservation_minutes: { schema: z.number().int().min(10).max(120), default: 30 },
  transfer_reservation_minutes: { schema: z.number().int().min(30).max(1440), default: 120 },
  qr_expiry_buffer_minutes: { schema: z.number().int().min(0).max(10), default: 2 },
  qris_remaining_payment_minutes: { schema: z.number().int().min(10).max(120), default: 30 },
  transfer_remaining_payment_minutes: { schema: z.number().int().min(30).max(1440), default: 120 },
} as const;

type SettingsSchema = typeof settingsSchema;
export type SettingKey = keyof SettingsSchema;
export type Settings = { [K in SettingKey]: z.output<SettingsSchema[K]["schema"]> };

/** Pure: stored rows → typed settings. Invalid or missing values fall back to defaults. */
export function resolveSettings(rows: ReadonlyArray<{ key: string; value: unknown }>, onInvalid?: (key: string) => void): Settings {
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(settingsSchema) as SettingKey[]) {
    const def = settingsSchema[key];
    if (!stored.has(key)) {
      result[key] = def.default;
      continue;
    }
    const parsed = def.schema.safeParse(stored.get(key));
    if (parsed.success) result[key] = parsed.data;
    else {
      onInvalid?.(key);
      result[key] = def.default;
    }
  }
  return result as Settings;
}

export async function getSettings(db: Database): Promise<Settings> {
  const rows = await db.select({ key: settings.key, value: settings.value }).from(settings);
  return resolveSettings(rows, (key) => logger.warn("settings_invalid_value", { key }));
}

export type PublicSiteSettings = Pick<
  Settings,
  | "business_name"
  | "business_description"
  | "address"
  | "whatsapp_number"
  | "social_links"
  | "policy_links"
  | "operating_hours"
  | "pickup_hours"
  | "pickup_instructions"
  | "pickup_cutoff"
>;

export function toPublicSiteSettings(s: Settings): PublicSiteSettings {
  return {
    business_name: s.business_name,
    business_description: s.business_description,
    address: s.address,
    whatsapp_number: s.whatsapp_number,
    social_links: s.social_links,
    policy_links: s.policy_links,
    operating_hours: s.operating_hours,
    pickup_hours: s.pickup_hours,
    pickup_instructions: s.pickup_instructions,
    pickup_cutoff: s.pickup_cutoff,
  };
}
