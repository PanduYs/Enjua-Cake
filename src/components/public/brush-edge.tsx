/** Organic, paint-like section edge (PRD-Design §2, §9). Purely decorative. */
export function BrushEdge({ position, className = "" }: { position: "top" | "bottom"; className?: string }) {
  const path =
    "M0 18 C 60 6, 120 26, 180 14 S 300 4, 360 16 S 480 28, 540 12 S 660 2, 720 15 S 840 27, 900 13 S 1020 4, 1080 17 S 1200 26, 1260 12 S 1380 6, 1440 16 V40 H0 Z";
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1440 40"
      preserveAspectRatio="none"
      className={`block h-5 w-full sm:h-8 ${position === "top" ? "rotate-180" : ""} ${className}`}
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
}
