"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { CloseIcon, MenuIcon } from "./icons";

interface NavItem {
  href: string;
  label: string;
}

/** Mobile drawer (PRD-Design §7): keyboard operable, Escape closes, focus returns to the toggle. */
export function MobileNav({ items, ctaHref, ctaLabel }: { items: readonly NavItem[]; ctaHref: string; ctaLabel: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    toggleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    firstLinkRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  return (
    <div className="lg:hidden">
      <button
        ref={toggleRef}
        type="button"
        className="flex h-11 w-11 items-center justify-center rounded-control"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Tutup menu" : "Buka menu"}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto border-t border-border bg-background px-4 py-6"
      >
        <nav aria-label="Menu utama">
          <ul className="flex flex-col gap-1">
            {items.map((item, index) => (
              <li key={item.href}>
                <Link
                  ref={index === 0 ? firstLinkRef : undefined}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center rounded-control px-3 text-lg hover:bg-surface-muted"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={ctaHref}
            onClick={() => setOpen(false)}
            className="mt-6 flex min-h-12 items-center justify-center rounded-control bg-primary px-5 font-semibold text-primary-foreground"
          >
            {ctaLabel}
          </Link>
        </nav>
      </div>
    </div>
  );
}
