import type { Metadata } from "next";

import { TrackingLinkHandler, TrackingLookupForm } from "@/components/orders/tracking-lookup-form";
import { TrackingView } from "@/components/orders/tracking-view";
import { Button } from "@/components/ui/button";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { systemClock } from "@/server/clock";
import { readTrackingCookie } from "@/server/security/tracking-cookie";
import { getTrackingView } from "@/server/services/tracking";

import { loadSite } from "../_lib/site";
import { clearTrackingAction } from "./actions";

export const metadata: Metadata = {
  title: "Lacak Pesanan",
  robots: { index: false },
};

export default async function TrackingPage() {
  const { settings, catalog } = await loadSite();
  const session = await readTrackingCookie();
  const view = session ? await getTrackingView(catalog.db, session, systemClock) : null;

  const wa = (kind: "order" | "cancellation") =>
    view && settings.whatsapp_number ? buildWhatsAppLink(settings.whatsapp_number, { kind, orderNumber: view.orderNumber }, settings.business_name) : null;
  const terminal = view?.orderStatus === "COMPLETED" || view?.orderStatus === "CANCELLED";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:py-14">
      <h1 className="text-4xl sm:text-5xl">Lacak Pesanan</h1>
      {view ? (
        <>
          <TrackingLinkHandler />
          <TrackingView
            view={view}
            whatsapp={{
              question: wa("order"),
              cancellation: terminal ? null : wa("cancellation"),
            }}
          />
          <form action={clearTrackingAction}>
            <Button type="submit" variant="secondary">
              Lacak pesanan lain
            </Button>
          </form>
        </>
      ) : (
        <>
          <p className="text-muted-foreground">Masukkan nomor pesanan dan kode akses yang Anda terima saat membuat pesanan.</p>
          <TrackingLookupForm />
        </>
      )}
    </div>
  );
}
