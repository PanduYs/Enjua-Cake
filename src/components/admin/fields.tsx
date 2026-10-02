import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

import type { FormState } from "@/lib/validation/admin-auth";

const control = "min-h-11 rounded-control border border-muted-foreground bg-surface px-3 py-2 text-base text-foreground";

function Described({ id, hint, error }: { id: string; hint?: ReactNode; error?: string }) {
  return (
    <>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}

const describedBy = (id: string, hint?: ReactNode, error?: string) => [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;

export function SelectField({
  label,
  name,
  error,
  hint,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; name: string; error?: string; hint?: ReactNode }) {
  const fieldId = id ?? name;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="font-semibold">
        {label}
      </label>
      <select id={fieldId} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy(fieldId, hint, error)} className={`${control} w-full min-w-0`} {...props}>
        {children}
      </select>
      <Described id={fieldId} hint={hint} error={error} />
    </div>
  );
}

export function TextAreaField({
  label,
  name,
  error,
  hint,
  id,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; name: string; error?: string; hint?: ReactNode }) {
  const fieldId = id ?? name;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="font-semibold">
        {label}
      </label>
      <textarea id={fieldId} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy(fieldId, hint, error)} className={`${control} min-h-24`} {...props} />
      <Described id={fieldId} hint={hint} error={error} />
    </div>
  );
}

export function CheckboxField({ label, name, hint, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: ReactNode }) {
  const fieldId = id ?? name;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="flex min-h-11 items-center gap-3 font-semibold">
        <input id={fieldId} name={name} type="checkbox" className="h-5 w-5 accent-primary" aria-describedby={hint ? `${fieldId}-hint` : undefined} {...props} />
        {label}
      </label>
      <Described id={fieldId} hint={hint} />
    </div>
  );
}

export function FileField({ label, name, error, hint, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; error?: string; hint?: ReactNode }) {
  const fieldId = id ?? name;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="font-semibold">
        {label}
      </label>
      <input id={fieldId} name={name} type="file" aria-invalid={error ? true : undefined} aria-describedby={describedBy(fieldId, hint, error)} className="text-sm" {...props} />
      <Described id={fieldId} hint={hint} error={error} />
    </div>
  );
}

/** Form-level result, announced to assistive technology. */
export function FormMessage({ state }: { state: FormState }) {
  if (state.status === "idle" || !state.message) return null;
  const error = state.status === "error";
  return (
    <p role={error ? "alert" : "status"} className={`rounded-control border bg-surface px-4 py-3 text-sm font-medium ${error ? "border-danger text-danger" : "border-success text-success"}`}>
      {state.message}
    </p>
  );
}
