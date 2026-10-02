/** Indonesian UI labels for internal status codes (FD-53, FD-54, PRD §14, §22). */
export const ORDER_STATUS_LABEL = {
  NEW: "Pesanan Baru",
  CONFIRMED: "Dikonfirmasi",
  PROCESSING: "Pesanan Diproses",
  READY_FOR_PICKUP: "Siap Diambil",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
} as const;

export const ORDER_TIMELINE = ["NEW", "CONFIRMED", "PROCESSING", "READY_FOR_PICKUP", "COMPLETED"] as const;

export const PAYMENT_STATUS_LABEL = {
  UNPAID: "Belum Dibayar",
  WAITING_PAYMENT: "Menunggu Pembayaran",
  WAITING_VERIFICATION: "Menunggu Verifikasi",
  PARTIALLY_PAID: "DP Terbayar",
  PAID: "Lunas",
  FAILED: "Pembayaran Gagal",
  EXPIRED: "Pembayaran Kedaluwarsa",
  REFUNDED: "Dana Dikembalikan",
  PARTIALLY_REFUNDED: "Dana Dikembalikan Sebagian",
} as const;

/** Customer-safe cancellation reasons; admin free text is not shown to customers. */
export const CUSTOMER_CANCELLATION_REASON = {
  PAYMENT_EXPIRED: "Batas waktu pembayaran habis.",
  ADMIN: "Pesanan dibatalkan oleh toko.",
} as const;

export const TRANSITION_ACTION_LABEL = {
  CONFIRMED: "Konfirmasi Pesanan",
  PROCESSING: "Proses Pesanan",
  READY_FOR_PICKUP: "Tandai Siap Diambil",
  COMPLETED: "Tandai Selesai",
  CANCELLED: "Batalkan Pesanan",
} as const;

export const TRANSITION_ERROR_MESSAGE = {
  INVALID_TRANSITION: "Perubahan status ini tidak diizinkan.",
  REASON_REQUIRED: "Alasan pembatalan wajib diisi.",
  PAYMENT_NOT_COMPLETE: "Pesanan hanya bisa diselesaikan setelah pembayaran lunas.",
  PAYMENT_NOT_CONFIRMED: "Pesanan hanya bisa dikonfirmasi setelah pembayaran terverifikasi.",
  CASH_DOES_NOT_EXPIRE: "Pesanan Cash tidak kedaluwarsa otomatis.",
  STALE_STATUS: "Status pesanan sudah berubah. Muat ulang halaman.",
} as const;
