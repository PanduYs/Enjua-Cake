"use client";

import Link from "next/link";

import { useCartStore } from "@/lib/cart/store";

import { CartIcon } from "../public/icons";

export function CartLink() {
  const count = useCartStore((s) => (s.hydrated ? s.items.reduce((sum, i) => sum + i.quantity, 0) : 0));
  return (
    <Link
      href="/keranjang"
      className="relative flex h-11 w-11 items-center justify-center rounded-control hover:bg-surface-muted"
      aria-label={count > 0 ? `Keranjang, ${count} item` : "Keranjang"}
    >
      <CartIcon />
      {count > 0 ? (
        <span aria-hidden="true" className="absolute top-1 right-0.5 min-w-5 rounded-full bg-primary px-1 text-center text-xs font-semibold leading-5 text-primary-foreground">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
