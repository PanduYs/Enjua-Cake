"use client";

/**
 * Hand-off of a just-placed order from checkout to the success page. The access
 * code is the customer's own credential; it stays in this browser tab's
 * sessionStorage only (never localStorage, never the server log or URL path).
 */
export interface LastOrder {
  orderNumber: string;
  trackingToken: string;
  pickupDate: string;
  paymentMethod: "QRIS" | "BANK_TRANSFER" | "CASH";
  paymentOption: "DP_50" | "FULL";
  payment: {
    total: number;
    dpAmount: number | null;
    dueNow: number;
    remaining: number;
  };
  reservationExpiresAt: string | null;
  /** Server-priced lines from the confirmation step (absent for orders saved by older versions). */
  lines?: Array<{ name: string; quantity: number; lineSubtotal: number }>;
}

const KEY = "enjua-last-order";

export function saveLastOrder(order: LastOrder): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(order));
  } catch {
    /* storage unavailable: success page will show the fallback */
  }
}

export function readLastOrder(): LastOrder | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LastOrder) : null;
  } catch {
    return null;
  }
}
