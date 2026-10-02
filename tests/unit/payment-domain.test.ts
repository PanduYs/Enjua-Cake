import { describe, expect, it } from "vitest";

import { derivePaymentStatus, initialQrExpiry, paidAmountOf, type PaymentFacts } from "@/server/domain/payments/payment-status";
import { detectProofMime, PROOF_MAX_BYTES, validateProofFile } from "@/server/domain/payments/proof-file";

const now = new Date("2026-10-02T03:00:00Z");
const later = new Date("2026-10-02T03:30:00Z");
const earlier = new Date("2026-10-02T02:00:00Z");
type Tx = PaymentFacts["transactions"][number];
const tx = (over: Partial<Tx>): Tx => ({ status: "WAITING_PAYMENT", amount: 50_000, isException: false, expiresAt: later, createdAt: earlier, ...over });
const facts = (over: Partial<PaymentFacts>): PaymentFacts => ({ grandTotal: 100_000, paymentMethod: "QRIS", orderExpired: false, transactions: [], refundedAmount: 0, ...over });

describe("derivePaymentStatus (§20.2, FD-52)", () => {
  it("follows the plan's evaluation order", () => {
    expect(derivePaymentStatus(facts({ transactions: [tx({ status: "PAID", amount: 100_000 })], refundedAmount: 100_000 }), now)).toBe("REFUNDED");
    expect(derivePaymentStatus(facts({ transactions: [tx({ status: "PAID", amount: 100_000 })], refundedAmount: 10_000 }), now)).toBe("PARTIALLY_REFUNDED");
    expect(derivePaymentStatus(facts({ transactions: [tx({ status: "PAID", amount: 100_000 })] }), now)).toBe("PAID");
    expect(derivePaymentStatus(facts({ transactions: [tx({ status: "PAID" }), tx({ status: "WAITING_VERIFICATION" })] }), now)).toBe("PARTIALLY_PAID");
    expect(derivePaymentStatus(facts({ transactions: [tx({ status: "WAITING_VERIFICATION" })] }), now)).toBe("WAITING_VERIFICATION");
    expect(derivePaymentStatus(facts({ transactions: [tx({})] }), now)).toBe("WAITING_PAYMENT");
    expect(derivePaymentStatus(facts({ orderExpired: true, transactions: [tx({ status: "EXPIRED" })] }), now)).toBe("EXPIRED");
    expect(derivePaymentStatus(facts({ transactions: [tx({ status: "FAILED" })] }), now)).toBe("FAILED");
    expect(derivePaymentStatus(facts({ paymentMethod: "CASH" }), now)).toBe("UNPAID");
  });

  it("exceptions never count toward paid (FD-112, §23)", () => {
    const f = facts({ transactions: [tx({ status: "PAID", amount: 100_000, isException: true })] });
    expect(paidAmountOf(f)).toBe(0);
    expect(derivePaymentStatus(f, now)).not.toBe("PAID");
  });

  it("an expired-by-time pending transaction is not 'still valid'", () => {
    expect(derivePaymentStatus(facts({ orderExpired: true, transactions: [tx({ expiresAt: earlier })] }), now)).toBe("EXPIRED");
  });

  it("a newer FAILED attempt wins over an older EXPIRED one; a new pending QR wins over both", () => {
    const newer = new Date("2026-10-02T02:30:00Z");
    expect(derivePaymentStatus(facts({ transactions: [tx({ status: "EXPIRED" }), tx({ status: "FAILED", createdAt: newer })] }), now)).toBe("FAILED");
    expect(derivePaymentStatus(facts({ transactions: [tx({ status: "FAILED", createdAt: newer }), tx({ status: "EXPIRED" })] }), now)).toBe("FAILED");
    expect(derivePaymentStatus(facts({ transactions: [tx({ status: "FAILED" }), tx({ createdAt: newer })] }), now)).toBe("WAITING_PAYMENT");
  });

  it("QR for an initial payment ends buffer minutes before the reservation (TD-08)", () => {
    expect(initialQrExpiry(later, 2).toISOString()).toBe("2026-10-02T03:28:00.000Z");
  });
});

describe("payment proof files (FD-50, §24)", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const pdf = new TextEncoder().encode("%PDF-1.7");

  it("detects type from magic bytes only", () => {
    expect(detectProofMime(jpeg)).toBe("image/jpeg");
    expect(detectProofMime(png)).toBe("image/png");
    expect(detectProofMime(pdf)).toBe("application/pdf");
    expect(detectProofMime(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(detectProofMime(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(detectProofMime(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBeNull(); // zip/docx
  });

  it("enforces non-empty and 5 MB", () => {
    expect(validateProofFile(new Uint8Array())).toEqual({ ok: false, error: "EMPTY" });
    const max = new Uint8Array(PROOF_MAX_BYTES);
    max.set(png);
    expect(validateProofFile(max)).toEqual({ ok: true, mime: "image/png" });
    const over = new Uint8Array(PROOF_MAX_BYTES + 1);
    over.set(png);
    expect(validateProofFile(over)).toEqual({ ok: false, error: "TOO_LARGE" });
  });
});
