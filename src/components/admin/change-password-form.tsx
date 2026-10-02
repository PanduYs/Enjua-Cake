"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { TextField } from "@/components/ui/text-field";
import { ADMIN_PASSWORD_MIN, initialFormState, type FormState } from "@/lib/validation/admin-auth";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function ChangePasswordForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormAlert state={state} />
      <TextField
        label="Password saat ini"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.currentPassword}
      />
      <TextField
        label="Password baru"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        minLength={ADMIN_PASSWORD_MIN}
        hint={`Minimal ${ADMIN_PASSWORD_MIN} karakter.`}
        error={state.fieldErrors?.newPassword}
      />
      <TextField
        label="Konfirmasi password baru"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <Button type="submit" disabled={pending} aria-disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan Password"}
      </Button>
    </form>
  );
}
