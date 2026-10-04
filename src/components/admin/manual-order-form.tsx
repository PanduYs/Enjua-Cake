"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import type { capacityForDateAction, placeManualOrderAction } from "@/app/admin/(protected)/pesanan/baru/actions";
import { CopyButton } from "@/components/orders/copy-button";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { describeOverride, MANUAL_DATE_BLOCKER, OVERRIDE_LABEL } from "@/lib/copy/admin";
import { CART_ISSUE_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_OPTION_LABEL } from "@/lib/copy/checkout";
import { PRODUCT_TYPE_LABEL, SOLD_OUT_LABEL } from "@/lib/format/labels";
import { formatRupiah } from "@/lib/format/rupiah";
import { randomUuid } from "@/lib/random-uuid";
import { CUSTOMER_NAME_MAX, NOTES_MAX } from "@/lib/validation/checkout";

import { SelectField, TextAreaField } from "./fields";

type Result = Awaited<ReturnType<typeof placeManualOrderAction>>;
type Override = keyof typeof OVERRIDE_LABEL;

export interface ManualOrderProduct {
  id: string;
  name: string;
  price: number;
  productType: "READY_STOCK" | "PRE_ORDER";
  minimumPreorderDays: number | null;
  soldOut: boolean;
  maxQuantityPerOrder: number | null;
}

/**
 * Manual Order form (Design §20): same validation and messages as checkout; the four
 * overridable rules (FD-119) are offered only after they fail, each with a required reason.
 */
