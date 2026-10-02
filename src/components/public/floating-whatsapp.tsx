import { ChatIcon } from "./icons";

/** Floating contact (FD-75). Sits above the bottom edge so it never covers sticky CTAs. */
export function FloatingWhatsApp({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed right-4 bottom-4 z-40 flex min-h-12 items-center gap-2 rounded-full bg-primary px-4 font-semibold text-primary-foreground shadow-lg hover:opacity-90 sm:right-6 sm:bottom-6"
    >
      <ChatIcon />
      <span>
        WhatsApp<span className="sr-only"> (membuka aplikasi WhatsApp)</span>
      </span>
    </a>
  );
}
