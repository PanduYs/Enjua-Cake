import type { Metadata } from "next";

import { CheckoutForm } from "@/components/checkout/checkout-form";

import { pickupAvailabilityAction, placeOrderAction, previewCheckoutAction } from "../_actions/checkout";
import { loadSite } from "../_lib/site";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage() {
  const { settings } = await loadSite();
  return (
    <div className="mx-auto max-w-6xl px-4 py-7 sm:py-14">
      <h1 className="mb-5 text-[2rem] sm:mb-8 sm:text-5xl">Checkout</h1>
      <CheckoutForm
        loadAvailability={pickupAvailabilityAction}
        preview={previewCheckoutAction}
        placeOrder={placeOrderAction}
        pickupInfo={{ address: settings.address, pickupHours: settings.pickup_hours, pickupInstructions: settings.pickup_instructions }}
      />
    </div>
  );
}
