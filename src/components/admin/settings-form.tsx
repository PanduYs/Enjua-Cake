"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import type { FormState } from "@/lib/validation/admin-auth";
import { MAX_BANK_ACCOUNTS, MAX_LINKS } from "@/lib/validation/admin-settings";

import { FormMessage, TextAreaField } from "./fields";

export interface SettingsDefaults {
  business_name: string;
  business_description: string | null;
  address: string | null;
  whatsapp_number: string | null;
  operating_hours: string | null;
  pickup_hours: string | null;
  pickup_instructions: string | null;
  payment_instructions: string | null;
  pickup_cutoff: string;
  default_capacity: number;
  booking_horizon_days: number;
  qris_reservation_minutes: number;
  transfer_reservation_minutes: number;
  bank_accounts: Array<{ bankName: string; accountNumber: string; accountHolder: string }>;
  social_links: Array<{ label: string; url: string }>;
  policy_links: Array<{ label: string; url: string }>;
}

function Group({ title, children, description }: { title: string; children: React.ReactNode; description?: string }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-card bg-surface p-5">
      <legend className="float-left mb-1 w-full font-heading text-xl">{title}</legend>
      {description ? <p className="clear-both text-sm text-muted-foreground">{description}</p> : null}
      <div className="clear-both flex flex-col gap-4">{children}</div>
    </fieldset>
  );
}

function LinkRows({ name, label, initial, error }: { name: "social_links" | "policy_links"; label: string; initial: Array<{ label: string; url: string }>; error?: string }) {
  const [count, setCount] = useState(Math.min(Math.max(initial.length, 1), MAX_LINKS));
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <TextField label={`${label} ${i + 1}: label`} name={`${name}.${i}.label`} id={`${name}-${i}-label`} defaultValue={initial[i]?.label ?? ""} />
          <TextField label={`${label} ${i + 1}: URL`} name={`${name}.${i}.url`} id={`${name}-${i}-url`} type="url" defaultValue={initial[i]?.url ?? ""} placeholder="https://" />
        </div>
      ))}
      {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
      {count < MAX_LINKS ? (
        <Button type="button" variant="secondary" className="self-start" onClick={() => setCount(count + 1)}>
          Tambah {label}
        </Button>
      ) : null}
    </div>
  );
}

/** Website Settings (PRD §32, Design §20). Empty fields stay empty — nothing is invented (FD-88). */
export function SettingsForm({ action, defaults }: { action: (prev: FormState, fd: FormData) => Promise<FormState>; defaults: SettingsDefaults }) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" } as FormState);
  const [banks, setBanks] = useState(Math.min(Math.max(defaults.bank_accounts.length, 1), MAX_BANK_ACCOUNTS));
  const e = state.fieldErrors ?? {};

  // Submitted without the form `action` prop so React does not reset fields after an error.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    startTransition(() => formAction(fd));
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <FormMessage state={state} />

      <Group title="Bisnis & Kontak">
        <TextField label="Nama bisnis" name="business_name" defaultValue={defaults.business_name} required error={e.business_name} />
        <TextAreaField label="Deskripsi bisnis" name="business_description" defaultValue={defaults.business_description ?? ""} rows={3} error={e.business_description} />
        <TextAreaField label="Alamat pickup" name="address" defaultValue={defaults.address ?? ""} rows={2} error={e.address} />
        <TextField label="Nomor WhatsApp" name="whatsapp_number" inputMode="tel" defaultValue={defaults.whatsapp_number ?? ""} error={e.whatsapp_number} hint="Dipakai untuk tombol WhatsApp di website. Kosongkan bila belum ada." />
        <TextAreaField label="Jam operasional" name="operating_hours" defaultValue={defaults.operating_hours ?? ""} rows={2} error={e.operating_hours} />
      </Group>

      <Group title="Pickup">
        <TextAreaField label="Jam pickup (informasi)" name="pickup_hours" defaultValue={defaults.pickup_hours ?? ""} rows={2} error={e.pickup_hours} />
        <TextAreaField label="Instruksi pickup" name="pickup_instructions" defaultValue={defaults.pickup_instructions ?? ""} rows={3} error={e.pickup_instructions} />
        <TextField label="Pickup cutoff (WIB)" name="pickup_cutoff" defaultValue={defaults.pickup_cutoff} placeholder="15:00" error={e.pickup_cutoff} hint="Pesanan pada/sesudah jam ini dihitung sebagai pesanan hari berikutnya." />
      </Group>

      <Group title="Kapasitas & Reservasi" description="Perubahan hanya berlaku untuk pesanan baru; batas waktu pesanan yang sudah ada tidak berubah.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Kapasitas default per tanggal" name="default_capacity" inputMode="numeric" defaultValue={String(defaults.default_capacity)} error={e.default_capacity} />
          <TextField label="Booking horizon (hari)" name="booking_horizon_days" inputMode="numeric" defaultValue={String(defaults.booking_horizon_days)} error={e.booking_horizon_days} />
          <TextField label="Masa reservasi QRIS (menit)" name="qris_reservation_minutes" inputMode="numeric" defaultValue={String(defaults.qris_reservation_minutes)} error={e.qris_reservation_minutes} hint="10–120 menit." />
          <TextField
            label="Masa reservasi Transfer (menit)"
            name="transfer_reservation_minutes"
            inputMode="numeric"
            defaultValue={String(defaults.transfer_reservation_minutes)}
            error={e.transfer_reservation_minutes}
            hint="30–1.440 menit."
          />
        </div>
      </Group>

      <Group title="Pembayaran" description="Rekening tampil di halaman pembayaran Transfer Bank. Isi hanya dengan data resmi dari pemilik usaha.">
        {Array.from({ length: banks }, (_, i) => (
          <div key={i} className="grid gap-3 rounded-control border border-border p-3 sm:grid-cols-3">
            <TextField label={`Rekening ${i + 1}: nama bank`} name={`bank_accounts.${i}.bankName`} id={`bank-${i}-name`} defaultValue={defaults.bank_accounts[i]?.bankName ?? ""} />
            <TextField label={`Rekening ${i + 1}: nomor`} name={`bank_accounts.${i}.accountNumber`} id={`bank-${i}-number`} inputMode="numeric" defaultValue={defaults.bank_accounts[i]?.accountNumber ?? ""} />
            <TextField label={`Rekening ${i + 1}: atas nama`} name={`bank_accounts.${i}.accountHolder`} id={`bank-${i}-holder`} defaultValue={defaults.bank_accounts[i]?.accountHolder ?? ""} />
          </div>
        ))}
        {e.bank_accounts ? <p className="text-sm font-medium text-danger">{e.bank_accounts}</p> : null}
        {banks < MAX_BANK_ACCOUNTS ? (
          <Button type="button" variant="secondary" className="self-start" onClick={() => setBanks(banks + 1)}>
            Tambah Rekening
          </Button>
        ) : null}
        <TextAreaField label="Instruksi pembayaran" name="payment_instructions" defaultValue={defaults.payment_instructions ?? ""} rows={3} error={e.payment_instructions} />
      </Group>

      <Group title="Media Sosial & Kebijakan">
        <LinkRows name="social_links" label="Media sosial" initial={defaults.social_links} error={e.social_links} />
        <LinkRows name="policy_links" label="Tautan kebijakan" initial={defaults.policy_links} error={e.policy_links} />
      </Group>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Menyimpan…" : "Simpan Pengaturan"}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
