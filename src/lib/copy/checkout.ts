/** Customer-facing messages for checkout outcomes (PRD §36, §52; Design §16, §30). */
export const PICKUP_REASON_LABEL = {
  PREORDER_MIN_NOT_MET: "Belum memenuhi minimum Pre-Order",
  CUTOFF_PASSED: "Batas pemesanan hari ini sudah lewat",
  BLOCKED: "Tutup",
  FULL: "Penuh — kuota pesanan tanggal ini sudah tercapai",
  OUTSIDE_HORIZON: "Di luar rentang pemesanan",
  PAST_DATE: "Tanggal sudah lewat",
} as const;

export type PickupReasonCode = keyof typeof PICKUP_REASON_LABEL;

export const CART_ISSUE_LABEL = {
  NOT_AVAILABLE: "Produk ini sudah tidak tersedia. Hapus dari keranjang untuk melanjutkan.",
  SOLD_OUT: "Produk ini sedang Sold Out. Hapus dari keranjang untuk melanjutkan.",
  INVALID_QUANTITY: "Jumlah tidak valid.",
  EXCEEDS_MAX_QUANTITY: "Jumlah melebihi batas maksimal per pesanan.",
  DUPLICATE_LINE: "Produk tercantum lebih dari sekali.",
} as const;

export type CartIssueCode = keyof typeof CART_ISSUE_LABEL;

export const PAYMENT_METHOD_LABEL = {
  QRIS: "QRIS",
  BANK_TRANSFER: "Transfer Bank",
  CASH: "Cash saat Pickup",
} as const;

export const PAYMENT_OPTION_LABEL = {
  DP_50: "Bayar DP 50%",
  FULL: "Bayar Penuh",
} as const;

export const CASH_UNAVAILABLE_REASON = "Cash hanya tersedia untuk pesanan Ready Stock.";
