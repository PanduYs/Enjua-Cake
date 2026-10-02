"use server";

import { systemClock } from "@/server/clock";
import { getDb } from "@/server/db/client";
import { getPickupAvailability, previewCheckout, validateCart, type CheckoutDeps } from "@/server/services/checkout";
import { getStorage } from "@/server/storage";

/** Thin wrappers: all validation and pricing happen in the checkout service. */
function deps(): CheckoutDeps {
  return { db: getDb(), clock: systemClock, publicBucket: getStorage().public };
}

export async function validateCartAction(lines: unknown) {
  return validateCart(deps(), lines);
}

export async function pickupAvailabilityAction(lines: unknown) {
  const result = await getPickupAvailability(deps(), lines);
  return { cutoff: result.cutoff, earliestDate: result.window.earliestDate, latestDate: result.window.latestDate, today: result.window.today, dates: result.dates };
}

export async function previewCheckoutAction(input: unknown) {
  return previewCheckout(deps(), input);
}
