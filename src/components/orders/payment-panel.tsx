"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { PAYMENT_PURPOSE_LABEL } from "@/lib/copy/payments";
import { formatWibDateTime } from "@/lib/format/date";
import { formatRupiah } from "@/lib/format/rupiah";
import type { CustomerPaymentState } from "@/lib/orders/payment-state";

import { CopyButton } from "./copy-button";

type ActionResult = { ok: boolean; message?: string };

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf";

/** Re-renders the page when the server-side payment status changes (QRIS confirmed by webhook). */
function usePaymentPolling(enabled: boolean, current: string) {
  const router = useRouter();
  const last = useRef(current);
  useEffect(() => {
    last.current = current;
  }, [current]);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch("/api/payments/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { orderStatus: string; paymentStatus: string };
        if (`${data.orderStatus}/${data.paymentStatus}` !== last.current) router.refresh();
      } catch {
        // Network hiccup: try again on the next tick.
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [enabled, router]);
}

function QrisBlock({
  state,
  qrDataUrl,
  requestQris,
  simulate,
}: {
  state: CustomerPaymentState;
  qrDataUrl: string | null;
  requestQris: () => Promise<ActionResult>;
  simulate: ((outcome: "PAID" | "FAILED") => Promise<ActionResult>) | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const qris = state.activeQris;

  const run = (action: () => Promise<ActionResult>) =>
    start(async () => {
      setMessage(null);
      const result = await action();
      if (!result.ok && result.message) setMessage(result.message);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      {qris && qrDataUrl ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-background p-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL, not an optimizable asset */}
          <img src={qrDataUrl} alt={`Kode QRIS untuk membayar ${formatRupiah(qris.amount)}`} width={240} height={240} className="h-60 w-60" data-testid="qris-image" />
          <p className="font-semibold">
            {PAYMENT_PURPOSE_LABEL[qris.purpose]}: {formatRupiah(qris.amount)}
          </p>
          <p className="text-sm">Pindai dengan aplikasi bank atau e-wallet yang mendukung QRIS sebelum {formatWibDateTime(qris.expiresAt)} WIB.</p>
          <p className="text-sm text-muted-foreground" role="status">
            Status diperbarui otomatis setelah pembayaran terverifikasi.
          </p>
        </div>
      ) : (
        <>
          {state.lastAttempt ? (
            <p className="rounded-control border border-danger bg-background px-4 py-3 text-sm">
              Pembayaran QRIS sebelumnya {state.lastAttempt === "FAILED" ? "gagal" : "kedaluwarsa"}. Silakan buat QRIS baru.
            </p>
          ) : null}
          <Button type="button" disabled={pending} onClick={() => run(requestQris)} className="self-start">
            {pending ? "Menyiapkan QRIS…" : state.lastAttempt ? "Buat QRIS Baru" : "Tampilkan QRIS"}
          </Button>
        </>
      )}
      {message ? (
        <p role="alert" className="rounded-control border border-danger bg-background px-4 py-3 text-sm font-medium text-danger">
          {message}
        </p>
      ) : null}
      {simulate && qris ? (
        <div className="flex flex-wrap gap-2 rounded-control border border-dashed border-border p-3 text-sm">
          <span className="w-full text-muted-foreground">Mode uji (MockProvider) — tidak tersedia di production.</span>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => simulate("PAID"))}>
            Simulasikan Bayar Berhasil
          </Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => simulate("FAILED"))}>
            Simulasikan Bayar Gagal
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TransferBlock({ state }: { state: CustomerPaymentState }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const transfer = state.pendingTransfer;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get("file");
    if (!(file instanceof File) || file.size === 0) return setMessage({ error: true, text: "Pilih file bukti pembayaran." });
    if (file.size > MAX_BYTES) return setMessage({ error: true, text: "Ukuran file maksimal 5 MB." });
    setPending(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/uploads/payment-proof", { method: "POST", body });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; message?: string };
      if (data.ok) {
        setMessage({ error: false, text: "Bukti pembayaran terkirim. Admin akan memverifikasi." });
        router.refresh();
      } else setMessage({ error: true, text: data.message ?? "Gagal mengunggah. Silakan coba lagi." });
    } catch {
      setMessage({ error: true, text: "Tidak dapat terhubung. Periksa koneksi lalu coba lagi." });
    }
    setPending(false);
  }

  if (!transfer) return null;
  return (
    <div className="flex flex-col gap-3">
      <p>
        Transfer <strong>{formatRupiah(transfer.amount)}</strong> ({PAYMENT_PURPOSE_LABEL[transfer.purpose]}) ke rekening berikut
        {transfer.expiresAt ? <> sebelum {formatWibDateTime(transfer.expiresAt)} WIB</> : null}:
      </p>
      {state.bankAccounts.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {state.bankAccounts.map((a) => (
            <li key={`${a.bankName}-${a.accountNumber}`} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-background p-3">
              <span>
                <strong>{a.bankName}</strong> · <span className="font-mono">{a.accountNumber}</span> · a.n. {a.accountHolder}
              </span>
              <CopyButton value={a.accountNumber} label={`Salin nomor rekening ${a.bankName}`} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-control bg-pastel-peach px-4 py-3">Informasi rekening belum tersedia. Hubungi kami via WhatsApp untuk instruksi transfer.</p>
      )}
      {state.paymentInstructions ? <p className="whitespace-pre-line text-muted-foreground">{state.paymentInstructions}</p> : null}
      {state.lastProofRejected ? (
        <p className="rounded-control border border-danger bg-background px-4 py-3">Bukti pembayaran sebelumnya ditolak. Silakan unggah bukti yang benar sebelum batas waktu.</p>
      ) : null}
      <form onSubmit={onSubmit} className="flex flex-col gap-2" noValidate>
        <label htmlFor="proof-file" className="font-semibold">
          Unggah bukti transfer
        </label>
        <input id="proof-file" name="file" type="file" accept={ACCEPT} required aria-describedby="proof-help" className="text-sm" />
        <p id="proof-help" className="text-muted-foreground">
          JPG, PNG, atau PDF, maksimal 5 MB.
        </p>
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Mengunggah…" : "Kirim Bukti Pembayaran"}
        </Button>
      </form>
      {message ? (
        <p role={message.error ? "alert" : "status"} className={`rounded-control border bg-background px-4 py-3 font-medium ${message.error ? "border-danger text-danger" : "border-success text-success"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

/** Payment actions on the tracking page (§15–§18). Status changes only come from the server. */
export function PaymentPanel({
  state,
  statusKey,
  qrDataUrl,
  requestQris,
  startTransferRemaining,
  simulate,
}: {
  state: CustomerPaymentState;
  statusKey: string;
  qrDataUrl: string | null;
  requestQris: () => Promise<ActionResult>;
  startTransferRemaining: () => Promise<ActionResult>;
  simulate: ((outcome: "PAID" | "FAILED") => Promise<ActionResult>) | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [remainingMethod, setRemainingMethod] = useState<"QRIS" | "BANK_TRANSFER" | null>(
    state.activeQris ? "QRIS" : state.pendingTransfer ? "BANK_TRANSFER" : null,
  );
  usePaymentPolling(state.stage === "PAY_INITIAL" || state.stage === "PAY_REMAINING" || state.stage === "VERIFYING", statusKey);

  if (state.stage === "CLOSED" || state.stage === "PAID") return null;

  return (
    <section aria-labelledby="bayar" className="flex flex-col gap-3 rounded-card border-2 border-accent bg-surface p-5 text-sm sm:p-6">
      <h2 id="bayar" className="text-xl">
        {state.stage === "PAY_REMAINING" ? "Pelunasan" : "Lakukan Pembayaran"}
      </h2>

      {state.stage === "CASH_AT_PICKUP" ? <p>Bayar penuh {formatRupiah(state.amountDue)} secara tunai saat mengambil pesanan.</p> : null}

      {state.stage === "VERIFYING" ? <p role="status">Bukti pembayaran sedang diverifikasi admin. Kami akan memperbarui status setelah diperiksa.</p> : null}

      {state.stage === "PAY_INITIAL" && state.method === "QRIS" ? <QrisBlock state={state} qrDataUrl={qrDataUrl} requestQris={requestQris} simulate={simulate} /> : null}
      {state.stage === "PAY_INITIAL" && state.method === "BANK_TRANSFER" ? <TransferBlock state={state} /> : null}

      {state.stage === "PAY_REMAINING" ? (
        <>
          <p>
            Sisa pembayaran <strong>{formatRupiah(state.amountDue)}</strong> wajib dilunasi sebelum pesanan dapat diselesaikan. Pilih metode pelunasan:
          </p>
          <div role="group" aria-label="Metode pelunasan" className="flex flex-wrap gap-2">
            <Button type="button" variant={remainingMethod === "QRIS" ? "primary" : "secondary"} aria-pressed={remainingMethod === "QRIS"} onClick={() => setRemainingMethod("QRIS")}>
              QRIS
            </Button>
            <Button
              type="button"
              variant={remainingMethod === "BANK_TRANSFER" ? "primary" : "secondary"}
              aria-pressed={remainingMethod === "BANK_TRANSFER"}
              disabled={pending}
              onClick={() => {
                setRemainingMethod("BANK_TRANSFER");
                if (!state.pendingTransfer)
                  start(async () => {
                    setMessage(null);
                    const result = await startTransferRemaining();
                    if (!result.ok && result.message) setMessage(result.message);
                    router.refresh();
                  });
              }}
            >
              Transfer Bank
            </Button>
          </div>
          {message ? (
            <p role="alert" className="rounded-control border border-danger bg-background px-4 py-3 font-medium text-danger">
              {message}
            </p>
          ) : null}
          {remainingMethod === "QRIS" ? <QrisBlock state={state} qrDataUrl={qrDataUrl} requestQris={requestQris} simulate={simulate} /> : null}
          {remainingMethod === "BANK_TRANSFER" ? <TransferBlock state={state} /> : null}
        </>
      ) : null}
    </section>
  );
}
