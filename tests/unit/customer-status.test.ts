import { describe, expect, it } from "vitest";

import { customerProgress, customerStatus, type CustomerStatusInput } from "@/lib/orders/customer-status";

const base: CustomerStatusInput = {
  orderStatus: "NEW",
  paymentStatus: "WAITING_PAYMENT",
  paymentMethod: "QRIS",
  paymentOption: "FULL",
  grandTotal: 225_000,
  dpAmount: null,
  paidAmount: 0,
  remainingAmount: 225_000,
  cancellation: null,
};
const s = (over: Partial<CustomerStatusInput>) => customerStatus({ ...base, ...over });
const states = (over: Partial<CustomerStatusInput>) => customerProgress({ ...base, ...over })!.map((p) => `${p.state}:${p.label}`);

describe("order created ≠ payment completed", () => {
  it("A. QRIS full, unpaid: order recorded, payment waiting, not processed yet, pay action", () => {
    const r = s({});
    expect(r.order.label).toBe("Sudah Tercatat");
    expect(r.payment).toMatchObject({ label: "Menunggu Pembayaran", tone: "waiting" });
    expect(r.payment.message).toContain("QRIS agar pesanan dapat diproses");
    expect(r.processing.label).toBe("Menunggu Pembayaran");
    expect(r.headline).toBe("Pesanan kamu sudah tercatat, tetapi belum dapat diproses sampai pembayaran dikonfirmasi.");
    expect(r.action).toBe("PAY_QRIS");
    expect(JSON.stringify(r)).not.toMatch(/Berhasil|Lunas/);
  });

  it("B. QRIS full, paid (webhook confirmed): payment successful, no 'belum bayar' anywhere", () => {
    const r = s({ orderStatus: "CONFIRMED", paymentStatus: "PAID", paidAmount: 225_000, remainingAmount: 0 });
    expect(r.payment).toMatchObject({ label: "Pembayaran Berhasil", tone: "success", message: "Total dibayar Rp225.000." });
    expect(r.processing.label).toBe("Dikonfirmasi");
    expect(r.action).toBeNull();
    expect(JSON.stringify(r)).not.toMatch(/Menunggu Pembayaran|belum/i);
  });

  it("C. Bank transfer, proof uploaded: waiting verification, never 'berhasil'", () => {
    const r = s({ paymentMethod: "BANK_TRANSFER", paymentStatus: "WAITING_VERIFICATION" });
    expect(r.payment).toMatchObject({ label: "Menunggu Verifikasi", message: "Bukti pembayaran sudah diterima dan sedang diperiksa oleh admin." });
    expect(r.processing.label).toBe("Menunggu Verifikasi Pembayaran");
    expect(JSON.stringify(r)).not.toMatch(/Berhasil/);
  });

  it("C'. Bank transfer, not yet paid: transfer instructions, pay action", () => {
    const r = s({ paymentMethod: "BANK_TRANSFER" });
    expect(r.payment.message).toBe("Silakan transfer sesuai rekening pembayaran. Setelah pembayaran dikonfirmasi, pesanan akan diproses.");
    expect(r.action).toBe("PAY_TRANSFER");
  });

  it("D. Cash: pay at pickup, no online payment requested", () => {
    const r = s({ paymentMethod: "CASH", paymentStatus: "UNPAID" });
    expect(r.payment).toMatchObject({ label: "Bayar Saat Pengambilan", message: "Pembayaran dilakukan secara tunai saat pengambilan." });
    expect(r.processing.label).toBe("Menunggu Konfirmasi Toko");
    expect(r.action).toBe("PAY_AT_PICKUP");
    expect(JSON.stringify(r)).not.toMatch(/Menunggu Pembayaran|QRIS|transfer/);
    expect(states({ paymentMethod: "CASH", paymentStatus: "UNPAID", orderStatus: "READY_FOR_PICKUP" })).toEqual([
      "done:Pesanan dibuat",
      "done:Dikonfirmasi toko",
      "done:Pesanan diproses",
      "current:Siap diambil",
      "todo:Selesai",
    ]);
    expect(customerProgress({ ...base, paymentMethod: "CASH", paymentStatus: "UNPAID", orderStatus: "READY_FOR_PICKUP" })![3]!.note).toBe("Bayar tunai saat pengambilan");
  });

  it("E. QRIS DP 50%, unpaid: waiting for the DP", () => {
    const r = s({ paymentOption: "DP_50", dpAmount: 112_500 });
    expect(r.payment).toMatchObject({ label: "Menunggu Pembayaran DP", message: "Silakan selesaikan pembayaran DP melalui QRIS agar pesanan dapat diproses." });
    expect(states({ paymentOption: "DP_50", dpAmount: 112_500 })[1]).toBe("current:Menunggu pembayaran DP");
  });

  it("F. QRIS DP 50%, DP paid: partially paid with the remaining amount", () => {
    const r = s({ orderStatus: "CONFIRMED", paymentStatus: "PARTIALLY_PAID", paymentOption: "DP_50", dpAmount: 112_500, paidAmount: 112_500, remainingAmount: 112_500 });
    expect(r.payment).toMatchObject({ label: "DP Dibayar", tone: "success" });
    expect(r.payment.message).toBe("DP Rp112.500 sudah diterima. Sisa Rp112.500 perlu dilunasi sebelum pesanan diambil.");
    expect(r.action).toBe("PAY_REMAINING");
    const progress = customerProgress({ ...base, orderStatus: "CONFIRMED", paymentStatus: "PARTIALLY_PAID", paymentOption: "DP_50", dpAmount: 112_500, paidAmount: 112_500, remainingAmount: 112_500 })!;
    expect(progress.map((p) => `${p.state}:${p.label}`)).toEqual([
      "done:Pesanan dibuat",
      "done:Pembayaran DP dikonfirmasi",
      "current:Menunggu diproses",
      "todo:Siap diambil",
      "todo:Selesai",
    ]);
    expect(progress[3]!.note).toBe("Lunasi sisa Rp112.500 sebelum diambil");
  });

  it("G. payment failed: failed + retry, order not cancelled", () => {
    const r = s({ paymentStatus: "FAILED" });
    expect(r.payment).toMatchObject({ label: "Pembayaran Gagal", tone: "danger", message: "Pembayaran belum berhasil. Silakan coba kembali." });
    expect(r.order.label).toBe("Sudah Tercatat");
    expect(r.action).toBe("RETRY_PAYMENT");
    expect(states({ paymentStatus: "FAILED" })[1]).toBe("current:Pembayaran gagal, silakan coba lagi");
  });

  it("H. payment expired: order cancelled by the system; a new order is the way forward (FD-118)", () => {
    const r = s({ orderStatus: "CANCELLED", paymentStatus: "EXPIRED", cancellation: "PAYMENT_EXPIRED" });
    expect(r.payment).toMatchObject({ label: "Pembayaran Kedaluwarsa" });
    expect(r.payment.message).toContain("sudah tidak berlaku");
    expect(r.processing).toMatchObject({ label: "Dibatalkan", message: "Batas waktu pembayaran habis, pesanan dibatalkan otomatis." });
    expect(r.action).toBe("NEW_ORDER");
    expect(customerProgress({ ...base, orderStatus: "CANCELLED", paymentStatus: "EXPIRED", cancellation: "PAYMENT_EXPIRED" })).toBeNull();
  });

  it("refunds show the refunded amount when known", () => {
    expect(s({ orderStatus: "CANCELLED", cancellation: "ADMIN", paymentStatus: "REFUNDED", paidAmount: 225_000, refundedAmount: 225_000 }).payment).toMatchObject({
      label: "Pembayaran Dikembalikan",
      message: "Dana pembayaran sebesar Rp225.000 sudah dikembalikan.",
    });
    expect(s({ orderStatus: "CANCELLED", cancellation: "ADMIN", paymentStatus: "PARTIALLY_REFUNDED", paidAmount: 225_000, refundedAmount: 100_000 }).payment).toMatchObject({
      label: "Sebagian Pembayaran Dikembalikan",
      message: "Sebagian dana sebesar Rp100.000 sudah dikembalikan.",
    });
  });

  it("cancelled before any payment: nothing to pay, no pay action", () => {
    const r = s({ orderStatus: "CANCELLED", cancellation: "ADMIN" });
    expect(r.payment.label).toBe("Tidak Perlu Dibayar");
    expect(r.action).toBeNull();
  });

  it("paid and progressing: every step follows the real order status", () => {
    const paid = { paymentStatus: "PAID" as const, paidAmount: 225_000, remainingAmount: 0 };
    expect(states({ ...paid, orderStatus: "PROCESSING" })).toEqual(["done:Pesanan dibuat", "done:Pembayaran dikonfirmasi", "current:Pesanan diproses", "todo:Siap diambil", "todo:Selesai"]);
    expect(states({ ...paid, orderStatus: "COMPLETED" })).toEqual(["done:Pesanan dibuat", "done:Pembayaran dikonfirmasi", "done:Pesanan diproses", "done:Siap diambil", "done:Selesai"]);
    expect(s({ ...paid, orderStatus: "READY_FOR_PICKUP" }).processing.label).toBe("Siap Diambil");
  });

  it("every status row has an icon and a text label (not colour alone)", () => {
    const statuses = ["UNPAID", "WAITING_PAYMENT", "WAITING_VERIFICATION", "PARTIALLY_PAID", "PAID", "FAILED", "EXPIRED", "REFUNDED", "PARTIALLY_REFUNDED"] as const;
    for (const paymentStatus of statuses)
      for (const paymentMethod of ["QRIS", "BANK_TRANSFER", "CASH"] as const) {
        const r = s({ paymentStatus, paymentMethod });
        for (const row of [r.order, r.payment, r.processing]) {
          expect(row.icon.length).toBeGreaterThan(0);
          expect(row.label.length).toBeGreaterThan(0);
        }
      }
  });
});
