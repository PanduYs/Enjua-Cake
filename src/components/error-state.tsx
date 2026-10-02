"use client";

import Link from "next/link";

/** Generic failure message (PRD §52, plan §29): no technical details, a reference code for support. */
export function ErrorState({ digest, reset, homeHref = "/" }: { digest?: string; reset: () => void; homeHref?: string }) {
  return (
    <div role="alert" className="mx-auto flex min-h-[50dvh] max-w-xl flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-3xl">Terjadi masalah. Silakan coba lagi.</h1>
      {digest ? (
        <p className="text-sm text-muted-foreground">
          Kode referensi: <span className="font-mono">{digest}</span>
        </p>
      ) : null}
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="min-h-11 rounded-full bg-primary px-6 font-semibold text-primary-foreground">
          Coba Lagi
        </button>
        <Link href={homeHref} className="inline-flex min-h-11 items-center rounded-full border-2 border-primary px-6 font-semibold text-primary">
          Kembali
        </Link>
      </div>
    </div>
  );
}
