import { formatRupiah } from "@/lib/format/rupiah";

/**
 * Customer-facing status presentation (order created ≠ payment completed).
 *
 * Everything here is derived from the real backend states — order status, payment status
 * (derivePaymentStatus) and amounts — and is shared by the success page and the tracking
 * page so both always say the same thing. No business rule lives here.
 */
export type OrderStatusCode = "NEW" | "CONFIRMED" | "PROCESSING" | "READY_FOR_PICKUP" | "COMPLETED" | "CANCELLED";
export type PaymentStatusCode =
  | "UNPAID"
  | "WAITING_PAYMENT"
  | "WAITING_VERIFICATION"
  | "PARTIALLY_PAID"
  | "PAID"
  | "FAILED"
  | "EXPIRED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export interface CustomerStatusInput {
  orderStatus: OrderStatusCode;
  paymentStatus: PaymentStatusCode;
  paymentMethod: "QRIS" | "BANK_TRANSFER" | "CASH";
  paymentOption: "DP_50" | "FULL";
  grandTotal: number;
  dpAmount: number | null;
  paidAmount: number;
  remainingAmount: number;
  cancellation: "PAYMENT_EXPIRED" | "ADMIN" | null;
  /** Completed refunds of counted payments, when known. */
  refundedAmount?: number;
}

/** Tone drives colour only; every row also carries an icon and a text label. */
export type StatusTone = "success" | "waiting" | "info" | "danger" | "neutral";

export interface StatusRow {
  tone: StatusTone;
  /** Decorative; the label carries the meaning. */
  icon: string;
  label: string;
  message?: string;
}

export interface CustomerStatus {
  order: StatusRow;
  payment: StatusRow;
  processing: StatusRow;
  /** One sentence that answers "what does this mean for me now?". */
  headline: string;
  /** What the customer should do next, if anything. */
  action: "PAY_QRIS" | "PAY_TRANSFER" | "UPLOAD_PROOF_WAIT" | "PAY_REMAINING" | "RETRY_PAYMENT" | "NEW_ORDER" | "PAY_AT_PICKUP" | null;
}

const isDp = (s: CustomerStatusInput) => s.paymentOption === "DP_50";

function paymentRow(s: CustomerStatusInput): StatusRow {
  const cancelled = s.orderStatus === "CANCELLED";
  const refunded = s.refundedAmount && s.refundedAmount > 0 ? ` sebesar ${formatRupiah(s.refundedAmount)}` : "";
  switch (s.paymentStatus) {
    case "REFUNDED":
      return { tone: "neutral", icon: "↩", label: "Pembayaran Dikembalikan", message: `Dana pembayaran${refunded} sudah dikembalikan.` };
    case "PARTIALLY_REFUNDED":
      return { tone: "neutral", icon: "↩", label: "Sebagian Pembayaran Dikembalikan", message: `Sebagian dana${refunded} sudah dikembalikan.` };
    case "PAID":
      return { tone: "success", icon: "🟢", label: "Pembayaran Berhasil", message: `Total dibayar ${formatRupiah(s.paidAmount)}.` };
    case "PARTIALLY_PAID":
      return {
        tone: "success",
        icon: "🟢",
        label: "DP Dibayar",
        message: cancelled
          ? `DP ${formatRupiah(s.paidAmount)} sudah diterima.`
          : `DP ${formatRupiah(s.paidAmount)} sudah diterima. Sisa ${formatRupiah(s.remainingAmount)} perlu dilunasi sebelum pesanan diambil.`,
      };
    case "WAITING_VERIFICATION":
      return { tone: "waiting", icon: "🟠", label: "Menunggu Verifikasi", message: "Bukti pembayaran sudah diterima dan sedang diperiksa oleh admin." };
    case "EXPIRED":
      return { tone: "neutral", icon: "⚪", label: "Pembayaran Kedaluwarsa", message: "Batas waktu pembayaran telah berakhir, jadi pembayaran sebelumnya sudah tidak berlaku." };
    case "FAILED":
      return cancelled
        ? { tone: "danger", icon: "🔴", label: "Pembayaran Gagal", message: "Pembayaran tidak berhasil." }
        : { tone: "danger", icon: "🔴", label: "Pembayaran Gagal", message: "Pembayaran belum berhasil. Silakan coba kembali." };
    case "UNPAID":
      if (cancelled) return { tone: "neutral", icon: "⚪", label: "Tidak Perlu Dibayar", message: "Pesanan dibatalkan sebelum pembayaran." };
      if (s.paymentMethod === "CASH") {
        return { tone: "info", icon: "🟡", label: "Bayar Saat Pengambilan", message: "Pembayaran dilakukan secara tunai saat pengambilan." };
      }
      return { tone: "waiting", icon: "🟠", label: "Belum Dibayar" };
    case "WAITING_PAYMENT": {
      if (cancelled) return { tone: "neutral", icon: "⚪", label: "Tidak Perlu Dibayar", message: "Pesanan dibatalkan sebelum pembayaran." };
      const what = isDp(s) ? "pembayaran DP" : "pembayaran";
      return {
        tone: "waiting",
        icon: "🟠",
        label: isDp(s) ? "Menunggu Pembayaran DP" : "Menunggu Pembayaran",
        message:
          s.paymentMethod === "QRIS"
            ? `Silakan selesaikan ${what} melalui QRIS agar pesanan dapat diproses.`
            : `Silakan transfer ${isDp(s) ? "DP " : ""}sesuai rekening pembayaran. Setelah pembayaran dikonfirmasi, pesanan akan diproses.`,
      };
    }
  }
}

