import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { colorTokens, contrastRatio, contrastRequirements } from "@/styles/tokens";

describe("design tokens", () => {
  it.each(contrastRequirements)("$fg on $bg meets $min:1 ($usage)", ({ fg, bg, min }) => {
    expect(contrastRatio(colorTokens[fg], colorTokens[bg])).toBeGreaterThanOrEqual(min);
  });

  it("documents that the reference dusty rose is not used for text (PRD-Design §4.1)", () => {
    expect(contrastRatio(colorTokens["accent-foreground"], colorTokens["accent-soft"])).toBeLessThan(4.5);
    expect(contrastRequirements.some((r) => r.bg === "accent-soft" || r.fg === "accent-soft")).toBe(false);
  });

  it("globals.css defines exactly the tokens from tokens.ts", () => {
    const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
    const cssTokens = Object.fromEntries([...css.matchAll(/--color-([a-z-]+):\s*(#[0-9A-Fa-f]{6});/g)].map((m) => [m[1], m[2]!.toUpperCase()]));
    expect(cssTokens).toEqual(Object.fromEntries(Object.entries(colorTokens).map(([k, v]) => [k, v.toUpperCase()])));
  });

  it("computes WCAG ratios correctly for known pairs", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#F8EDE1", "#B79A98")).toBeCloseTo(2.25, 2);
  });
});
