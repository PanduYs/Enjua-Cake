"use client";

import { useActionState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

type State = { status: "idle" | "error" | "success"; message?: string };

/** Small admin form bound to one server action, with an accessible result message. */
export function ActionForm({
  action,
  children,
  submitLabel,
  variant = "primary",
  confirmText,
  className = "",
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
  children?: ReactNode;
  submitLabel: string;
  variant?: "primary" | "secondary" | "danger";
  confirmText?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  return (
    <form
      action={formAction}
      className={`flex flex-col gap-2 ${className}`}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
      <Button type="submit" variant={variant} disabled={pending} className="self-start">
        {pending ? "Memproses…" : submitLabel}
      </Button>
      {state.status !== "idle" && state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`rounded-control border bg-surface px-3 py-2 text-sm font-medium ${state.status === "error" ? "border-danger text-danger" : "border-success text-success"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
