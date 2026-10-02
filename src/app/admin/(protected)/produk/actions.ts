"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { FormState } from "@/lib/validation/admin-auth";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import {
  addProductImage,
  createProduct,
  deleteCategory,
  deleteProduct,
  deleteProductImage,
  saveCategory,
  setMainProductImage,
  updateProduct,
  updateProductImageAlt,
} from "@/server/services/admin-catalog";
import { getStorage } from "@/server/storage";

const deps = () => ({ db: getDb(), publicBucket: getStorage().public });
const uuid = z.uuid();

const PRODUCT_FIELDS = ["name", "slug", "description", "categoryId", "price", "salePrice", "productType", "minimumPreorderDays", "availability", "maxQuantityPerOrder"] as const;

function productInput(fd: FormData) {
  const input: Record<string, unknown> = {};
  for (const key of PRODUCT_FIELDS) input[key] = String(fd.get(key) ?? "");
  input.isFeatured = fd.get("isFeatured") === "on";
  input.isActive = fd.get("isActive") === "on";
  return input;
}
/** Echo text values so React's post-action form reset does not wipe the admin's input. */
const echo = (fd: FormData, keys: readonly string[]): Record<string, string> => ({
  ...Object.fromEntries(keys.map((k) => [k, String(fd.get(k) ?? "")])),
  isFeatured: fd.get("isFeatured") === "on" ? "on" : "",
  isActive: fd.get("isActive") === "on" ? "on" : "",
});

async function fileBytes(fd: FormData, key: string): Promise<Uint8Array> {
  const file = fd.get(key);
  return file instanceof File ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array();
}

/** Public pages read the catalog per request; revalidate anyway so any cached output refreshes (§9). */
function refreshCatalog(productId?: string) {
  revalidatePath("/", "layout");
  revalidatePath("/admin/produk");
  if (productId) revalidatePath(`/admin/produk/${productId}`);
}

const NOT_FOUND: FormState = { status: "error", message: "Data tidak ditemukan. Muat ulang halaman." };

export async function createProductAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const result = await createProduct(deps(), { input: productInput(fd), mainImage: await fileBytes(fd, "mainImage"), mainImageAlt: fd.get("mainImageAlt") ?? "", adminId: admin.adminId });
  if (!result.ok) {
    return { status: "error", message: "Periksa kembali data produk.", fieldErrors: result.fieldErrors, values: { ...echo(fd, PRODUCT_FIELDS), mainImageAlt: String(fd.get("mainImageAlt") ?? "") } };
  }
  refreshCatalog(result.productId);
  redirect(`/admin/produk/${result.productId}?dibuat=1`);
}

export async function updateProductAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const productId = uuid.safeParse(fd.get("productId"));
  if (!productId.success) return NOT_FOUND;
  const result = await updateProduct(deps(), { productId: productId.data, input: productInput(fd), adminId: admin.adminId });
  if (!result.ok) {
    if (result.error === "NOT_FOUND") return NOT_FOUND;
    return { status: "error", message: "Periksa kembali data produk.", fieldErrors: result.fieldErrors, values: echo(fd, PRODUCT_FIELDS) };
  }
  refreshCatalog(productId.data);
  return { status: "success", message: "Produk disimpan.", values: echo(fd, PRODUCT_FIELDS) };
}

export async function deleteProductAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const productId = uuid.safeParse(fd.get("productId"));
  if (!productId.success) return NOT_FOUND;
  const result = await deleteProduct(deps(), { productId: productId.data, adminId: admin.adminId });
  if (!result.ok) {
    return result.error === "HAS_ORDERS"
      ? { status: "error", message: "Produk sudah pernah dipesan sehingga tidak dapat dihapus. Nonaktifkan produk agar tidak tampil di website." }
      : NOT_FOUND;
  }
  refreshCatalog();
  redirect("/admin/produk?dihapus=1");
}

export async function addProductImageAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const productId = uuid.safeParse(fd.get("productId"));
  if (!productId.success) return NOT_FOUND;
  const result = await addProductImage(deps(), {
    productId: productId.data,
    bytes: await fileBytes(fd, "image"),
    altText: fd.get("altText") ?? "",
    makeMain: fd.get("makeMain") === "on",
    adminId: admin.adminId,
  });
  if (!result.ok) return { status: "error", message: "Foto belum ditambahkan.", fieldErrors: result.fieldErrors, values: { altText: String(fd.get("altText") ?? "") } };
  refreshCatalog(productId.data);
  return { status: "success", message: "Foto ditambahkan." };
}

export async function productImageAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const imageId = uuid.safeParse(fd.get("imageId"));
  const productId = uuid.safeParse(fd.get("productId"));
  if (!imageId.success || !productId.success) return NOT_FOUND;
  const intent = fd.get("intent");
  const result =
    intent === "main"
      ? await setMainProductImage(deps(), { imageId: imageId.data, adminId: admin.adminId })
      : intent === "delete"
        ? await deleteProductImage(deps(), { imageId: imageId.data, adminId: admin.adminId })
        : await updateProductImageAlt(deps(), { imageId: imageId.data, altText: fd.get("altText") ?? "", adminId: admin.adminId });
  if (!result.ok) {
    if (result.error === "LAST_IMAGE") return { status: "error", message: "Produk wajib memiliki satu foto utama. Tambahkan foto lain sebelum menghapus foto ini." };
    if (result.error === "INVALID_INPUT") return { status: "error", message: result.fieldErrors?.altText ?? "Periksa kembali isian." };
    return NOT_FOUND;
  }
  refreshCatalog(productId.data);
  return { status: "success", message: intent === "main" ? "Foto utama diganti." : intent === "delete" ? "Foto dihapus." : "Teks alternatif disimpan." };
}

const CATEGORY_FIELDS = ["name", "slug", "description", "sortOrder"] as const;

export async function saveCategoryAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const rawId = fd.get("categoryId");
  const categoryId = rawId ? uuid.safeParse(rawId) : null;
  if (categoryId && !categoryId.success) return NOT_FOUND;
  const input: Record<string, unknown> = { ...echo(fd, CATEGORY_FIELDS), isActive: fd.get("isActive") === "on" };
  const result = await saveCategory(deps(), { categoryId: categoryId?.data, input, image: await fileBytes(fd, "image"), adminId: admin.adminId });
  if (!result.ok) {
    if (result.error === "NOT_FOUND") return NOT_FOUND;
    return { status: "error", message: "Periksa kembali data kategori.", fieldErrors: result.fieldErrors, values: echo(fd, CATEGORY_FIELDS) };
  }
  revalidatePath("/", "layout");
  revalidatePath("/admin/kategori");
  return { status: "success", message: categoryId ? "Kategori disimpan." : "Kategori ditambahkan.", values: categoryId ? echo(fd, CATEGORY_FIELDS) : {} };
}

export async function deleteCategoryAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const categoryId = uuid.safeParse(fd.get("categoryId"));
  if (!categoryId.success) return NOT_FOUND;
  const result = await deleteCategory(deps(), { categoryId: categoryId.data, adminId: admin.adminId });
  if (!result.ok) {
    return result.error === "HAS_PRODUCTS"
      ? { status: "error", message: "Kategori masih memiliki produk. Pindahkan produknya atau nonaktifkan kategori ini." }
      : NOT_FOUND;
  }
  revalidatePath("/", "layout");
  revalidatePath("/admin/kategori");
  return { status: "success", message: "Kategori dihapus." };
}
