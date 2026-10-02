import { getStorage } from "@/server/storage";
import { isStorageKeyError } from "@/server/storage/types";

/**
 * Serves the PUBLIC bucket for the local storage driver (product/category images).
 * Private objects (payment proofs) are never reachable here (FD-51).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  try {
    const object = await getStorage().public.get(key.join("/"));
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(Buffer.from(object.body), {
      headers: {
        "content-type": object.contentType,
        "content-length": String(object.size),
        // Keys are random UUIDs and never reused, so objects are immutable.
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (isStorageKeyError(error)) return new Response("Not found", { status: 404 });
    throw error;
  }
}
