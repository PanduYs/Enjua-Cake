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

/** Real categories from the database (FD-23); count adapts to the data. */
export function CategoryCards({ categories }: { categories: CategoryCardData[] }) {
  return (
    <ul className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${categories.length % 4 === 0 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
      {categories.map((category, index) => (
        <li key={category.slug}>
          <Link
            href={`/produk?kategori=${encodeURIComponent(category.slug)}`}
            className={`group flex h-full flex-col items-center gap-4 rounded-card p-6 text-center text-foreground transition-shadow hover:shadow-md ${PASTELS[index % PASTELS.length]}`}
          >
            <h3 className="text-2xl sm:text-3xl">{category.name}</h3>
            <div className="relative aspect-[4/3] w-full max-w-xs">
              {category.image ? (
                <Image
                  src={category.image.url}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
                  className="rounded-card object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.03]"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground" aria-hidden="true">
                  <CakeIcon width={64} height={64} />
                </div>
              )}
            </div>
            <div className="mt-auto flex w-full items-center justify-between gap-3 text-left">
              <p className="text-sm">{category.description ?? `Lihat semua ${category.name}`}</p>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface" aria-hidden="true">
                <ArrowRightIcon width={20} height={20} />
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