export function ManualOrderForm({
  products,
  placeOrder,
  loadCapacity,
}: {
  products: ManualOrderProduct[];
  placeOrder: typeof placeManualOrderAction;
  loadCapacity: typeof capacityForDateAction;
}) {
  const [idempotencyKey, setIdempotencyKey] = useState(randomUuid);
  const [lines, setLines] = useState<Array<{ productId: string; quantity: string }>>([{ productId: "", quantity: "1" }]);
  const [customerName, setCustomerName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [notes, setNotes] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"QRIS" | "BANK_TRANSFER" | "CASH" | "">("");
  const [paymentOption, setPaymentOption] = useState<"DP_50" | "FULL">("FULL");
  const [capacity, setCapacity] = useState<Awaited<ReturnType<typeof capacityForDateAction>>>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [overrideReasons, setOverrideReasons] = useState<Partial<Record<Override, string>>>({});
  const [overrideChecked, setOverrideChecked] = useState<Partial<Record<Override, boolean>>>({});
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) return;
    let cancelled = false;
    void loadCapacity(pickupDate).then((c) => {
      if (!cancelled) setCapacity(c);
    });
    return () => {
      cancelled = true;
    };
  }, [pickupDate, loadCapacity]);

  const byId = new Map(products.map((p) => [p.id, p]));
  const hasPreorder = lines.some((l) => byId.get(l.productId)?.productType === "PRE_ORDER");
  const errors = result && !result.ok && "fieldErrors" in result ? result.fieldErrors : {};
  const cartIssues = result && !result.ok && "cartIssues" in result ? (result.cartIssues ?? []) : [];

  if (result?.ok) {
    const order = result.order;
    return (
      <section aria-labelledby="manual-done" className="flex flex-col gap-4 rounded-card bg-surface p-5">
        <h2 id="manual-done" className="text-2xl" role="status">
          Manual Order tersimpan.
        </h2>
        <p>
          Nomor pesanan: <strong className="font-mono" data-testid="manual-order-number">{order.orderNumber}</strong>
        </p>
        <CopyButton value={order.orderNumber} label="Salin nomor pesanan" />
        {order.trackingToken ? (
          <div className="flex flex-col gap-2 rounded-control border-2 border-accent p-3">
            <p className="font-semibold">Kode akses tracking (hanya ditampilkan sekali)</p>
            <p className="font-mono break-all" data-testid="manual-order-token">
              {order.trackingToken}
            </p>
            <CopyButton value={order.trackingToken} label="Salin kode akses" />
            <p className="text-sm text-muted-foreground">Sampaikan nomor pesanan dan kode akses ke customer secara manual.</p>
          </div>
        ) : null}
        <p className="text-sm">
          Pembayaran: {PAYMENT_METHOD_LABEL[order.paymentMethod]} · {PAYMENT_OPTION_LABEL[order.paymentOption]} · dibayar sekarang {formatRupiah(order.payment.dueNow)}. Pembayaran mengikuti alur biasa
          (QRIS melalui halaman lacak, bukti transfer, atau Cash saat pickup).
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/pesanan/${order.orderId}`} className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 font-semibold text-primary-foreground">
            Buka Detail Pesanan
          </Link>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setResult(null);
              setIdempotencyKey(randomUuid());
              setLines([{ productId: "", quantity: "1" }]);
              setCustomerName("");
              setWhatsapp("");
              setNotes("");
              setOverrideChecked({});
              setOverrideReasons({});
            }}
          >
            Buat Manual Order Lain
          </Button>
        </div>
      </section>
    );
  }

  const submit = () => {
    start(async () => {
      const overrides = (Object.keys(overrideChecked) as Override[]).filter((t) => overrideChecked[t]).map((type) => ({ type, reason: overrideReasons[type] ?? "" }));
      const outcome = await placeOrder(
        {
          items: lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })),
          customerName,
          whatsapp,
          notes,
          pickupDate,
          paymentMethod,
          paymentOption: paymentMethod === "CASH" ? "FULL" : paymentOption,
        },
        idempotencyKey,
        overrides,
      );
      setResult(outcome);
    });
  };

  const required = result && !result.ok && result.code === "OVERRIDE_REQUIRED" ? result.required : [];

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-6"
    >
      <fieldset className="flex flex-col gap-4 rounded-card bg-surface p-5">
        <legend className="float-left mb-2 w-full font-heading text-xl">Customer</legend>
        <div className="clear-both grid gap-4 sm:grid-cols-2">
          <TextField label="Nama" name="customerName" value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={CUSTOMER_NAME_MAX} error={errors.customerName} />
          <TextField label="Nomor WhatsApp" name="whatsapp" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} error={errors.whatsapp} />
        </div>
        <TextAreaField label="Catatan (opsional)" name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={NOTES_MAX} rows={2} error={errors.notes} />
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-card bg-surface p-5">
        <legend className="float-left mb-2 w-full font-heading text-xl">Produk</legend>
        <div className="clear-both flex flex-col gap-3">
          {lines.map((line, index) => {
            const product = byId.get(line.productId);
            const issue = cartIssues.find((c) => c.productId === line.productId);
            return (
              <div key={index} className="grid gap-3 rounded-control border border-border p-3 sm:grid-cols-[1fr_7rem_auto] sm:items-end">
                <SelectField
                  label={`Produk ${index + 1}`}
                  name={`product-${index}`}
                  id={`product-${index}`}
                  value={line.productId}
                  onChange={(e) => setLines(lines.map((l, i) => (i === index ? { ...l, productId: e.target.value } : l)))}
                  error={issue ? CART_ISSUE_LABEL[issue.issue as keyof typeof CART_ISSUE_LABEL] : undefined}
                >
                  <option value="">Pilih produk</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {formatRupiah(p.price)} · {PRODUCT_TYPE_LABEL[p.productType]}
                      {p.soldOut ? ` · ${SOLD_OUT_LABEL}` : ""}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  label="Jumlah"
                  name={`qty-${index}`}
                  id={`qty-${index}`}
                  inputMode="numeric"
                  value={line.quantity}
                  onChange={(e) => setLines(lines.map((l, i) => (i === index ? { ...l, quantity: e.target.value.replace(/\D/g, "") } : l)))}
                  hint={product?.maxQuantityPerOrder ? `Maks. ${product.maxQuantityPerOrder}` : undefined}
                />
                <Button type="button" variant="secondary" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, i) => i !== index))}>
                  Hapus
                </Button>
              </div>
            );
          })}
          {errors.items ? <p className="text-sm font-medium text-danger">{errors.items}</p> : null}
          <Button type="button" variant="secondary" className="self-start" onClick={() => setLines([...lines, { productId: "", quantity: "1" }])}>
            Tambah Produk
          </Button>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-card bg-surface p-5">
        <legend className="float-left mb-2 w-full font-heading text-xl">Pickup & Pembayaran</legend>
        <div className="clear-both grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <TextField label="Tanggal pickup" name="pickupDate" type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} error={errors.pickupDate} />
            {capacity && capacity.date === pickupDate ? (
              <p className="text-sm" role="status" data-testid="manual-capacity">
                {capacity.isBlocked ? "Tanggal diblokir." : `Kapasitas ${capacity.capacity}, terisi ${capacity.used}, sisa ${capacity.remaining}.`}
              </p>
            ) : null}
          </div>
          <SelectField
            label="Metode pembayaran"
            name="paymentMethod"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
            error={errors.paymentMethod}
            hint={hasPreorder ? "Cash tidak tersedia untuk pesanan yang berisi Pre-Order." : undefined}
          >
            <option value="">Pilih metode</option>
            <option value="QRIS">{PAYMENT_METHOD_LABEL.QRIS}</option>
            <option value="BANK_TRANSFER">{PAYMENT_METHOD_LABEL.BANK_TRANSFER}</option>
            <option value="CASH" disabled={hasPreorder}>
              {PAYMENT_METHOD_LABEL.CASH}
            </option>
          </SelectField>
          {paymentMethod && paymentMethod !== "CASH" ? (
            <SelectField label="Opsi pembayaran" name="paymentOption" value={paymentOption} onChange={(e) => setPaymentOption(e.target.value as typeof paymentOption)} error={errors.paymentOption}>
              <option value="FULL">{PAYMENT_OPTION_LABEL.FULL}</option>
              <option value="DP_50">{PAYMENT_OPTION_LABEL.DP_50}</option>
            </SelectField>
          ) : null}
        </div>
      </fieldset>

      {result && !result.ok && result.code === "DATE_NOT_ALLOWED" ? (
        <p role="alert" className="rounded-control border border-danger bg-surface px-4 py-3 text-sm font-medium text-danger">
          {MANUAL_DATE_BLOCKER[result.blocker]}
        </p>
      ) : null}
      {errors.form ? (
        <p role="alert" className="rounded-control border border-danger bg-surface px-4 py-3 text-sm font-medium text-danger">
          {errors.form}
        </p>
      ) : null}

      {required.length > 0 ? (
        <fieldset className="flex flex-col gap-4 rounded-card border-2 border-danger bg-surface p-5" aria-describedby="override-help">
          <legend className="float-left mb-2 w-full font-heading text-xl">Perlu Override</legend>
          <p id="override-help" className="clear-both text-sm" role="alert">
            Tanggal pickup tidak memenuhi aturan berikut. Centang override hanya bila memang diperlukan dan isi alasannya. Override dicatat di audit log.
          </p>
          {required.map((r) => (
            <div key={r.type} className="flex flex-col gap-2 rounded-control border border-border p-3">
              <label className="flex min-h-11 items-center gap-3 font-semibold">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-primary"
                  checked={overrideChecked[r.type] ?? false}
                  onChange={(e) => setOverrideChecked({ ...overrideChecked, [r.type]: e.target.checked })}
                />
                Override {OVERRIDE_LABEL[r.type]}
              </label>
              <p className="text-sm text-muted-foreground">{describeOverride(r.type, r.before, r.after)}</p>
              {overrideChecked[r.type] ? (
                <TextAreaField
                  label={`Alasan override ${OVERRIDE_LABEL[r.type]}`}
                  name={`reason-${r.type}`}
                  id={`reason-${r.type}`}
                  rows={2}
                  maxLength={500}
                  value={overrideReasons[r.type] ?? ""}
                  onChange={(e) => setOverrideReasons({ ...overrideReasons, [r.type]: e.target.value })}
                  error={overrideReasons[r.type]?.trim() ? undefined : "Alasan wajib diisi."}
                />
              ) : null}
            </div>
          ))}
        </fieldset>
      ) : null}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Menyimpan…" : "Simpan Manual Order"}
      </Button>
    </form>
  );
}
