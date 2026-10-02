"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

const MESSAGES = {
  INVALID: "Nomor pesanan atau kode akses tidak cocok.",
  RATE_LIMITED: "Terlalu banyak percobaan. Coba lagi dalam beberapa menit.",
  NETWORK: "Tidak dapat terhubung. Periksa koneksi lalu coba lagi.",
} as const;

/** Reads `#o=…&t=…` from a tracking link, then removes it from the address bar (TD-11). */
function readFragment(): { orderNumber: string; token: string } | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const orderNumber = params.get("o");
  const token = params.get("t");
  if (!orderNumber && !token) return null;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return { orderNumber: orderNumber ?? "", token: token ?? "" };
}

/**
 * Handles a tracking link on load and when only the fragment changes (a link
 * opened while already on /lacak does not reload the page).
 */
function useTrackingLink(onLink: (values: { orderNumber: string; token: string }) => void) {
  const latest = useRef(onLink);
  useEffect(() => {
    latest.current = onLink;
  });
  useEffect(() => {
    const handle = () => {
      const fromLink = readFragment();
      if (fromLink) latest.current(fromLink);
    };
    handle();
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, []);
}

function useTrackingVerify() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify(values: { orderNumber: string; token: string }) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
        cache: "no-store",
      });
      const result = (await response.json().catch(() => ({ ok: false, code: "INVALID" }))) as {
        ok: boolean;
        code?: keyof typeof MESSAGES;
      };
      if (result.ok) {
        router.refresh();
        return;
      }
      setError(MESSAGES[result.code ?? "INVALID"] ?? MESSAGES.INVALID);
    } catch {
      setError(MESSAGES.NETWORK);
    }
    setPending(false);
  }

  return { pending, error, verify };
}

/** Rendered while a session is open, so a tracking link for another order still switches to it. */
export function TrackingLinkHandler() {
  const { pending, error, verify } = useTrackingVerify();
  useTrackingLink((fromLink) => void verify(fromLink));
  if (error)
    return (
      <p role="alert" className="rounded-control border border-danger bg-surface px-4 py-3 text-sm font-medium text-danger">
        {error}
      </p>
    );
  return pending ? <p role="status">Memeriksa…</p> : null;
}

export function TrackingLookupForm() {
  const [orderNumber, setOrderNumber] = useState("");
  const [token, setToken] = useState("");
  const { pending, error, verify } = useTrackingVerify();
  useTrackingLink((fromLink) => {
    setOrderNumber(fromLink.orderNumber);
    setToken(fromLink.token);
    void verify(fromLink);
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void verify({ orderNumber, token });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-card bg-surface p-5 sm:p-6" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="order-number" className="font-semibold">
          Nomor Pesanan
        </label>
        <input
          id="order-number"
          name="orderNumber"
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          placeholder="ENC-20261002-AB12"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          className="min-h-11 rounded-control border border-border bg-background px-3 font-mono"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tracking-token" className="font-semibold">
          Kode Akses
        </label>
        <input
          id="tracking-token"
          name="token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          required
          aria-describedby="tracking-token-help"
          className="min-h-11 rounded-control border border-border bg-background px-3 font-mono"
        />
        <p id="tracking-token-help" className="text-sm text-muted-foreground">
          Kode akses ditampilkan saat pesanan dibuat. Hubungi kami via WhatsApp jika kode hilang.
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded-control border border-danger bg-background px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending || !orderNumber.trim() || !token.trim()}>
        {pending ? "Memeriksa…" : "Lacak Pesanan"}
      </Button>
    </form>
  );
}