function processingRow(s: CustomerStatusInput): StatusRow {
  switch (s.orderStatus) {
    case "CANCELLED":
      return {
        tone: "neutral",
        icon: "✕",
        label: "Dibatalkan",
        message: s.cancellation === "PAYMENT_EXPIRED" ? "Batas waktu pembayaran habis, pesanan dibatalkan otomatis." : "Pesanan dibatalkan oleh toko.",
      };
    case "COMPLETED":
      return { tone: "success", icon: "✓", label: "Selesai", message: "Pesanan sudah diambil. Terima kasih!" };
    case "READY_FOR_PICKUP":
      return { tone: "success", icon: "🟢", label: "Siap Diambil", message: "Pesanan sudah bisa diambil di toko." };
    case "PROCESSING":
      return { tone: "waiting", icon: "🟠", label: "Sedang Diproses", message: "Pesanan sedang kami siapkan." };
    case "CONFIRMED":
      return { tone: "success", icon: "✓", label: "Dikonfirmasi", message: "Pesanan akan segera diproses." };
    case "NEW":
      if (s.paymentMethod === "CASH") return { tone: "waiting", icon: "⏳", label: "Menunggu Konfirmasi Toko" };
      if (s.paymentStatus === "WAITING_VERIFICATION") return { tone: "waiting", icon: "⏳", label: "Menunggu Verifikasi Pembayaran" };
      return { tone: "waiting", icon: "⏳", label: "Menunggu Pembayaran" };
  }
}

