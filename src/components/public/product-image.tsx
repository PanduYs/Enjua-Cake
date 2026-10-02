import Image from "next/image";

import { CakeIcon } from "./icons";

/** Square product photo with a consistent placeholder when no image exists yet. */
export function ProductImage({
  image,
  sizes,
  priority = false,
  className = "",
}: {
  image: { url: string; alt: string } | null;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative aspect-square overflow-hidden bg-surface-muted ${className}`}>
      {image ? (
        <Image src={image.url} alt={image.alt} fill sizes={sizes} priority={priority} className="object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-accent-soft" role="img" aria-label="Foto produk belum tersedia">
          <CakeIcon width={56} height={56} />
        </div>
      )}
    </div>
  );
}
