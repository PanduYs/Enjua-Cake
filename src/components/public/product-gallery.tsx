"use client";

import Image from "next/image";
import { useState } from "react";

import { CakeIcon } from "./icons";

/** Main image + thumbnails; thumbnails are real buttons (keyboard/touch, no hover dependency). */
export function ProductGallery({ images, productName }: { images: Array<{ url: string; alt: string }>; productName: string }) {
  const [active, setActive] = useState(0);
  const current = images[active];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square overflow-hidden rounded-card bg-surface-muted">
        {current ? (
          <Image src={current.url} alt={current.alt} fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-accent-soft" role="img" aria-label={`Foto ${productName} belum tersedia`}>
            <CakeIcon width={96} height={96} />
          </div>
        )}
      </div>
      {images.length > 1 ? (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5" aria-label="Foto lainnya">
          {images.map((image, index) => (
            <li key={image.url}>
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-pressed={index === active}
                aria-label={`Tampilkan foto ${index + 1} dari ${images.length}`}
                className={`relative block aspect-square w-full overflow-hidden rounded-control border-2 ${index === active ? "border-primary" : "border-transparent"}`}
              >
                <Image src={image.url} alt="" fill sizes="120px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
