"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { TextField } from "@/components/ui/text-field";
import { ADMIN_PASSWORD_MIN, initialFormState, type FormState } from "@/lib/validation/admin-auth";

export function CreateAdminForm({ action }: { action: (state: FormState, fd: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormAlert state={state} />
      <TextField label="Nama" name="name" id="new-admin-name" defaultValue={state.values?.name ?? ""} required error={state.fieldErrors?.name} />
      <TextField label="Email" name="email" id="new-admin-email" type="email" autoComplete="off" defaultValue={state.values?.email ?? ""} required error={state.fieldErrors?.email} />
      <TextField
        label="Password awal"
        name="password"
        id="new-admin-password"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.password}
        hint={`Minimal ${ADMIN_PASSWORD_MIN} karakter.`}
      />
      <TextField label="Konfirmasi password awal" name="confirmPassword" id="new-admin-confirm" type="password" autoComplete="new-password" required error={state.fieldErrors?.confirmPassword} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Menyimpan…" : "Tambah Admin"}
      </Button>
    </form>
  );
}
