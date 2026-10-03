"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/pesanan", label: "Pesanan" },
  { href: "/admin/pembayaran", label: "Pembayaran" },
  { href: "/admin/produk", label: "Produk" },
  { href: "/admin/kapasitas", label: "Kapasitas" },
  { href: "/admin/pengaturan", label: "Pengaturan" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/akun", label: "Akun" },
] as const;

function isCurrent(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  if (href === "/admin/produk") return pathname.startsWith("/admin/produk") || pathname.startsWith("/admin/kategori");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Admin modules (PRD §30.1). Phones: one swipeable row (the current module scrolled into
 * view) instead of three wrapped rows; wider screens wrap. Every item is a ≥44 px target.
 */
export function AdminNavLinks() {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>("[aria-current=page]");
    if (!list || !current || list.scrollWidth <= list.clientWidth) return;
    list.scrollLeft = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2;
  }, [pathname]);
  return (
    <ul ref={listRef} className="enjua-rail -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {ADMIN_NAV.map((item) => {
        const current = isCurrent(pathname, item.href);
        return (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-control px-3 underline-offset-4 hover:underline ${current ? "bg-primary font-semibold text-primary-foreground" : ""}`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
