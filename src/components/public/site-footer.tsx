import Link from "next/link";

import { navItems } from "@/lib/copy/public";

import { BrushEdge } from "./brush-edge";

export interface FooterSettings {
  business_name: string;
  business_description: string | null;
  address: string | null;
  operating_hours: string | null;
  pickup_hours: string | null;
  social_links: Array<{ label: string; url: string }>;
  policy_links: Array<{ label: string; url: string }>;
}

/**
 * Footer (FD-97): navigation, contact, address, pickup info, social, policies — each
 * shown only when provided. No shipping policy (pickup only, FD-98).
 */
export function SiteFooter({ settings, whatsAppHref, year }: { settings: FooterSettings; whatsAppHref: string | null; year: number }) {
  return (
    <footer className="mt-4 text-accent sm:mt-8">
      <BrushEdge position="top" />
      <div className="bg-accent text-accent-foreground">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-2 sm:gap-8 sm:py-12 lg:grid-cols-4">
          <div>
            <p className="font-heading text-2xl">{settings.business_name}</p>
            {settings.business_description ? <p className="mt-3 text-sm">{settings.business_description}</p> : null}
          </div>
          <nav aria-label="Navigasi footer">
            <h2 className="mb-3 text-lg">Navigasi</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="underline-offset-4 hover:underline">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {settings.address || settings.pickup_hours || settings.operating_hours || whatsAppHref ? (
          <div>
            <h2 className="mb-3 text-lg">Pickup &amp; Kontak</h2>
            <dl className="flex flex-col gap-2 text-sm">
              {settings.address ? (
                <div>
                  <dt className="font-semibold">Alamat pickup</dt>
                  <dd>{settings.address}</dd>
                </div>
              ) : null}
              {settings.pickup_hours ? (
                <div>
                  <dt className="font-semibold">Jam pickup</dt>
                  <dd>{settings.pickup_hours}</dd>
                </div>
              ) : null}
              {settings.operating_hours ? (
                <div>
                  <dt className="font-semibold">Jam operasional</dt>
                  <dd>{settings.operating_hours}</dd>
                </div>
              ) : null}
              {whatsAppHref ? (
                <div>
                  <dt className="font-semibold">WhatsApp</dt>
                  <dd>
                    <a href={whatsAppHref} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                      Hubungi kami via WhatsApp
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
          ) : null}
          {settings.social_links.length > 0 || settings.policy_links.length > 0 ? (
            <div className="flex flex-col gap-6">
              {settings.social_links.length > 0 ? (
                <div>
                  <h2 className="mb-3 text-lg">Media Sosial</h2>
                  <ul className="flex flex-col gap-2 text-sm">
                    {settings.social_links.map((link) => (
                      <li key={link.url}>
                        <a href={link.url} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {settings.policy_links.length > 0 ? (
                <div>
                  <h2 className="mb-3 text-lg">Informasi</h2>
                  <ul className="flex flex-col gap-2 text-sm">
                    {settings.policy_links.map((link) => (
                      <li key={link.url}>
                        <a href={link.url} className="underline-offset-4 hover:underline">
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <p className="border-t border-accent-foreground/20 px-4 py-4 text-center text-xs">
          © {year} {settings.business_name}
        </p>
      </div>
    </footer>
  );
}
