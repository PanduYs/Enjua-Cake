import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminSession } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getProofFile } from "@/server/services/payment-admin";
import { getStorage } from "@/server/storage";

/** Private payment proofs, admins only (FD-51, §24): attachment, nosniff, verified type. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ ok: false }, { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ ok: false }, { status: 404 });
  const meta = await getProofFile(getDb(), id);
  const object = meta ? await getStorage().private.get(meta.storageKey) : null;
  if (!meta || !object) return NextResponse.json({ ok: false }, { status: 404 });
  const extension = meta.storageKey.split(".").pop();
  return new Response(Buffer.from(object.body), {
    headers: {
      "Content-Type": meta.mimeType,
      "Content-Length": String(object.size),
      "Content-Disposition": `attachment; filename="bukti-${id}.${extension}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
