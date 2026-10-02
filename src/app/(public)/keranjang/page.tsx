import type { Metadata } from "next";

import { CartView } from "@/components/cart/cart-view";

import { validateCartAction } from "../_actions/checkout";

export const metadata: Metadata = { title: "Keranjang", robots: { index: false } };

export default function CartPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <h1 className="mb-8 text-4xl sm:text-5xl">Keranjang</h1>
      <CartView validate={validateCartAction} />
    </div>
  );
}
