import type { FormState } from "@/lib/validation/admin-auth";

/** Announces form-level results to assistive technology. */
export function FormAlert({ state }: { state: FormState }) {
  if (state.status === "idle" || !state.message) return null;
  const isError = state.status === "error";
  return (
    <p
      role={isError ? "alert" : "status"}
      className={`rounded-control border px-4 py-3 text-sm font-medium ${isError ? "border-danger text-danger" : "border-success text-success"} bg-surface`}
    >
      {state.message}
    </p>
  );
}
