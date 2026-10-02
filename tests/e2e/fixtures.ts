/** E2E-only credentials for a disposable database. Never used outside tests. */
export const E2E_ADMIN = { email: "e2e-admin@example.test", password: "e2e-kue-enak-sekali-123" } as const;

/** Separate admin for order E2E so the password-change flow cannot interfere. */
export const E2E_ORDERS_ADMIN = { email: "e2e-orders-admin@example.test", password: "e2e-pesanan-kue-789-xyz" } as const;

/** Saved session of E2E_ORDERS_ADMIN, written by global-setup (inside the ignored test-results dir). */
export const ORDERS_ADMIN_STATE = "test-results/.auth/orders-admin.json";
