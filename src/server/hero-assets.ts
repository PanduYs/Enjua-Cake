import "server-only";

import { statSync } from "node:fs";
import path from "node:path";

/**
 * Hero photographs supplied by the client: a landscape shot for tablets/desktops and a
 * vertical shot for phones (art direction). They live in public/images/hero/. Until a
 * file is present the hero renders without a photo instead of a broken image.
 */
export const HERO_ASSETS = {
  desktop: "/images/hero/landscape.png",
  mobile: "/images/hero/vertical.jpg",
} as const;

function publicFileExists(urlPath: string): boolean {
  try {
    return statSync(path.join(process.cwd(), "public", urlPath)).isFile();
  } catch {
    return false;
  }
}

export function availableHeroAssets(): { desktop: string | null; mobile: string | null } {
  return {
    desktop: publicFileExists(HERO_ASSETS.desktop) ? HERO_ASSETS.desktop : null,
    mobile: publicFileExists(HERO_ASSETS.mobile) ? HERO_ASSETS.mobile : null,
  };
}
