"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Subtle parallax for the hero photo: the layer moves slower than the page while the hero
 * is on screen. transform only (no layout work), one rAF per frame, passive listener.
 * Lighter on phones; off for reduced motion and data-saver.
 */
export function HeroParallax({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = ref.current;
    const section = layer?.parentElement;
    if (!layer || !section) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wide = window.matchMedia("(min-width: 1024px)");
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

    let frame = 0;
    const update = () => {
      frame = 0;
      if (reduced.matches || saveData) {
        layer.style.transform = "";
        return;
      }
      const height = section.offsetHeight;
      const y = Math.min(Math.max(window.scrollY, 0), height);
      layer.style.transform = `translate3d(0, ${(y * (wide.matches ? 0.22 : 0.1)).toFixed(1)}px, 0)`;
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    reduced.addEventListener("change", update);
    wide.addEventListener("change", update);
    return () => {
      window.removeEventListener("scroll", onScroll);
      reduced.removeEventListener("change", update);
      wide.removeEventListener("change", update);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className={`enjua-parallax will-change-transform ${className}`}>
      {children}
    </div>
  );
}
