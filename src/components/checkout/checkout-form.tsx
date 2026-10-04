"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import type { pickupAvailabilityAction, placeOrderAction, previewCheckoutAction } from "@/app/(public)/_actions/checkout";
import { saveLastOrder, type LastOrder } from "@/lib/orders/last-order";
import {
  CASH_UNAVAILABLE_REASON,
  PAYMENT_METHOD_LABEL,
  PAYMENT_OPTION_LABEL,
  PICKUP_REASON_LABEL,
  type PickupReasonCode,
} from "@/lib/copy/checkout";
import { cartLinesForServer, useCartStore } from "@/lib/cart/store";
import { formatRupiah } from "@/lib/format/rupiah";
import { randomUuid } from "@/lib/random-uuid";
import { CUSTOMER_NAME_MAX, NOTES_MAX } from "@/lib/validation/checkout";

import { TextField } from "../ui/text-field";
import { formatIsoDateLong, PickupDatePicker, type DateStatus } from "./pickup-date-picker";

type Availability = Awaited<ReturnType<typeof pickupAvailabilityAction>>;
type Preview = Awaited<ReturnType<typeof previewCheckoutAction>>;
type Method = keyof typeof PAYMENT_METHOD_LABEL;
type Option = keyof typeof PAYMENT_OPTION_LABEL;

