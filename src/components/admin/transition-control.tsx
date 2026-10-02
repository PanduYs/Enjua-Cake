"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { ORDER_STATUS_LABEL, TRANSITION_ACTION_LABEL, TRANSITION_ERROR_MESSAGE } from "@/lib/copy/orders";

type Status = keyof typeof ORDER_STATUS_LABEL;
type Target = keyof typeof TRANSITION_ACTION_LABEL;
type State = { status: "idle" | "error" | "success"; message?: string };
type Action = (prev: State, formData: FormData) => Promise<State>;

const BLOCKED_REASON: Partial<Record<Target, string>> = {
  COMPLETED: TRANSITION_ERROR_MESSAGE.PAYMENT_NOT_COMPLETE,
  CONFIRMED: TRANSITION_ERROR_MESSAGE.PAYMENT_NOT_CONFIRMED,
};

function Feedback({ state }: { state: State }) {
  if (state.status === "idle" || !state.message) return null;
  const error = state.status === "error";
  return (
    <p
      role={error ? "alert" : "status"}
      className={`rounded-control border px-4 py-3 text-sm font-medium ${error ? "border-danger text-danger" : "border-success text-success"} bg-surface`}
    >
      {state.message}
    </p>
  );
}

/** Only transitions allowed by the state machine are offered (FD-116); blocked ones are explained. */
export function TransitionControl({
  orderId,
  current,
  allowed,
  blocked,
  action,
}: {
  orderId: string;
  current: Status;
  allowed: readonly Status[];
  blocked: readonly Status[];
  action: Action;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
  });
  const [cancelOpen, setCancelOpen] = useState(false);
  const forward = allowed.filter((s): s is Exclude<Target, "CANCELLED"> => s !== "CANCELLED" && s !== "NEW");
  const canCancel = allowed.includes("CANCELLED");

  if (allowed.length === 0 && blocked.length === 0) {
    return <p className="text-sm text-muted-foreground">Status {ORDER_STATUS_LABEL[current]} adalah status akhir; tidak ada perubahan lanjutan.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <Feedback state={state} />
      {forward.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {forward.map((to) => (
            <form key={to} action={formAction}>
              <input type="hidden" name="orderId" value={orderId} />
              <input type="hidden" name="expectedFrom" value={current} />
              <input type="hidden" name="to" value={to} />
              <Button type="submit" disabled={pending}>
                {TRANSITION_ACTION_LABEL[to]}
              </Button>
            </form>
          ))}
        </div>
      ) : null}

      {blocked.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {blocked.map((to) => (
            <li key={to}>
              <strong>{TRANSITION_ACTION_LABEL[to as Target] ?? ORDER_STATUS_LABEL[to]}</strong> belum tersedia:{" "}
              {BLOCKED_REASON[to as Target] ?? TRANSITION_ERROR_MESSAGE.INVALID_TRANSITION}
            </li>
          ))}
        </ul>
      ) : null}

      {canCancel ? (
        cancelOpen ? (
          <form action={formAction} className="flex flex-col gap-2 rounded-card border border-danger p-4">
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="expectedFrom" value={current} />
            <input type="hidden" name="to" value="CANCELLED" />
            <label htmlFor="cancel-reason" className="font-semibold">
              Alasan pembatalan <span aria-hidden="true">*</span>
            </label>
            <textarea id="cancel-reason" name="reason" required maxLength={500} rows={3} className="rounded-control border border-border bg-background p-3" />
            <p className="text-sm text-muted-foreground">Pembatalan bersifat final dan melepas slot tanggal pickup. Alasan hanya terlihat oleh admin.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="danger" disabled={pending}>
                Konfirmasi Pembatalan
              </Button>
              <Button type="button" variant="secondary" onClick={() => setCancelOpen(false)}>
                Kembali
              </Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="secondary" className="self-start" onClick={() => setCancelOpen(true)}>
            {TRANSITION_ACTION_LABEL.CANCELLED}
          </Button>
        )
      ) : null}
    </div>
  );
}

type RegenerateState = State & { token?: string };

/** Shows the new access code once; it is not stored in plaintext anywhere (FD-68, FD-72). */
export function RegenerateTokenForm({ orderId, action }: { orderId: string; action: (prev: RegenerateState, formData: FormData) => Promise<RegenerateState> }) {
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
  });
  return (
    <form
      action={formAction}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        if (!window.confirm("Buat kode akses baru? Kode lama tidak akan berlaku lagi.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="orderId" value={orderId} />
      <Feedback state={state} />
      {state.token ? (
        <div className="rounded-control border-2 border-accent bg-background p-3">
          <p className="text-sm font-semibold">Kode akses baru (hanya ditampilkan sekali):</p>
          <p className="font-mono break-all" data-testid="regenerated-token">
            {state.token}
          </p>
        </div>
      ) : null}
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        Buat Ulang Kode Akses
      </Button>
    </form>
  );
}
