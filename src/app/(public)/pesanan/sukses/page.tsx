import type { Metadata } from "next";

import { OrderSuccess } from "@/components/orders/order-success";

import { loadSite } from "../../_lib/site";

export const metadata: Metadata = {
  title: "Pesanan Berhasil",
  robots: { index: false },
};

export default async function OrderSuccessPage() {
  const { settings } = await loadSite();
  return (
    <div className="mx-auto max-w-6xl px-4 py-7 sm:py-14">
      <h1 className="mb-5 text-[2rem] sm:mb-8 sm:text-5xl">Terima Kasih</h1>
      <OrderSuccess whatsappNumber={settings.whatsapp_number} businessName={settings.business_name} />
    </div>
  );
}
