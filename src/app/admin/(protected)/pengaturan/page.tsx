import type { Metadata } from "next";

import { SettingsForm } from "@/components/admin/settings-form";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getSettings } from "@/server/services/settings";

import { saveSettingsAction } from "./actions";

export const metadata: Metadata = { title: "Pengaturan" };

export default async function AdminSettingsPage() {
  await requireAdmin();
  const s = await getSettings(getDb());
  const missing = [
    !s.address && "alamat",
    !s.whatsapp_number && "nomor WhatsApp",
    s.bank_accounts.length === 0 && "rekening bank",
    !s.pickup_hours && "jam pickup",
  ].filter(Boolean);
  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-3xl">Pengaturan Website</h1>
      {missing.length > 0 ? (
        <p className="rounded-control border border-accent bg-surface px-4 py-3 text-sm">
          Belum diisi: {missing.join(", ")}. Bagian terkait disembunyikan di website sampai data resmi dari pemilik usaha dimasukkan.
        </p>
      ) : null}
      <SettingsForm
        action={saveSettingsAction}
        defaults={{
          business_name: s.business_name,
          business_description: s.business_description,
          address: s.address,
          whatsapp_number: s.whatsapp_number,
          operating_hours: s.operating_hours,
          pickup_hours: s.pickup_hours,
          pickup_instructions: s.pickup_instructions,
          payment_instructions: s.payment_instructions,
          pickup_cutoff: String(s.pickup_cutoff),
          default_capacity: s.default_capacity,
          booking_horizon_days: s.booking_horizon_days,
          qris_reservation_minutes: s.qris_reservation_minutes,
          transfer_reservation_minutes: s.transfer_reservation_minutes,
          bank_accounts: s.bank_accounts,
          social_links: s.social_links,
          policy_links: s.policy_links,
        }}
      />
    </section>
  );
}
