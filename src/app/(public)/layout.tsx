import type { ReactNode } from "react";

import { FloatingWhatsApp } from "@/components/public/floating-whatsapp";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";

import { loadSite } from "./_lib/site";

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const { settings, whatsAppHref, currentYear } = await loadSite();
  return (
    <>
      <a
        href="#konten"
        className="sr-only z-[60] rounded-control bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Lewati ke konten
      </a>
      <SiteHeader businessName={settings.business_name} />
      <main id="konten" tabIndex={-1} className="focus:outline-none">
        {children}
      </main>
      <SiteFooter settings={settings} whatsAppHref={whatsAppHref} year={currentYear} />
      {whatsAppHref ? <FloatingWhatsApp href={whatsAppHref} /> : null}
    </>
  );
}
