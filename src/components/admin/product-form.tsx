"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { PRODUCT_DESCRIPTION_MAX, PRODUCT_NAME_MAX } from "@/lib/validation/admin-catalog";
import type { FormState } from "@/lib/validation/admin-auth";

import { CheckboxField, FileField, FormMessage, SelectField, TextAreaField } from "./fields";
import { submitWithoutReset } from "./submit";

export interface ProductFormDefaults {
  productId?: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  price: string;
  salePrice: string;
  productType: "READY_STOCK" | "PRE_ORDER";
  minimumPreorderDays: string;
  availability: "AVAILABLE" | "SOLD_OUT";
  maxQuantityPerOrder: string;
  isFeatured: boolean;
  isActive: boolean;
}

/** Product create/edit form (Design §21): grouped, not crowded; Pre-Order days only for Pre-Order. */
export function ProductForm({
  action,
  defaults,
  categories,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  defaults: ProductFormDefaults;
  categories: Array<{ id: string; name: string; isActive: boolean }>;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" } as FormState);
  const [productType, setProductType] = useState(defaults.productType);
  const errors = state.fieldErrors ?? {};
  const value = (key: keyof ProductFormDefaults) => (state.values?.[key] ?? String(defaults[key] ?? "")) as string;
  const isNew = !defaults.productId;

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-6" noValidate>
      {defaults.productId ? <input type="hidden" name="productId" value={defaults.productId} /> : null}
      <FormMessage state={state} />

      <fieldset className="flex flex-col gap-4 rounded-card bg-surface p-5">
        <legend className="float-left mb-2 w-full font-heading text-xl">Informasi Produk</legend>
        <div className="clear-both flex flex-col gap-4">
          <TextField label="Nama produk" name="name" defaultValue={value("name")} maxLength={PRODUCT_NAME_MAX} required error={errors.name} />
          <TextField label="Slug (opsional)" name="slug" defaultValue={value("slug")} error={errors.slug} hint="Kosongkan agar dibuat otomatis dari nama. Dipakai di alamat halaman produk." />
          <TextAreaField label="Deskripsi" name="description" defaultValue={value("description")} maxLength={PRODUCT_DESCRIPTION_MAX} rows={5} error={errors.description} />
          <SelectField label="Kategori" name="categoryId" defaultValue={value("categoryId")} required error={errors.categoryId}>
            <option value="">Pilih kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.isActive ? "" : " (nonaktif)"}
              </option>
            ))}
          </SelectField>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-card bg-surface p-5">
        <legend className="float-left mb-2 w-full font-heading text-xl">Harga</legend>
        <div className="clear-both grid gap-4 sm:grid-cols-2">
          <TextField label="Harga normal (Rp)" name="price" inputMode="numeric" defaultValue={value("price")} required error={errors.price} />
          <TextField label="Harga sale (Rp, opsional)" name="salePrice" inputMode="numeric" defaultValue={value("salePrice")} error={errors.salePrice} hint="Kosongkan untuk menghapus harga sale." />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-card bg-surface p-5">
        <legend className="float-left mb-2 w-full font-heading text-xl">Tipe & Ketersediaan</legend>
        <div className="clear-both grid gap-4 sm:grid-cols-2">
          <SelectField label="Tipe produk" name="productType" value={productType} onChange={(e) => setProductType(e.target.value as ProductFormDefaults["productType"])} error={errors.productType}>
            <option value="READY_STOCK">Ready Stock</option>
            <option value="PRE_ORDER">Pre-Order</option>
          </SelectField>
          {productType === "PRE_ORDER" ? (
            <TextField label="Minimum hari Pre-Order" name="minimumPreorderDays" inputMode="numeric" defaultValue={value("minimumPreorderDays")} required error={errors.minimumPreorderDays} />
          ) : (
            <input type="hidden" name="minimumPreorderDays" value="" />
          )}
          <SelectField label="Availability" name="availability" defaultValue={value("availability")} error={errors.availability} hint="Sold Out tetap tampil di website tetapi tidak dapat dibeli.">
            <option value="AVAILABLE">Tersedia</option>
            <option value="SOLD_OUT">Sold Out</option>
          </SelectField>
          <TextField
            label="Maksimal quantity per order (opsional)"
            name="maxQuantityPerOrder"
            inputMode="numeric"
            defaultValue={value("maxQuantityPerOrder")}
            error={errors.maxQuantityPerOrder}
            hint="Kosongkan bila tidak dibatasi."
          />
        </div>
        <div className="flex flex-wrap gap-x-8">
          <CheckboxField label="Featured di beranda" name="isFeatured" defaultChecked={state.values ? state.values.isFeatured === "on" : defaults.isFeatured} />
          <CheckboxField label="Aktif (tampil di website)" name="isActive" defaultChecked={state.values ? state.values.isActive === "on" : defaults.isActive} />
        </div>
      </fieldset>

      {isNew ? (
        <fieldset className="flex flex-col gap-4 rounded-card bg-surface p-5">
          <legend className="float-left mb-2 w-full font-heading text-xl">Foto Utama</legend>
          <div className="clear-both flex flex-col gap-4">
            <FileField label="Foto utama" name="mainImage" accept="image/jpeg,image/png,image/webp" required error={errors.mainImage} hint="JPG, PNG, atau WebP, maksimal 8 MB. Foto tambahan dapat diunggah setelah produk disimpan." />
            <TextField label="Teks alternatif foto" name="mainImageAlt" defaultValue={state.values?.mainImageAlt ?? ""} required error={errors.mainImageAlt} hint="Deskripsi singkat isi foto untuk pembaca layar." />
          </div>
        </fieldset>
      ) : null}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Menyimpan…" : isNew ? "Simpan Produk" : "Simpan Perubahan"}
      </Button>
    </form>
  );
}
