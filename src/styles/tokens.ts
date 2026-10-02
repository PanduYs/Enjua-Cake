/**
 * Design tokens (PRD-Design §4). Values are the reference palette adjusted for
 * WCAG 2.1 AA contrast (FD-101, FD-102). Development values — final brand colors
 * come from the client (GL-01). Must stay in sync with src/app/globals.css
 * (enforced by tests/unit/design-tokens.test.ts).
 */
export const colorTokens = {
  background: "#F8EDE1", // warm cream
  surface: "#FFF8F1",
  "surface-muted": "#F6EADD",
  foreground: "#3E2B24", // warm dark brown
  "muted-foreground": "#6B5248",
  primary: "#6E4635", // cocoa — primary buttons
  "primary-foreground": "#F8EDE1",
  accent: "#7E5254", // deep mauve — text-bearing accent backgrounds
  "accent-foreground": "#F8EDE1",
  "accent-soft": "#B79A98", // reference dusty rose — decorative only (2.25:1 on cream)
  border: "#E2CFC0", // decorative separators only
  focus: "#6E4635",
  "pastel-blush": "#F1D9D6",
  "pastel-beige": "#E9DDD5",
  "pastel-lavender": "#E6DCE8",
  "pastel-peach": "#F6DCC8",
  "badge-ready": "#DCE6D3", // soft sage
  "badge-preorder": "#F1D9D6", // dusty rose tint
  "badge-soldout": "#4A3B36", // dark neutral
  "badge-soldout-foreground": "#F8EDE1",
  danger: "#9B2C2C",
  success: "#2F6B3A",
} as const;

export type ColorToken = keyof typeof colorTokens;

/** Foreground/background pairs that carry text or essential UI and must meet AA. */
export const contrastRequirements: ReadonlyArray<{ fg: ColorToken; bg: ColorToken; min: number; usage: string }> = [
  { fg: "foreground", bg: "background", min: 4.5, usage: "body text" },
  { fg: "foreground", bg: "surface", min: 4.5, usage: "card text" },
  { fg: "foreground", bg: "surface-muted", min: 4.5, usage: "muted section text" },
  { fg: "muted-foreground", bg: "background", min: 4.5, usage: "supporting text" },
  { fg: "muted-foreground", bg: "surface", min: 4.5, usage: "supporting text on cards" },
  { fg: "primary-foreground", bg: "primary", min: 4.5, usage: "primary button" },
  { fg: "accent-foreground", bg: "accent", min: 4.5, usage: "hero/footer text on mauve" },
  { fg: "primary", bg: "background", min: 4.5, usage: "links" },
  { fg: "foreground", bg: "pastel-blush", min: 4.5, usage: "category card text" },
  { fg: "foreground", bg: "pastel-beige", min: 4.5, usage: "category card text" },
  { fg: "foreground", bg: "pastel-lavender", min: 4.5, usage: "category card text" },
  { fg: "foreground", bg: "pastel-peach", min: 4.5, usage: "category card text" },
  { fg: "foreground", bg: "badge-ready", min: 4.5, usage: "Ready Stock badge" },
  { fg: "foreground", bg: "badge-preorder", min: 4.5, usage: "Pre-Order badge" },
  { fg: "badge-soldout-foreground", bg: "badge-soldout", min: 4.5, usage: "Sold Out badge" },
  { fg: "danger", bg: "background", min: 4.5, usage: "error text" },
  { fg: "danger", bg: "surface", min: 4.5, usage: "error text on cards" },
  { fg: "success", bg: "background", min: 4.5, usage: "success text" },
  { fg: "focus", bg: "background", min: 3, usage: "focus ring (non-text, SC 1.4.11)" },
  { fg: "focus", bg: "surface", min: 3, usage: "focus ring on cards" },
];

/** WCAG 2.x relative luminance contrast ratio. */
export function contrastRatio(hexA: string, hexB: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
