"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

/** Admin modules (PRD §30.1). Wraps on small screens; every item is a ≥44 px target. */
export function AdminNavLinks() {
  const pathname = usePathname();
  return (
    <ul className="flex flex-wrap gap-1">
      {ADMIN_NAV.map((item) => {
        const current = isCurrent(pathname, item.href);
        return (
          <li key={item.href}>
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
