"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import type { FormState } from "@/lib/validation/admin-auth";

import { CheckboxField, FileField, FormMessage, TextAreaField } from "./fields";
import { submitWithoutReset } from "./submit";

export function CategoryForm({
  action,
  category,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  category?: { id: string; name: string; slug: string; description: string | null; sortOrder: number; isActive: boolean };
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" } as FormState);
  const prefix = category ? `cat-${category.id}` : "cat-new";
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    // A new category was created: clear the "add" form for the next one.
    if (!category && state.status === "success") formRef.current?.reset();
  }, [state, category]);
  const v = (key: string, fallback: string) => state.values?.[key] ?? fallback;
  return (
    <form ref={formRef} onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-3" noValidate>
      {category ? <input type="hidden" name="categoryId" value={category.id} /> : null}
      <FormMessage state={state} />
      <TextField label="Nama kategori" name="name" id={`${prefix}-name`} defaultValue={v("name", category?.name ?? "")} required error={state.fieldErrors?.name} />
      <TextField label="Slug (opsional)" name="slug" id={`${prefix}-slug`} defaultValue={v("slug", category?.slug ?? "")} error={state.fieldErrors?.slug} hint="Kosongkan agar dibuat otomatis." />
      <TextAreaField label="Deskripsi (opsional)" name="description" id={`${prefix}-description`} defaultValue={v("description", category?.description ?? "")} rows={2} error={state.fieldErrors?.description} />
      <TextField label="Urutan tampil" name="sortOrder" id={`${prefix}-sort`} inputMode="numeric" defaultValue={v("sortOrder", String(category?.sortOrder ?? 0))} error={state.fieldErrors?.sortOrder} />
      <FileField label="Gambar kategori (opsional)" name="image" id={`${prefix}-image`} accept="image/jpeg,image/png,image/webp" error={state.fieldErrors?.image} hint="Bila kosong, kartu kategori memakai foto produk di kategori ini." />
      <CheckboxField label="Aktif (tampil di website)" name="isActive" id={`${prefix}-active`} defaultChecked={state.values ? state.values.isActive === "on" : (category?.isActive ?? true)} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Menyimpan…" : category ? "Simpan Kategori" : "Tambah Kategori"}
      </Button>
    </form>
  );
}
