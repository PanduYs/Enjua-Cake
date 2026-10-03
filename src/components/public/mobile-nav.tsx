"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { CloseIcon, MenuIcon } from "./icons";

interface NavItem {
  href: string;
  label: string;
}

const noopSubscribe = () => () => {};

/**
 * Mobile drawer (PRD-Design §7): keyboard operable, Escape closes, focus returns to the toggle.
 *
 * The panel is portaled to <body>: the sticky header uses backdrop-filter, which makes it
 * the containing block for position:fixed descendants, so a panel rendered inside it was
 * sized against the 64 px header instead of the viewport and showed as a thin strip.
 */
export function MobileNav({ items, ctaHref, ctaLabel }: { items: readonly NavItem[]; ctaHref: string; ctaLabel: string }) {
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
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
    // The drawer only exists below the lg breakpoint; rotating/resizing past it closes it.
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onDesktop = () => desktop.matches && setOpen(false);
    document.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onDesktop);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onDesktop);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  const panel = (
    <div
      id={panelId}
      hidden={!open}
      className="enjua-drawer fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto overscroll-contain border-t border-border bg-background px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      <nav aria-label="Menu utama">
        <ul className="flex flex-col">
          {items.map((item, index) => (
            <li key={item.href} className="border-b border-border/60 last:border-b-0">
              <Link
                ref={index === 0 ? firstLinkRef : undefined}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex min-h-12 items-center rounded-control px-2 text-lg hover:bg-surface-muted"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href={ctaHref}
          onClick={() => setOpen(false)}
          className="mt-5 flex min-h-12 items-center justify-center rounded-full bg-primary px-5 font-semibold text-primary-foreground"
        >
          {ctaLabel}
        </Link>
      </nav>
    </div>
  );

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
      {mounted ? createPortal(panel, document.body) : null}
    </div>
  );
}
