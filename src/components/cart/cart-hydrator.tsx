"use client";

import { useEffect } from "react";

import { useCartStore } from "@/lib/cart/store";

/** Loads the persisted cart once on the client. */
export function CartHydrator() {
  useEffect(() => {
    void useCartStore.persist.rehydrate();
  }, []);
  return null;
}
