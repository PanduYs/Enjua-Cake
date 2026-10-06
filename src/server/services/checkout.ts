import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { cartLinesSchema, checkoutInputSchema } from "@/lib/validation/checkout";
import type { Clock } from "@/server/clock";
import type { Database } from "@/server/db/client";
import { categories, productImages, products } from "@/server/db/schema";
import { displayPrice, type DisplayPrice } from "@/server/domain/catalog/pricing";
import { validateCartLines, type CartLineIssue, type ProductFacts } from "@/server/domain/checkout/cart-items";
import { paymentBreakdown, validatePaymentSelection, type PaymentBreakdown, type PaymentMethod, type PaymentOption } from "@/server/domain/checkout/payment-rules";
import {
  datesInWindow,
  evaluatePickupDate,
  maxPreorderDays,
  pickupWindow,
  type PickupDateReason,
  type PickupDateStatus,
  type PickupWindow,
} from "@/server/domain/checkout/pickup-date";
import { computeTotals, type OrderTotals } from "@/server/domain/checkout/totals";
import { compareIsoDates, parseIsoDate, type IsoDate } from "@/server/domain/time/wib";
import type { PublicBucket } from "@/server/storage/types";

import { capacityFactsForDates } from "./capacity";
import { getSettings, type Settings } from "./settings";

export interface CheckoutDeps {
  db: Database;
  clock: Clock;
  publicBucket: Pick<PublicBucket, "publicUrl">;
}

interface CartProductRow extends ProductFacts {
  slug: string;
  name: string;
  price: number;
  salePrice: number | null;
  productType: "READY_STOCK" | "PRE_ORDER";
  minimumPreorderDays: number | null;
  imageKey: string | null;
  imageAlt: string | null;
}

