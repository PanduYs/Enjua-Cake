"use client";

import "./globals.css";

import { ErrorState } from "@/components/error-state";

/** Last-resort boundary when the root layout itself fails. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="id">
      <body className="min-h-dvh antialiased">
        <main>
          <ErrorState digest={error.digest} reset={reset} />
        </main>
      </body>
    </html>
  );
}
