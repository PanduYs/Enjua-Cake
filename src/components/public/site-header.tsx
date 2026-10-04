import Image from "next/image";
import Link from "next/link";

import { heroCopy, navItems } from "@/lib/copy/public";

import { CartLink } from "../cart/cart-link";
import { MobileNav } from "./mobile-nav";

/** Desktop: logo · nav · cart · CTA. Mobile: logo · cart · drawer (FD-92, FD-93). No search (FD-94). */
export function SiteHeader({ businessName }: { businessName: string }) {
  return (
    <header className="sticky top-0 z-50 h-16 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2 font-heading text-xl font-semibold whitespace-nowrap sm:text-2xl">
          {/* Logo.png is 1904×912 with the round mark centred and transparent sides; a square
              object-cover box shows the whole mark undistorted. Decorative: the name is the link text. */}
          <span className="relative h-8 w-8 shrink-0 sm:h-9 sm:w-9">
            <Image src="/images/logo/Logo.png" alt="" fill sizes="76px" loading="eager" className="object-cover" />
          </span>
          {businessName}
        </Link>
        <nav aria-label="Navigasi utama" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="rounded-control px-3 py-2 text-sm font-medium hover:bg-surface-muted">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-1 sm:gap-2">
          <CartLink />
          <Link
            href="/produk"
            className="hidden min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 lg:inline-flex"
          >
            {heroCopy.primaryCta}
          </Link>
          <MobileNav items={navItems} ctaHref="/produk" ctaLabel={heroCopy.primaryCta} />
        </div>
      </div>
    </header>
  );
}