export function CheckoutForm({
  loadAvailability,
  preview,
  placeOrder,
  pickupInfo,
}: {
  loadAvailability: typeof pickupAvailabilityAction;
  preview: typeof previewCheckoutAction;
  placeOrder: typeof placeOrderAction;
  pickupInfo: { address: string | null; pickupHours: string | null; pickupInstructions: string | null };
}) {
  const { items, hydrated, clear } = useCartStore();
  const router = useRouter();
  const formId = useId();
  // One key per checkout attempt: a double click or retry can never create two orders (TD-15).
  const [idempotencyKey] = useState(randomUuid);
  const placedRef = useRef<LastOrder | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [placing, startPlacing] = useTransition();
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [notes, setNotes] = useState("");
  const [pickupDate, setPickupDate] = useState<string | null>(null);
  const [dateMessage, setDateMessage] = useState<string | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [option, setOption] = useState<Option>("FULL");
  const [result, setResult] = useState<Preview | null>(null);
  const [pending, startTransition] = useTransition();
  // Bumped when the server rejects the chosen date, so the calendar shows current availability.
  const [availabilityVersion, setAvailabilityVersion] = useState(0);
  const linesKey = JSON.stringify(cartLinesForServer(items));
  // Current product data from the server wins over the cart's snapshot (a product may have become Pre-Order).
  const hasPreorder = availability?.hasPreorder ?? items.some((i) => i.productType === "PRE_ORDER");

  useEffect(() => {
    if (!hydrated || items.length === 0) return;
    let cancelled = false;
    void loadAvailability(JSON.parse(linesKey)).then((a) => {
      if (cancelled) return;
      setAvailability(a);
      setPickupDate((current) => (current && a.dates.some((d) => d.date === current && d.available) ? current : null));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when cart contents change or the server rejects the date
  }, [hydrated, linesKey, availabilityVersion]);

  /** The server's verdict wins: drop the rejected date so it cannot be submitted again unnoticed. */
  const rejectPickupDate = (iso: string | null, reason: PickupReasonCode) => {
    setPickupDate(null);
    setDateMessage(iso ? `${formatIsoDateLong(iso)}: ${PICKUP_REASON_LABEL[reason]}.` : `${PICKUP_REASON_LABEL[reason]}.`);
    setAvailabilityVersion((v) => v + 1);
  };

  // Cash is unavailable with Pre-Order (FD-40) and always full payment (FD-39).
  const effectiveMethod: Method | null = hasPreorder && method === "CASH" ? null : method;
  const effectiveOption: Option = effectiveMethod === "CASH" ? "FULL" : option;

  if (!hydrated) return <div className="h-64 animate-pulse rounded-card bg-surface" aria-busy="true" aria-label="Memuat checkout" />;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-card bg-surface p-10 text-center">
        <p className="text-lg">Keranjangmu masih kosong.</p>
        <Link href="/produk" className="inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground">
          Lihat Produk
        </Link>
      </div>
    );
  }

  const fieldErrors = result && !result.ok ? result.fieldErrors : {};
  const summary = result && result.ok ? result.summary : null;

  const currentInput = () => ({
    items: JSON.parse(linesKey),
    customerName,
    whatsapp,
    notes,
    pickupDate: pickupDate ?? "",
    paymentMethod: effectiveMethod ?? "",
    paymentOption: effectiveOption,
  });

  const createOrder = () => {
    setPlaceError(null);
    startPlacing(async () => {
      const outcome = await placeOrder(currentInput(), idempotencyKey);
      if (outcome.ok) {
        const order = outcome.order;
        // A replay carries no token; reuse the first response kept in memory.
        const placed: LastOrder | null = order.trackingToken
          ? {
              orderNumber: order.orderNumber,
              trackingToken: order.trackingToken,
              pickupDate: order.pickupDate,
              paymentMethod: order.paymentMethod,
              paymentOption: order.paymentOption,
              payment: order.payment,
              reservationExpiresAt: order.reservationExpiresAt,
            }
          : placedRef.current;
        if (!placed) {
          setPlaceError(`Pesanan ${order.orderNumber} sudah dibuat. Hubungi kami via WhatsApp untuk mendapatkan kode akses.`);
          return;
        }
        placedRef.current = placed;
        saveLastOrder(placed);
        clear();
        router.push("/pesanan/sukses");
        return;
      }
      if (outcome.code === "RATE_LIMITED") {
        setPlaceError("Terlalu banyak percobaan. Silakan coba lagi dalam beberapa menit.");
        return;
      }
      if (outcome.code === "INVALID_INPUT") {
        setPlaceError(outcome.fieldErrors.form ?? "Terjadi masalah. Silakan coba lagi.");
        return;
      }
      // Something changed since the preview (e.g. the date filled up): back to the form.
      setResult({ ok: false, fieldErrors: outcome.fieldErrors, cartIssues: outcome.cartIssues as never, pickupReason: outcome.pickupReason });
      if (outcome.pickupReason) rejectPickupDate(pickupDate, outcome.pickupReason);
    });
  };

  const submit = () => {
    startTransition(async () => {
      const outcome = await preview(currentInput());
      setResult(outcome);
      if (!outcome.ok) {
        const firstField = Object.keys(outcome.fieldErrors)[0];
        if (firstField) document.getElementById(`${formId}-${firstField}`)?.focus();
        if (outcome.pickupReason) rejectPickupDate(pickupDate, outcome.pickupReason);
      }
    });
  };

  if (summary) {
    return (
      <section aria-labelledby={`${formId}-confirm`} className="mx-auto flex max-w-2xl flex-col gap-5 rounded-card bg-surface p-5 sm:p-8">
        <h2 id={`${formId}-confirm`} tabIndex={-1} className="text-3xl" ref={(el) => el?.focus()}>
          Konfirmasi Pesanan
        </h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="font-semibold">Nama</dt>
          <dd>{summary.customerName}</dd>
          <dt className="font-semibold">WhatsApp</dt>
          <dd>{summary.whatsapp}</dd>
          <dt className="font-semibold">Tanggal pickup</dt>
          <dd>{formatIsoDateLong(summary.pickupDate)}</dd>
          <dt className="font-semibold">Pembayaran</dt>
          <dd>
            {PAYMENT_METHOD_LABEL[summary.paymentMethod]} · {PAYMENT_OPTION_LABEL[summary.paymentOption]}
          </dd>
          {summary.notes ? (
            <>
              <dt className="font-semibold">Catatan</dt>
              <dd className="whitespace-pre-line">{summary.notes}</dd>
            </>
          ) : null}
        </dl>
        <OrderLines summary={summary} />
        <p className="text-sm text-muted-foreground">
          Ringkasan ini dihitung ulang oleh sistem dari harga terbaru. Dengan menekan &ldquo;Buat Pesanan&rdquo;, slot tanggal pickup akan dipesan untukmu.
        </p>
        {placeError ? (
          <p role="alert" className="rounded-control border border-danger bg-surface p-3 text-sm font-medium text-danger">
            {placeError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setResult(null)}
            disabled={placing}
            className="min-h-12 rounded-full border-2 border-primary px-6 font-semibold text-primary disabled:opacity-60"
          >
            Ubah Data
          </button>
          <button
            type="button"
            onClick={createOrder}
            disabled={placing}
            aria-busy={placing}
            className="min-h-12 rounded-full bg-primary px-6 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {placing ? "Membuat pesanan…" : "Buat Pesanan"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="grid gap-8 lg:grid-cols-[1fr_22rem]"
    >
      <div className="flex flex-col gap-8">
        {result && !result.ok && result.cartIssues?.length ? (
          <p role="alert" className="rounded-control border border-danger bg-surface p-3 text-sm font-medium text-danger">
            Ada produk di keranjang yang perlu diperiksa. <Link href="/keranjang" className="underline">Buka keranjang</Link>
          </p>
        ) : null}

        <fieldset className="rounded-card bg-surface p-5 [&>*+*]:mt-4 [&>legend+*]:clear-both">
          <legend className="float-left mb-2 w-full font-heading text-2xl">Data Pemesan</legend>
          <TextField
            id={`${formId}-customerName`}
            label="Nama"
            name="customerName"
            autoComplete="name"
            maxLength={CUSTOMER_NAME_MAX}
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            error={fieldErrors.customerName}
            required
          />
          <TextField
            id={`${formId}-whatsapp`}
            label="Nomor WhatsApp"
            name="whatsapp"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            hint="Contoh: 0812xxxxxxxx"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            error={fieldErrors.whatsapp}
            required
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${formId}-notes`} className="font-semibold">
              Catatan <span className="font-normal text-muted-foreground">(opsional)</span>
            </label>
            <textarea
              id={`${formId}-notes`}
              name="notes"
              rows={3}
              maxLength={NOTES_MAX}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              aria-invalid={fieldErrors.notes ? true : undefined}
              className="rounded-control border border-muted-foreground bg-surface px-3 py-2 text-base"
            />
            {fieldErrors.notes ? <p className="text-sm font-medium text-danger">{fieldErrors.notes}</p> : null}
          </div>
        </fieldset>

        <fieldset className="rounded-card bg-surface p-5 [&>*+*]:mt-4 [&>legend+*]:clear-both">
          <legend className="float-left mb-2 w-full font-heading text-2xl">Tanggal Pickup</legend>
          <p className="text-sm text-muted-foreground">
            Pilih tanggal pengambilan. Pesanan setelah pukul {availability?.cutoff ?? "—"} WIB dihitung sebagai pesanan hari berikutnya.
          </p>
          {pickupInfo.pickupHours ? <p className="text-sm">Jam pickup: {pickupInfo.pickupHours}</p> : null}
          {pickupInfo.address ? <p className="text-sm">Alamat pickup: {pickupInfo.address}</p> : null}
          {pickupInfo.pickupInstructions ? <p className="text-sm text-muted-foreground">{pickupInfo.pickupInstructions}</p> : null}
          {availability ? (
            <PickupDatePicker
              statuses={availability.dates as DateStatus[]}
              selected={pickupDate}
              onSelect={(iso) => {
                setPickupDate(iso);
                setDateMessage(null);
              }}
              onUnavailable={(iso, reason: PickupReasonCode) => {
                // Choosing an unavailable date replaces any earlier choice: nothing stays selected
                // behind the error, so the customer can never continue with a date they did not intend.
                setPickupDate(null);
                setDateMessage(`${formatIsoDateLong(iso)}: ${PICKUP_REASON_LABEL[reason]}.`);
              }}
            />
          ) : (
            <div className="h-72 animate-pulse rounded-control bg-surface-muted" aria-busy="true" aria-label="Memuat tanggal" />
          )}
          <div aria-live="polite" className="flex flex-col gap-1 text-sm">
            {pickupDate ? (
              <p className="font-semibold" id={`${formId}-pickupDate`} tabIndex={-1}>
                Tanggal dipilih: {formatIsoDateLong(pickupDate)}
              </p>
            ) : (
              <p id={`${formId}-pickupDate`} tabIndex={-1} className={fieldErrors.pickupDate ? "font-medium text-danger" : "text-muted-foreground"}>
                {fieldErrors.pickupDate ?? "Belum ada tanggal dipilih."}
              </p>
            )}
            {dateMessage ? <p className="font-medium text-danger">{dateMessage}</p> : null}
          </div>
          <p className="text-xs text-muted-foreground">Tanggal bergaris tidak tersedia. Pilih tanggal tersebut untuk melihat alasannya.</p>
        </fieldset>

        <fieldset className="rounded-card bg-surface p-5 [&>*+*]:mt-4 [&>legend+*]:clear-both">
          <legend className="float-left mb-2 w-full font-heading text-2xl">Pembayaran</legend>
          <div role="radiogroup" aria-labelledby={`${formId}-method-label`} className="flex flex-col gap-2">
            <p id={`${formId}-method-label`} className="font-semibold">
              Metode pembayaran
            </p>
            {(Object.keys(PAYMENT_METHOD_LABEL) as Method[]).map((m) => {
              const disabled = m === "CASH" && hasPreorder;
              return (
                <label key={m} className={`flex min-h-12 items-start gap-3 rounded-control border p-3 ${effectiveMethod === m ? "border-primary bg-surface-muted" : "border-border"} ${disabled ? "opacity-70" : "cursor-pointer"}`}>
                  <input
                    id={m === "QRIS" ? `${formId}-paymentMethod` : undefined}
                    type="radio"
                    name="paymentMethod"
                    value={m}
                    checked={effectiveMethod === m}
                    disabled={disabled}
                    aria-describedby={disabled ? `${formId}-cash-reason` : undefined}
                    onChange={() => setMethod(m)}
                    className="mt-1 h-5 w-5 accent-[var(--color-primary)]"
                  />
                  <span className="flex flex-col">
                    <span className="font-medium">{PAYMENT_METHOD_LABEL[m]}</span>
                    {disabled ? (
                      <span id={`${formId}-cash-reason`} className="text-sm text-muted-foreground">
                        {CASH_UNAVAILABLE_REASON}
                      </span>
                    ) : m === "CASH" ? (
                      <span className="text-sm text-muted-foreground">Bayar penuh saat pengambilan.</span>
                    ) : null}
                  </span>
                </label>
              );
            })}
            {fieldErrors.paymentMethod ? <p className="text-sm font-medium text-danger">{fieldErrors.paymentMethod}</p> : null}
          </div>

          {effectiveMethod && effectiveMethod !== "CASH" ? (
            <div role="radiogroup" aria-labelledby={`${formId}-option-label`} className="flex flex-col gap-2">
              <p id={`${formId}-option-label`} className="font-semibold">
                Opsi pembayaran
              </p>
              {(Object.keys(PAYMENT_OPTION_LABEL) as Option[]).map((o) => (
                <label key={o} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-control border p-3 ${option === o ? "border-primary bg-surface-muted" : "border-border"}`}>
                  <input
                    id={o === "DP_50" ? `${formId}-paymentOption` : undefined}
                    type="radio"
                    name="paymentOption"
                    value={o}
                    checked={option === o}
                    onChange={() => setOption(o)}
                    className="h-5 w-5 accent-[var(--color-primary)]"
                  />
                  <span className="font-medium">{PAYMENT_OPTION_LABEL[o]}</span>
                </label>
              ))}
              {fieldErrors.paymentOption ? <p className="text-sm font-medium text-danger">{fieldErrors.paymentOption}</p> : null}
            </div>
          ) : null}
        </fieldset>
      </div>

      <aside className="flex h-fit flex-col gap-4 rounded-card bg-surface p-5 lg:sticky lg:top-24" aria-labelledby={`${formId}-summary`}>
        <h2 id={`${formId}-summary`} className="text-2xl">
          Ringkasan Pesanan
        </h2>
        <ul className="flex flex-col gap-2 text-sm">
          {items.map((i) => (
            <li key={i.productId} className="flex justify-between gap-3">
              <span>
                {i.name} × {i.quantity}
              </span>
              <span className="whitespace-nowrap">{formatRupiah(i.unitPrice * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">Total, DP, dan sisa pembayaran dihitung ulang oleh sistem saat kamu lanjut.</p>
        {result && !result.ok ? (
          <p role="alert" className="text-sm font-medium text-danger">
            Periksa kembali isian yang ditandai.
          </p>
        ) : null}
        <button type="submit" disabled={pending} className="min-h-12 rounded-full bg-primary px-6 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
          {pending ? "Memeriksa…" : "Lanjut ke Konfirmasi"}
        </button>
      </aside>
    </form>
  );
}

function OrderLines({ summary }: { summary: Extract<Preview, { ok: true }>["summary"] }) {
  const { payment } = summary;
  return (
    <div className="flex flex-col gap-3">
      <table className="w-full text-sm">
        <caption className="sr-only">Produk yang dipesan</caption>
        <thead>
          <tr className="border-b border-border text-left">
            <th scope="col" className="py-2">Produk</th>
            <th scope="col" className="py-2 text-right">Jumlah</th>
            <th scope="col" className="py-2 text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {summary.lines.map((line) => (
            <tr key={line.productId} className="border-b border-border/60">
              <td className="py-2">
                {line.name}
                <span className="block text-xs text-muted-foreground">{formatRupiah(line.effectiveUnitPrice)} / item</span>
              </td>
              <td className="py-2 text-right">{line.quantity}</td>
              <td className="py-2 text-right">{formatRupiah(line.lineSubtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="flex flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd>{formatRupiah(summary.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Diskon</dt>
          <dd>{summary.discountTotal > 0 ? `-${formatRupiah(summary.discountTotal)}` : formatRupiah(0)}</dd>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <dt>Total Pesanan</dt>
          <dd>{formatRupiah(payment.total)}</dd>
        </div>
        {payment.dpAmount !== null ? (
          <>
            <div className="flex justify-between">
              <dt>DP 50%</dt>
              <dd>{formatRupiah(payment.dpAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Sisa Pembayaran</dt>
              <dd>{formatRupiah(payment.remaining)}</dd>
            </div>
          </>
        ) : null}
        <div className="mt-1 flex justify-between rounded-control bg-surface-muted p-2 font-semibold">
          <dt>{summary.paymentMethod === "CASH" ? "Dibayar saat pickup" : "Dibayar sekarang"}</dt>
          <dd>{formatRupiah(payment.dueNow)}</dd>
        </div>
      </dl>
    </div>
  );
}
