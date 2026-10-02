/** Data shown on the customer tracking page; shared by the service and the UI. */
export interface TrackingView {
  orderNumber: string;
  customerName: string;
  orderStatus: "NEW" | "CONFIRMED" | "PROCESSING" | "READY_FOR_PICKUP" | "COMPLETED" | "CANCELLED";
  paymentStatus: string;
  paymentMethod: "QRIS" | "BANK_TRANSFER" | "CASH";
  paymentOption: "DP_50" | "FULL";
  pickupDate: string;
  createdAt: string;
  items: Array<{ name: string; quantity: number; lineSubtotal: number }>;
  subtotal: number;
  discountTotal: number;
  grandTotal: number;
  dpAmount: number | null;
  paidAmount: number;
  remainingAmount: number;
  reservationExpiresAt: string | null;
  /** Customer-safe category only; admin free-text reasons are never exposed. */
  cancellation: "PAYMENT_EXPIRED" | "ADMIN" | null;
}
