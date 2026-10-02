"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import type { FormState } from "@/lib/validation/admin-auth";

import { CheckboxField, FileField, FormMessage } from "./fields";
import { submitWithoutReset } from "./submit";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

function ImageItem({ productId, image, action }: { productId: string; image: { id: string; url: string; altText: string; isMain: boolean }; action: Action }) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" } as FormState);
  return (
    <li className="flex flex-col gap-2 rounded-card border border-border bg-background p-3" data-testid="product-image">
      {/* eslint-disable-next-line @next/next/no-img-element -- small admin preview of an already-optimized WebP */}
      <img src={image.url} alt={image.altText} className="aspect-square w-full rounded-control object-cover" loading="lazy" />
      {image.isMain ? <p className="text-sm font-semibold">Foto utama</p> : null}
      <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-2">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="imageId" value={image.id} />
        <TextField label="Teks alternatif" name="altText" id={`alt-${image.id}`} defaultValue={image.altText} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="intent" value="alt" variant="secondary" disabled={pending}>
            Simpan Teks
          </Button>
          {!image.isMain ? (
            <Button type="submit" name="intent" value="main" variant="secondary" disabled={pending}>
              Jadikan Utama
            </Button>
          ) : null}
          <Button type="submit" name="intent" value="delete" variant="danger" disabled={pending}>
            Hapus
          </Button>
        </div>
        <FormMessage state={state} />
      </form>
    </li>
  );
}

/** Photos: exactly one main photo, zero or more additional ones (FD-22). */
export function ProductImages({
  productId,
  images,
  imageAction,
  addAction,
}: {
  productId: string;
  images: Array<{ id: string; url: string; altText: string; isMain: boolean }>;
  imageAction: Action;
  addAction: Action;
}) {
  const [state, formAction, pending] = useActionState(addAction, { status: "idle" } as FormState);
  const addForm = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") addForm.current?.reset();
  }, [state]);
  return (
    <section aria-labelledby="foto-produk" className="flex flex-col gap-4 rounded-card bg-surface p-5">
      <h2 id="foto-produk" className="text-xl">
        Foto Produk
      </h2>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {images.map((image) => (
          <ImageItem key={image.id} productId={productId} image={image} action={imageAction} />
        ))}
      </ul>
      <form ref={addForm} onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-3 border-t border-border pt-4" noValidate>
        <h3 className="font-semibold">Tambah foto</h3>
        <input type="hidden" name="productId" value={productId} />
        <FileField label="File foto" name="image" id="new-image" accept="image/jpeg,image/png,image/webp" error={state.fieldErrors?.image} hint="JPG, PNG, atau WebP, maksimal 8 MB." />
        <TextField label="Teks alternatif foto" name="altText" id="new-image-alt" defaultValue={state.values?.altText ?? ""} error={state.fieldErrors?.altText} />
        <CheckboxField label="Jadikan foto utama" name="makeMain" id="new-image-main" />
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Mengunggah…" : "Tambah Foto"}
        </Button>
        <FormMessage state={state} />
      </form>
    </section>
  );
}
