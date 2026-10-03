import { getImageProps } from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

import { heroCopy } from "@/lib/copy/public";

import { BrushEdge } from "./brush-edge";
import { HeroParallax } from "./hero-parallax";

const delay = (ms: number) => ({ "--enjua-delay": `${ms}ms` }) as CSSProperties;

/**
 * Full-bleed editorial hero (PRD-Design §9). Art direction: the landscape photo on
 * tablets/desktops (cake on the right, copy over the calmer left side), the vertical photo
 * on phones (copy at the bottom). Without photos it falls back to the brand colours.
 */
export function HomeHero({ images }: { images: { desktop: string | null; mobile: string | null } }) {
  const desktop = images.desktop ?? images.mobile;
  const mobile = images.mobile ?? images.desktop;
  let picture = null;
  if (desktop && mobile) {
    // Decorative: the copy carries the meaning; the alt stays empty so it is not read twice.
    const common = { alt: "", fill: true, sizes: "100vw", fetchPriority: "high" as const, loading: "eager" as const };
    const {
      props: { srcSet: desktopSrcSet },
    } = getImageProps({ ...common, src: desktop, quality: 80 });
    const {
      props: { srcSet: mobileSrcSet, ...img },
    } = getImageProps({ ...common, src: mobile, quality: 75 });
    picture = (
      <picture>
        <source media="(min-width: 768px)" srcSet={desktopSrcSet} sizes="100vw" />
        <source srcSet={mobileSrcSet} sizes="100vw" />
        <img {...img} alt="" className="enjua-hero-image absolute inset-0 h-full w-full object-cover object-[50%_30%] md:object-[68%_50%]" />
      </picture>
    );
  }

  return (
    <section aria-labelledby="hero-title" className="enjua-hero relative isolate flex overflow-hidden bg-accent text-accent-foreground">
      <HeroParallax className="absolute inset-0 -z-20">
        {picture ?? (
          <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_80%_40%,var(--color-accent-soft)_0%,var(--color-accent)_45%,var(--color-primary)_100%)]" />
        )}
      </HeroParallax>
      {/* Readability: darker where the copy sits (bottom on phones, left on wider screens). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,rgb(46_30_25/0.82)_0%,rgb(46_30_25/0.5)_38%,rgb(46_30_25/0)_68%)] md:bg-[linear-gradient(90deg,rgb(46_30_25/0.72)_0%,rgb(46_30_25/0.42)_36%,rgb(46_30_25/0)_62%)]"
      />
      <div className="mx-auto flex w-full max-w-6xl items-end px-4 pt-10 pb-12 sm:pb-16 md:items-center md:pb-20">
        <div className="flex max-w-xl flex-col gap-4 sm:gap-5 lg:max-w-2xl [text-shadow:0_1px_18px_rgb(46_30_25/0.35)]">
          <h1 id="hero-title" className="enjua-rise text-[clamp(1.85rem,8.2vw,3rem)] leading-[1.08] md:text-[clamp(2.6rem,4.3vw,3.75rem)]" style={delay(80)}>
            {heroCopy.headlineLines[0]}
            <br />
            {heroCopy.headlineLines[1]}
          </h1>
          <p className="enjua-rise max-w-md text-base sm:text-lg" style={delay(220)}>
            {heroCopy.supporting}
          </p>
          <div className="enjua-rise grid grid-cols-2 gap-2.5 pt-1 sm:flex sm:flex-wrap sm:gap-3" style={delay(360)}>
            <Link
              href="/produk"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-background px-3 text-[0.95rem] font-semibold whitespace-nowrap sm:px-6 sm:text-base text-primary shadow-lg shadow-black/10 transition-transform hover:-translate-y-0.5 [text-shadow:none]"
            >
              {heroCopy.primaryCta}
            </Link>
            <Link
              href="/produk"
              className="inline-flex min-h-12 items-center justify-center rounded-full border-2 border-accent-foreground/90 px-3 text-[0.95rem] font-semibold whitespace-nowrap sm:px-6 sm:text-base text-accent-foreground backdrop-blur-[2px] transition-colors hover:bg-accent-foreground/15"
            >
              {heroCopy.secondaryCta}
            </Link>
          </div>
        </div>
      </div>
      <BrushEdge position="bottom" className="absolute inset-x-0 bottom-0 text-background" />
    </section>
  );
}
