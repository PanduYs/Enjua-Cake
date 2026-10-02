/** Indonesian copy for payment flows (FD-53, PRD §14, Design §30). */
export const PAYMENT_ERROR_MESSAGE = {
  NOT_FOUND: "Pesanan tidak ditemukan.",
  ORDER_CLOSED: "Pesanan ini sudah selesai atau dibatalkan.",
  RESERVATION_EXPIRED: "Batas waktu pembayaran telah habis. Jika pesanan dibatalkan, silakan buat pesanan baru.",
  ALREADY_PAID: "Pesanan ini sudah lunas.",
  METHOD_NOT_AVAILABLE: "Metode pembayaran ini tidak tersedia untuk pesanan ini.",
  PROOF_UNDER_REVIEW: "Bukti pembayaran sedang diverifikasi admin.",
  PROVIDER_UNAVAILABLE: "Layanan pembayaran sedang bermasalah. Silakan coba lagi.",
  RATE_LIMITED: "Terlalu banyak percobaan. Coba lagi dalam beberapa menit.",
  NO_PENDING_TRANSFER: "Tidak ada pembayaran transfer yang menunggu bukti.",
  PAYMENT_EXPIRED: "Batas waktu pembayaran telah habis.",
  EMPTY: "Pilih file bukti pembayaran.",
  TOO_LARGE: "Ukuran file maksimal 5 MB.",
  UNSUPPORTED_TYPE: "Format file harus JPG, PNG, atau PDF.",
} as const;

export const ADMIN_PAYMENT_ERROR_MESSAGE = {
  NOT_FOUND: "Data tidak ditemukan.",
  NOT_PENDING: "Status sudah berubah. Muat ulang halaman.",
  REASON_REQUIRED: "Alasan wajib diisi.",
  ORDER_CLOSED: "Pesanan sudah selesai atau dibatalkan.",
  NOT_CASH: "Hanya untuk pesanan Cash.",
  ALREADY_PAID: "Pembayaran sudah tercatat.",
  INVALID_AMOUNT: "Nominal harus bilangan bulat lebih dari 0.",
  EXCEEDS_REFUNDABLE: "Nominal melebihi dana yang diterima dan belum dikembalikan.",
  NOTE_REQUIRED: "Catatan penyelesaian wajib diisi.",
} as const;

export const TRANSACTION_STATUS_LABEL = {
  WAITING_PAYMENT: "Menunggu Pembayaran",
  WAITING_VERIFICATION: "Menunggu Verifikasi",
  PAID: "Terbayar",
  FAILED: "Gagal",
  EXPIRED: "Kedaluwarsa",
  VOIDED: "Tidak Berlaku",
} as const;

export const PAYMENT_PURPOSE_LABEL = { DP: "DP 50%", FULL: "Pembayaran Penuh", REMAINING: "Pelunasan" } as const;

export const PROOF_STATUS_LABEL = { PENDING: "Menunggu Verifikasi", APPROVED: "Disetujui", REJECTED: "Ditolak" } as const;

export const EXCEPTION_KIND_LABEL = {
  LATE_PAYMENT_AFTER_CANCEL: "Pembayaran setelah pesanan dibatalkan",
  AMOUNT_MISMATCH: "Nominal tidak sesuai",
  DUPLICATE_PAYMENT: "Pembayaran ganda",
} as const;

export const REFUND_STATUS_LABEL = { PENDING: "Diproses", COMPLETED: "Selesai" } as const;
