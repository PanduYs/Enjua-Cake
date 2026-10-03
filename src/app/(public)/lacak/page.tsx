import type { Metadata } from "next";
import QRCode from "qrcode";

import { PaymentPanel } from "@/components/orders/payment-panel";
import { TrackingLinkHandler, TrackingLookupForm } from "@/components/orders/tracking-lookup-form";
import { TrackingView } from "@/components/orders/tracking-view";
import { Button } from "@/components/ui/button";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { systemClock } from "@/server/clock";
import { getMockPaymentProvider } from "@/server/payments";
import { readTrackingCookie } from "@/server/security/tracking-cookie";
import { getCustomerPaymentState } from "@/server/services/payments";
import { getTrackingView } from "@/server/services/tracking";

import { loadSite } from "../_lib/site";
import { clearTrackingAction, requestQrisAction, simulateMockPaymentAction, startTransferRemainingAction } from "./actions";

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

  const payment = view && session ? await getCustomerPaymentState(catalog.db, session.orderId, systemClock) : null;
  const qrDataUrl = payment?.activeQris ? await QRCode.toDataURL(payment.activeQris.qrString, { margin: 1, width: 480, errorCorrectionLevel: "M" }) : null;
  // The raw QR payload stays on the server; the client only gets the rendered image.
  const clientPayment = payment ? { ...payment, activeQris: payment.activeQris ? { ...payment.activeQris, qrString: "" } : null } : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-7 sm:py-14">
      <h1 className="text-[2rem] sm:text-5xl">Lacak Pesanan</h1>
      {view ? (
        <>
          <TrackingLinkHandler />
          <TrackingView
            view={view}
            whatsapp={{
              question: wa("order"),
              cancellation: terminal ? null : wa("cancellation"),
            }}
            paymentSlot={
              clientPayment ? (
                <PaymentPanel
                  state={clientPayment}
                  statusKey={`${view.orderStatus}/${view.paymentStatus}`}
                  qrDataUrl={qrDataUrl}
                  requestQris={requestQrisAction}
                  startTransferRemaining={startTransferRemainingAction}
                  simulate={getMockPaymentProvider() ? simulateMockPaymentAction : null}
                />
              ) : null
            }
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
