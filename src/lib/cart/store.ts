"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

/**
 * Anonymous cart persisted in the browser (FD-31). Snapshots are for fast
 * rendering only; prices and availability are re-validated on the server (FD-32).
 */
export interface CartItem {
  productId: string;
  slug: string;
  name: string;
  quantity: number;
  productType: "READY_STOCK" | "PRE_ORDER";
  /** Display-only snapshot of the effective unit price. */
  unitPrice: number;
  imageUrl: string | null;
  maxQuantityPerOrder: number | null;
}

interface CartState {
  items: CartItem[];
  hydrated: boolean;
  add: (item: Omit<CartItem, "quantity">, quantity: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  refreshSnapshots: (updates: ReadonlyArray<Partial<CartItem> & { productId: string }>) => void;
}

/** localStorage can throw (private mode, blocked storage): the cart then lives in memory. */
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      /* ignore */
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

const clampQuantity = (quantity: number, max: number | null) => {
  const q = Math.max(1, Math.floor(quantity));
  return max ? Math.min(q, max) : q;
};

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      hydrated: false,
      add: (item, quantity) =>
        set((state) => {
          const existing = state.items.find((i) => i.productId === item.productId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.productId === item.productId ? { ...i, ...item, quantity: clampQuantity(i.quantity + quantity, item.maxQuantityPerOrder) } : i,
              ),
            };
          }
          return { items: [...state.items, { ...item, quantity: clampQuantity(quantity, item.maxQuantityPerOrder) }] };
        }),
      setQuantity: (productId, quantity) =>
        set((state) => ({
          items: state.items.map((i) => (i.productId === productId ? { ...i, quantity: clampQuantity(quantity, i.maxQuantityPerOrder) } : i)),
        })),
      remove: (productId) => set((state) => ({ items: state.items.filter((i) => i.productId !== productId) })),
      clear: () => set({ items: [] }),
      refreshSnapshots: (updates) =>
        set((state) => ({
          items: state.items.map((i) => {
            const update = updates.find((u) => u.productId === i.productId);
            return update ? { ...i, ...update } : i;
          }),
        })),
    }),
    {
      name: "enjua-cart-v1",
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ items: state.items }),
      // Rehydrated explicitly after mount to avoid SSR/client markup mismatch.
      skipHydration: true,
      onRehydrateStorage: () => () => {
        useCartStore.setState({ hydrated: true });
      },
    },
  ),
);

export function cartLinesForServer(items: ReadonlyArray<CartItem>) {
  return items.map((i) => ({ productId: i.productId, quantity: i.quantity }));
}
