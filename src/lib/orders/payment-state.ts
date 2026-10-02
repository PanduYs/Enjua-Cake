/** Customer payment panel data; shared by the payment service and the tracking UI. */
export interface ActiveQris {
  transactionId: string;
  amount: number;
  qrString: string;
  expiresAt: string;
  purpose: "DP" | "FULL" | "REMAINING";
}

export interface CustomerPaymentState {
  method: "QRIS" | "BANK_TRANSFER" | "CASH";
  /** What the customer can do now. */
  stage: "PAY_INITIAL" | "PAY_REMAINING" | "VERIFYING" | "PAID" | "CASH_AT_PICKUP" | "CLOSED";
  amountDue: number;
  deadline: string | null;
  activeQris: ActiveQris | null;
  /** Pending transfer (initial or remaining) waiting for a proof. */
  pendingTransfer: { transactionId: string; amount: number; expiresAt: string | null; purpose: "DP" | "FULL" | "REMAINING" } | null;
  lastAttempt: "FAILED" | "EXPIRED" | null;
  lastProofRejected: boolean;
  bankAccounts: Array<{ bankName: string; accountNumber: string; accountHolder: string }>;
  paymentInstructions: string | null;
}
