import Image from "next/image";
import Link from "next/link";

import { ArrowRightIcon, CakeIcon } from "./icons";

const PASTELS = ["bg-pastel-blush", "bg-pastel-beige", "bg-pastel-lavender", "bg-pastel-peach"] as const;

export interface CategoryCardData {
  slug: string;
  name: string;
  description: string | null;
  image: { url: string; alt: string } | null;
}

/**
 * Real categories from the database (FD-23); count adapts to the data. Phones get a
 * swipeable snap rail (the next card peeks in, so more categories are obvious) instead of
 * tall stacked cards; wider screens get a compact grid.
 */
export function CategoryCards({ categories }: { categories: CategoryCardData[] }) {
  const columns = categories.length % 4 === 0 ? "lg:grid-cols-4" : "lg:grid-cols-3";
  return (
    <ul
      className={`enjua-rail -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 ${columns}`}
    >
      {categories.map((category, index) => (
        <li key={category.slug} className="w-[44%] min-w-[9.5rem] shrink-0 snap-start sm:w-auto sm:min-w-0">
          <Link
            href={`/produk?kategori=${encodeURIComponent(category.slug)}`}
            className={`group flex h-full flex-col gap-3 rounded-card p-3 text-foreground transition duration-300 motion-safe:hover:-translate-y-1 hover:shadow-md sm:flex-row sm:items-center sm:gap-4 sm:p-4 lg:flex-col lg:items-stretch lg:p-5 ${PASTELS[index % PASTELS.length]}`}
          >
            <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-[0.9rem] bg-surface/50 sm:w-24 lg:aspect-[4/3] lg:w-full">
              {category.image ? (
                <Image
                  src={category.image.url}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 96px, 45vw"
                  className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.06]"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground" aria-hidden="true">
                  <CakeIcon width={44} height={44} />
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h3 className="text-lg leading-tight sm:text-xl lg:text-2xl">{category.name}</h3>
              <p className="line-clamp-2 text-xs text-muted-foreground sm:text-sm">{category.description ?? `Lihat semua ${category.name}`}</p>
            </div>
            <span
              className="hidden h-9 w-9 shrink-0 items-center justify-center self-end rounded-full bg-surface transition-transform motion-safe:group-hover:translate-x-1 sm:flex lg:self-end"
              aria-hidden="true"
            >
              <ArrowRightIcon width={18} height={18} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
