import Link from "next/link";

import { preorderLeadTimeText } from "@/lib/format/labels";

import { QuickAddButton } from "../cart/add-to-cart";

import { PriceTag } from "./price-tag";
import { ProductBadges } from "./product-badges";
import { ProductImage } from "./product-image";

export interface ProductCardData {
  id: string;
  slug: string;
  maxQuantityPerOrder: number | null;
  name: string;
  category: { name: string };
  productType: "READY_STOCK" | "PRE_ORDER";
  minimumPreorderDays: number | null;
  soldOut: boolean;
  price: { effective: number; original: number | null; discountPercent: number | null };
  mainImage: { url: string; alt: string } | null;
}

/** Whole card is one link; add-to-cart arrives with the cart in Phase 3. */
export function ProductCard({ product, headingLevel = 3 }: { product: ProductCardData; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-card bg-surface shadow-sm transition duration-300 hover:shadow-md motion-safe:hover:-translate-y-0.5">
      <div className="relative">
        <ProductImage
          image={product.mainImage}
          sizes="(min-width: 1280px) 22vw, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="transition-transform duration-500 motion-safe:group-hover:scale-[1.04]"
        />
        <ProductBadges productType={product.productType} soldOut={product.soldOut} className="absolute left-2 top-2" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{product.category.name}</p>
        <Heading className="text-base leading-snug sm:text-lg">
          <Link href={`/produk/${product.slug}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            {product.name}
          </Link>
        </Heading>
        {product.productType === "PRE_ORDER" && product.minimumPreorderDays ? (
          <p className="text-xs text-muted-foreground">{preorderLeadTimeText(product.minimumPreorderDays)}</p>
        ) : null}
        <div className="mt-auto pt-1">
          <PriceTag {...product.price} />
          <QuickAddButton
            product={{
              productId: product.id,
              slug: product.slug,
              name: product.name,
              productType: product.productType,
              unitPrice: product.price.effective,
              imageUrl: product.mainImage?.url ?? null,
              maxQuantityPerOrder: product.maxQuantityPerOrder,
              soldOut: product.soldOut,
            }}
          />
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, headingLevel = 3 }: { products: ProductCardData[]; headingLevel?: 2 | 3 }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:gap-5">
      {products.map((product) => (
        <li key={product.slug} className="has-[a:focus-visible]:rounded-card has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus">
          <ProductCard product={product} headingLevel={headingLevel} />
        </li>
      ))}
    </ul>
  );
}
