"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { TextField } from "@/components/ui/text-field";
import { initialFormState, type FormState } from "@/lib/validation/admin-auth";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function LoginForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormAlert state={state} />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="username"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <Button type="submit" disabled={pending} aria-disabled={pending}>
        {pending ? "Memproses…" : "Masuk"}
      </Button>
    </form>
  );
}