/** Current product data from the database — never from the browser (FD-32). */
async function loadCartProducts(db: Database, productIds: string[]): Promise<Map<string, CartProductRow>> {
  if (productIds.length === 0) return new Map();
  const [rows, images] = await Promise.all([
    db
      .select({
        id: products.id,
        slug: products.slug,
        name: products.name,
        price: products.price,
        salePrice: products.salePrice,
        productType: products.productType,
        minimumPreorderDays: products.minimumPreorderDays,
        availability: products.availability,
        isActive: products.isActive,
        categoryActive: categories.isActive,
        maxQuantityPerOrder: products.maxQuantityPerOrder,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(inArray(products.id, productIds)),
    // Looked up by the requested ids, so it does not wait for the product rows.
    db
      .select({ productId: productImages.productId, key: productImages.storageKey, alt: productImages.altText })
      .from(productImages)
      .where(and(inArray(productImages.productId, productIds), eq(productImages.isMain, true)))
      .orderBy(desc(productImages.isMain), asc(productImages.sortOrder)),
  ]);
  const mainImage = new Map(images.map((i) => [i.productId, i]));
  return new Map(
    rows.map((r) => [r.id, { ...r, imageKey: mainImage.get(r.id)?.key ?? null, imageAlt: mainImage.get(r.id)?.alt ?? null }]),
  );
}

export interface CartLineView {
  productId: string;
  quantity: number;
  issue: CartLineIssue | null;
  product: {
    slug: string;
    name: string;
    productType: "READY_STOCK" | "PRE_ORDER";
    minimumPreorderDays: number | null;
    soldOut: boolean;
    maxQuantityPerOrder: number | null;
    price: DisplayPrice;
    image: { url: string; alt: string } | null;
  } | null;
}

export interface CartValidation {
  lines: CartLineView[];
  /** Totals over valid lines only; authoritative only at order creation. */
  totals: OrderTotals;
  hasPreorder: boolean;
  canCheckout: boolean;
}

/** Re-validates a browser cart against current data (EC-07, EC-08, EC-15). */
export async function validateCart(deps: CheckoutDeps, rawLines: unknown): Promise<CartValidation> {
  return (await validateCartWithFacts(deps, rawLines)).validation;
}

/** Product facts snapshotted into an order — the same read that validated and priced the cart. */
export type OrderProductFacts = Map<string, { price: number; salePrice: number | null; productType: "READY_STOCK" | "PRE_ORDER"; minimumPreorderDays: number | null }>;

async function validateCartWithFacts(deps: CheckoutDeps, rawLines: unknown): Promise<{ validation: CartValidation; productMap: Map<string, CartProductRow> }> {
  const parsed = cartLinesSchema.safeParse(rawLines);
  if (!parsed.success) {
    return { validation: { lines: [], totals: { lines: [], subtotal: 0, discountTotal: 0, grandTotal: 0 }, hasPreorder: false, canCheckout: false }, productMap: new Map() };
  }
  const lines = parsed.data;
  const productMap = await loadCartProducts(deps.db, [...new Set(lines.map((l) => l.productId))]);
  const issues = validateCartLines(lines, productMap);

  const views: CartLineView[] = lines.map((line) => {
    const p = productMap.get(line.productId);
    const visible = p && p.isActive && p.categoryActive;
    return {
      productId: line.productId,
      quantity: line.quantity,
      issue: issues.get(line.productId) ?? null,
      product: visible
        ? {
            slug: p.slug,
            name: p.name,
            productType: p.productType,
            minimumPreorderDays: p.minimumPreorderDays,
            soldOut: p.availability === "SOLD_OUT",
            maxQuantityPerOrder: p.maxQuantityPerOrder,
            price: displayPrice({ price: p.price, salePrice: p.salePrice }),
            image: p.imageKey ? { url: deps.publicBucket.publicUrl(p.imageKey), alt: p.imageAlt ?? p.name } : null,
          }
        : null,
    };
  });

  const valid = views.filter((v) => v.issue === null);
  let totals: OrderTotals;
  try {
    totals = computeTotals(
      valid.map((v) => {
        const p = productMap.get(v.productId)!;
        return { productId: v.productId, quantity: v.quantity, price: p.price, salePrice: p.salePrice };
      }),
    );
  } catch (error) {
    if (!(error instanceof Error && error.name === "TotalsOverflowError")) throw error;
    return {
      validation: { lines: views.map((v) => ({ ...v, issue: v.issue ?? "INVALID_QUANTITY" })), totals: { lines: [], subtotal: 0, discountTotal: 0, grandTotal: 0 }, hasPreorder: false, canCheckout: false },
      productMap,
    };
  }

  return {
    validation: {
      lines: views,
      totals,
      hasPreorder: valid.some((v) => v.product?.productType === "PRE_ORDER"),
      canCheckout: valid.length > 0 && valid.length === views.length,
    },
    productMap,
  };
}

export interface PickupAvailability {
  window: PickupWindow;
  cutoff: string;
  dates: PickupDateStatus[];
}

async function availabilityFor(
  deps: CheckoutDeps,
  items: ReadonlyArray<{ productType: "READY_STOCK" | "PRE_ORDER"; minimumPreorderDays: number | null }>,
  settings: Settings,
): Promise<PickupAvailability> {
  const now = deps.clock.now();
  const window = pickupWindow({
    now,
    cutoff: settings.pickup_cutoff,
    bookingHorizonDays: settings.booking_horizon_days,
    maxPreorderDays: maxPreorderDays(items),
  });
  const dates = datesInWindow(window);
  const facts = await capacityFactsForDates(deps.db, dates, settings.default_capacity, now);
  return {
    window,
    cutoff: settings.pickup_cutoff,
    dates: dates.map((date) => evaluatePickupDate(date, window, facts.get(date)!)),
  };
}

/** Selectable pickup dates for the current cart, each with a reason when unavailable (PRD §7.1). */
export async function getPickupAvailability(deps: CheckoutDeps, rawLines: unknown): Promise<PickupAvailability> {
  const parsed = cartLinesSchema.safeParse(rawLines);
  // Settings do not depend on the cart: read both at once.
  const [productMap, settings] = await Promise.all([
    parsed.success ? loadCartProducts(deps.db, parsed.data.map((l) => l.productId)) : new Map<string, CartProductRow>(),
    getSettings(deps.db),
  ]);
  return availabilityFor(deps, [...productMap.values()], settings);
}

export interface CheckoutSummary {
  customerName: string;
  whatsapp: string;
  notes: string | null;
  pickupDate: IsoDate;
  paymentMethod: PaymentMethod;
  paymentOption: PaymentOption;
  hasPreorder: boolean;
  /** `unitPrice` is the normal price, shown struck through when a sale price applies. */
  lines: Array<{ productId: string; name: string; quantity: number; unitPrice: number; effectiveUnitPrice: number; lineSubtotal: number; productType: "READY_STOCK" | "PRE_ORDER" }>;
  subtotal: number;
  discountTotal: number;
  payment: PaymentBreakdown;
}

export type CheckoutPreviewResult =
  | { ok: true; summary: CheckoutSummary }
  | { ok: false; fieldErrors: Partial<Record<string, string>>; cartIssues?: Array<{ productId: string; issue: CartLineIssue }>; pickupReason?: PickupDateReason };

const firstErrors = (error: z.ZodError) => {
  const out: Partial<Record<string, string>> = {};
  for (const issue of error.issues) out[String(issue.path[0] ?? "form")] ??= issue.message;
  return out;
};

/**
 * Everything except pickup-date availability: input, cart (prices from the DB),
 * and payment rules (FD-39–FD-44). Shared by website checkout and Manual Order,
 * which applies the same rules (FD-110) before its own date evaluation.
 */
export async function prepareCheckout(
  deps: CheckoutDeps,
  rawInput: unknown,
): Promise<{ ok: true; summary: CheckoutSummary; productFacts: OrderProductFacts } | Extract<CheckoutPreviewResult, { ok: false }>> {
  const parsed = checkoutInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, fieldErrors: firstErrors(parsed.error) };
  const input = parsed.data;

  const { validation: cart, productMap } = await validateCartWithFacts(deps, input.items);
  const cartIssues = cart.lines.filter((l) => l.issue).map((l) => ({ productId: l.productId, issue: l.issue! }));
  if (!cart.canCheckout) {
    return { ok: false, fieldErrors: { items: "Periksa kembali isi keranjang." }, cartIssues };
  }

  const paymentError = validatePaymentSelection(input.paymentMethod, input.paymentOption, cart.hasPreorder);
  if (paymentError === "CASH_NOT_ALLOWED_FOR_PREORDER") {
    return { ok: false, fieldErrors: { paymentMethod: "Cash hanya tersedia untuk pesanan Ready Stock." } };
  }
  if (paymentError === "OPTION_NOT_ALLOWED_FOR_METHOD") {
    return { ok: false, fieldErrors: { paymentOption: "Cash saat pickup hanya untuk pembayaran penuh." } };
  }

  let pickupDate: IsoDate;
  try {
    pickupDate = parseIsoDate(input.pickupDate);
  } catch {
    return { ok: false, fieldErrors: { pickupDate: "Pilih tanggal pickup." } };
  }

  const names = new Map(cart.lines.map((l) => [l.productId, l.product!]));
  return {
    ok: true,
    productFacts: new Map(
      cart.lines.map((l) => {
        const p = productMap.get(l.productId)!;
        return [l.productId, { price: p.price, salePrice: p.salePrice, productType: p.productType, minimumPreorderDays: p.minimumPreorderDays }];
      }),
    ),
    summary: {
      customerName: input.customerName,
      whatsapp: input.whatsapp,
      notes: input.notes,
      pickupDate,
      paymentMethod: input.paymentMethod,
      paymentOption: input.paymentOption,
      hasPreorder: cart.hasPreorder,
      lines: cart.totals.lines.map((line) => ({
        productId: line.productId,
        name: names.get(line.productId)!.name,
        productType: names.get(line.productId)!.productType,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        effectiveUnitPrice: line.effectiveUnitPrice,
        lineSubtotal: line.lineSubtotal,
      })),
      subtotal: cart.totals.subtotal,
      discountTotal: cart.totals.discountTotal,
      payment: paymentBreakdown(cart.totals.grandTotal, input.paymentOption),
    },
  };
}

/**
 * Full server-side checkout validation and pricing (PRD §37, IMPLEMENTATION-PLAN §11.1
 * steps 1–6). Read-only: no reservation is made; placeOrder re-checks the date
 * under the pickup-date lock.
 */
export async function previewCheckout(deps: CheckoutDeps, rawInput: unknown): Promise<CheckoutPreviewResult> {
  const result = await validateCheckout(deps, rawInput);
  return result.ok ? { ok: true, summary: result.summary } : result;
}

/**
 * previewCheckout plus the product facts it validated against, so order creation
 * snapshots exactly the data that was checked (no second read that could differ).
 */
export async function validateCheckout(
  deps: CheckoutDeps,
  rawInput: unknown,
): Promise<{ ok: true; summary: CheckoutSummary; productFacts: OrderProductFacts; settings: Settings } | Extract<CheckoutPreviewResult, { ok: false }>> {
  // Settings do not depend on the cart: read them while the cart is validated.
  const [prepared, settings] = await Promise.all([prepareCheckout(deps, rawInput), getSettings(deps.db)]);
  if (!prepared.ok) return prepared;
  const { summary } = prepared;
  const availability = await availabilityFor(deps, [...prepared.productFacts.values()], settings);
  // Dates outside today..horizon are not in the list: before today is a past date, otherwise beyond the horizon.
  const status = availability.dates.find((d) => d.date === summary.pickupDate) ?? {
    date: summary.pickupDate,
    available: false as const,
    reason: compareIsoDates(summary.pickupDate, availability.window.today) < 0 ? ("PAST_DATE" as const) : ("OUTSIDE_HORIZON" as const),
  };
  if (!status.available) {
    return { ok: false, fieldErrors: { pickupDate: "Tanggal ini tidak tersedia. Silakan pilih tanggal lain." }, pickupReason: status.reason };
  }
  return { ...prepared, settings };
}