export function customerStatus(s: CustomerStatusInput): CustomerStatus {
  const cancelled = s.orderStatus === "CANCELLED";
  const order: StatusRow = cancelled ? { tone: "neutral", icon: "✕", label: "Dibatalkan" } : { tone: "success", icon: "✓", label: "Sudah Tercatat" };
  const payment = paymentRow(s);
  const processing = processingRow(s);

  let headline: string;
  let action: CustomerStatus["action"] = null;
  if (cancelled) {
    headline = s.cancellation === "PAYMENT_EXPIRED" ? "Pesanan dibatalkan karena batas waktu pembayaran habis." : "Pesanan ini sudah dibatalkan.";
    if (s.cancellation === "PAYMENT_EXPIRED" && s.paidAmount === 0) action = "NEW_ORDER";
  } else if (s.paymentStatus === "WAITING_PAYMENT" || (s.paymentStatus === "UNPAID" && s.paymentMethod !== "CASH")) {
    headline = "Pesanan kamu sudah tercatat, tetapi belum dapat diproses sampai pembayaran dikonfirmasi.";
    action = s.paymentMethod === "QRIS" ? "PAY_QRIS" : "PAY_TRANSFER";
  } else if (s.paymentStatus === "FAILED") {
    headline = "Pesanan kamu sudah tercatat, tetapi pembayarannya belum berhasil.";
    action = "RETRY_PAYMENT";
  } else if (s.paymentStatus === "WAITING_VERIFICATION") {
    headline = "Pesanan kamu sudah tercatat. Pembayaran sedang diperiksa admin.";
    action = "UPLOAD_PROOF_WAIT";
  } else if (s.paymentMethod === "CASH" && s.paymentStatus === "UNPAID") {
    headline = "Pesanan kamu sudah tercatat. Pembayaran dilakukan secara tunai saat pengambilan.";
    action = "PAY_AT_PICKUP";
  } else if (s.paymentStatus === "PARTIALLY_PAID") {
    headline = "DP sudah diterima. Lunasi sisa pembayaran sebelum pesanan diambil.";
    action = "PAY_REMAINING";
  } else {
    headline = "Pembayaran sudah kami terima.";
  }
  return { order, payment, processing, headline, action };
}

export type ProgressState = "done" | "current" | "todo";
export interface ProgressStep {
  key: string;
  label: string;
  state: ProgressState;
  note?: string;
}

/**
 * Progress for the tracking page, built only from real order/payment states. Cash orders
 * are confirmed by the shop and paid at pickup, so their payment step sits at the pickup.
 */
export function customerProgress(s: CustomerStatusInput): ProgressStep[] | null {
  if (s.orderStatus === "CANCELLED") return null;
  const rank: Record<Exclude<OrderStatusCode, "CANCELLED">, number> = { NEW: 0, CONFIRMED: 1, PROCESSING: 2, READY_FOR_PICKUP: 3, COMPLETED: 4 };
  const r = rank[s.orderStatus];
  const step = (key: string, label: string, done: boolean, current: boolean, note?: string): ProgressStep => ({
    key,
    label,
    state: done ? "done" : current ? "current" : "todo",
    ...(note ? { note } : {}),
  });

  const created = step("created", "Pesanan dibuat", true, false);
  const confirmStep =
    s.paymentMethod === "CASH"
      ? step("confirmed", r >= 1 ? "Dikonfirmasi toko" : "Menunggu konfirmasi toko", r >= 1, r === 0)
      : step(
          "payment",
          r >= 1 || s.paidAmount > 0
            ? isDp(s)
              ? "Pembayaran DP dikonfirmasi"
              : "Pembayaran dikonfirmasi"
            : s.paymentStatus === "WAITING_VERIFICATION"
              ? "Menunggu verifikasi pembayaran"
              : s.paymentStatus === "FAILED"
                ? "Pembayaran gagal, silakan coba lagi"
                : isDp(s)
                  ? "Menunggu pembayaran DP"
                  : "Menunggu pembayaran",
          r >= 1 || s.paidAmount > 0,
          r === 0,
        );
  const processing = step("processing", r === 1 ? "Menunggu diproses" : "Pesanan diproses", r >= 3, r === 1 || r === 2);
  const unpaidAtPickup =
    s.paymentStatus !== "PAID" && r < 4
      ? s.paymentMethod === "CASH"
        ? "Bayar tunai saat pengambilan"
        : s.remainingAmount > 0 && s.paidAmount > 0
          ? `Lunasi sisa ${formatRupiah(s.remainingAmount)} sebelum diambil`
          : undefined
      : undefined;
  const ready = step("ready", "Siap diambil", r >= 4, r === 3, unpaidAtPickup);
  const completed = step("completed", "Selesai", r >= 4, false);
  return [created, confirmStep, processing, ready, completed];
}
