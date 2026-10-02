# PRD — Enjua Cake's
## Product Requirements Document

**Document Version:** 1.1  
**Status:** Consolidated — selaras dengan `FINAL-REQUIREMENT-DECISIONS.md`  
**Product:** Enjua Cake's — Online Cake Ordering & Management Website  
**Related documents:** `FINAL-REQUIREMENT-DECISIONS.md`, `PRD-Design.md`, `design-reference/homepage-reference.jpeg`  
**Primary Goal:** Menjadi website penjualan kue yang memungkinkan pelanggan melihat produk, melakukan pemesanan untuk pickup, memilih Ready Stock atau Pre-Order, melakukan pembayaran, dan melacak status pesanan; sekaligus menyediakan dashboard admin untuk mengelola produk, pesanan, pembayaran, dan informasi website.

---

# 1. Ringkasan Produk

Enjua Cake's adalah website penjualan kue untuk pelanggan yang ingin melihat katalog produk, memilih produk, menentukan jumlah, memilih tanggal pengambilan (pickup), melakukan checkout dan pembayaran, serta memantau status pesanan tanpa harus membuat akun.

Sistem juga menyediakan **Admin Dashboard**. Admin dapat mengelola katalog produk, harga, diskon, status Ready Stock/Pre-Order, aturan minimum Pre-Order, pesanan, pembayaran, kapasitas pesanan per tanggal pickup, dan informasi website.

Produk dapat berupa kue Ready Stock maupun Pre-Order. Sistem Pre-Order mempertimbangkan **minimum waktu produksi produk** dan **kapasitas maksimal 10 order per tanggal pickup**.

Sistem pembayaran dirancang agar dapat menggunakan **payment gateway dengan QRIS dinamis** dan mekanisme **webhook** untuk memperbarui status pembayaran secara otomatis. Selama tahap development, payment gateway harus dapat diuji menggunakan sandbox/test environment.

## 1.1 Hubungan dengan Dokumen Lain

- `FINAL-REQUIREMENT-DECISIONS.md` adalah resolution record untuk requirement yang sebelumnya ambigu/bertentangan dan memiliki prioritas tertinggi untuk poin-poin tersebut. Kode keputusan (mis. FD-12) dirujuk di dokumen ini untuk traceability.
- `PRD.md` (dokumen ini) adalah sumber functional requirements dan business rules.
- `PRD-Design.md` adalah sumber visual design, UI/UX, layout, dan responsive behavior.
- `design-reference/homepage-reference.jpeg` adalah inspirasi visual, bukan requirement fungsional dan tidak boleh disalin literal.

## 1.2 Konvensi Waktu dan Mata Uang

- Seluruh aturan tanggal/waktu bisnis menggunakan timezone **Asia/Jakarta (WIB)** (FD-09).
- Seluruh nilai uang disimpan sebagai **integer Rupiah** (FD-43).
- Bahasa utama UI customer dan admin adalah **Bahasa Indonesia** (FD-91).

---

# 2. Tujuan Produk

## 2.1 Tujuan Utama

1. Menyediakan pengalaman pemesanan kue yang mudah bagi pelanggan.
2. Mengurangi proses pemesanan manual yang sebelumnya berpotensi dilakukan melalui chat.
3. Membantu admin mengelola produk dan pesanan dari satu dashboard.
4. Mencegah pesanan melebihi kapasitas produksi pada suatu tanggal.
5. Memisahkan dan memperjelas status pesanan dengan status pembayaran.
6. Memberikan pelanggan kemampuan untuk melacak pesanan tanpa login.
7. Menyiapkan fondasi pembayaran online yang dapat diverifikasi secara otomatis.
8. Membuat sistem yang dapat dikembangkan lebih lanjut tanpa harus mengubah konsep bisnis utama.

## 2.2 Bukan Tujuan Versi Awal

Hal berikut tidak menjadi requirement wajib untuk versi awal:

- Customer account/login.
- Delivery/kurir.
- Otomatisasi WhatsApp melalui WhatsApp Business API.
- Sistem loyalty point.
- Review/rating produk.
- Multi-cabang.
- Marketplace.
- Aplikasi mobile native.

Fitur-fitur tersebut dapat dipertimbangkan sebagai pengembangan berikutnya.

---

# 3. Target Pengguna

## 3.1 Customer

Orang yang ingin membeli produk Enjua Cake's.

Karakteristik:
- Tidak wajib memiliki akun.
- Dapat menggunakan website dari desktop maupun smartphone.
- Dapat membeli Ready Stock maupun Pre-Order.
- Membutuhkan informasi harga, produk, tanggal pickup, pembayaran, dan status order.

## 3.2 Admin

Pihak internal Enjua Cake's yang mengelola website dan operasional pesanan.

Admin membutuhkan kemampuan untuk:
- Mengelola produk.
- Mengelola pesanan.
- Mengelola pembayaran.
- Mengatur kapasitas.
- Mengubah status pesanan.
- Mengelola informasi website.
- Mencatat order manual dari WhatsApp/offline.

V1 hanya memiliki satu permission level: **ADMIN**. Boleh ada beberapa akun admin dengan permission yang sama; tidak ada RBAC kompleks di V1 (FD-81, FD-82).

---

# 4. Konsep Utama Sistem

## 4.1 Customer Tidak Menggunakan Login

Customer tidak perlu membuat akun.

Customer cukup:
1. Membuka website.
2. Memilih produk.
3. Memasukkan produk ke cart.
4. Checkout.
5. Mengisi data yang diperlukan.
6. Memilih tanggal pickup.
7. Memilih metode pembayaran.
8. Menyelesaikan pembayaran.
9. Mendapat nomor pesanan dan akses tracking.

## 4.2 Order Tracking

Setiap order memiliki nomor unik dengan format:

`ENC-YYYYMMDD-XXXX`

Contoh: order yang dibuat pada 2 Oktober 2026 → `ENC-20261002-XXXX`.

- `YYYYMMDD` = **tanggal order dibuat** (WIB), bukan tanggal pickup.
- `XXXX` = suffix yang menjamin keunikan nomor order. Mekanisme pembuatan suffix ditentukan pada technical planning.
- Nomor order adalah **identifikasi yang mudah dibaca manusia, bukan autentikasi** (FD-70).

Customer dapat melihat perkembangan pesanan melalui halaman tracking.

Halaman tracking **wajib** menggunakan:
- nomor order; **dan**
- **tracking token** acak high-entropy yang diperlakukan sebagai kredensial keamanan (FD-66, FD-67).

Nomor order saja **tidak pernah** boleh membuka detail order yang bersifat privat (FD-69). Detail lengkap ada di §26.

---

# 5. Katalog Produk

Setiap produk minimal memiliki (FD-22):

- ID produk
- Nama produk
- Deskripsi
- Kategori
- Foto utama (tepat satu)
- Foto tambahan (nol atau lebih)
- Harga normal (`price`)
- Harga sale (`sale_price`, opsional)
- Tipe produk:
  - Ready Stock (`READY_STOCK`)
  - Pre-Order (`PRE_ORDER`)
- Minimum Pre-Order dalam hari (`minimum_preorder_days`) jika produk Pre-Order
- Featured (ya/tidak)
- Availability:
  - Tersedia (`AVAILABLE`)
  - Sold Out (`SOLD_OUT`)
- Status aktif/nonaktif (`active`)
- Maksimal quantity per order (`max_quantity_per_order`, opsional)
- Waktu dibuat
- Waktu diperbarui

## 5.1 Tampilan Produk

Customer dapat melihat:

- Foto produk (utama dan tambahan bila ada)
- Nama produk
- Kategori
- Harga
- Harga sale dan persentase diskon jika ada
- Label Ready Stock atau Pre-Order
- Label Sold Out bila produk sedang tidak dapat dibeli
- Informasi minimum Pre-Order bila relevan
- Deskripsi produk
- Tombol tambah ke cart (nonaktif bila Sold Out)

## 5.2 Harga dan Diskon

Diskon V1 menggunakan model **`price` + `sale_price` opsional** (FD-25).

- Jika `sale_price` diisi, harga yang berlaku adalah `sale_price`.
- Persentase diskon boleh dihitung untuk keperluan tampilan.
- **Tidak ada** coupon, voucher, promo code, atau scheduled discount di V1.

Admin dapat:
- Mengubah harga.
- Menambahkan `sale_price`.
- Mengubah `sale_price`.
- Menghapus `sale_price`.

Harga yang digunakan pada order harus disimpan sebagai **snapshot harga saat order dibuat**, sehingga perubahan harga produk di kemudian hari tidak mengubah histori order lama.

## 5.3 Kategori

Kategori adalah bagian resmi dari sistem produk (FD-23).

- Setiap produk memiliki kategori.
- Admin mengelola daftar kategori.
- Category card di homepage wajib menggunakan kategori produk yang nyata, bukan kategori statis/fiktif.

## 5.4 Featured

Produk memiliki flag **featured** yang dikendalikan admin (FD-24). Produk featured ditampilkan di bagian Featured Products homepage.

## 5.5 Availability, Active, dan Sold Out

Sold Out adalah **state availability manual** yang dikendalikan admin, **bukan** sistem penghitungan stok (FD-26).

| Kondisi | Terlihat oleh customer | Dapat dibeli |
|---|---|---|
| `active = true`, `AVAILABLE` | Ya | Ya |
| `active = true`, `SOLD_OUT` | Ya | Tidak |
| `active = false` | Tidak (tersembunyi/nonaktif) | Tidak |

Ready Stock tidak memiliki jumlah stok di V1. Inventory management tetap menjadi future enhancement.

## 5.6 Custom Cake

Custom Cake boleh ada sebagai kategori/produk biasa (FD-29).

- **Tidak ada** custom cake builder/configurator di V1.
- Kustomisasi kompleks diarahkan ke WhatsApp.

## 5.7 Variant

Product variant (ukuran, rasa, dsb.) **bukan bagian V1** kecuali disetujui terpisah di kemudian hari (FD-30).

---

# 6. Shopping Cart

Customer dapat:

- Menambahkan lebih dari satu produk.
- Menambahkan produk berbeda.
- Mengubah jumlah produk.
- Menghapus produk.
- Melihat subtotal.
- Melihat diskon.
- Melihat total.

Cart bersifat anonim dan **disimpan di browser customer** (FD-31) sehingga tidak hilang karena refresh.

Harga, diskon, dan total di cart hanya bersifat tampilan. Harga dari browser **tidak pernah dipercaya**; server menghitung ulang dan memvalidasi harga, diskon, availability, aturan Pre-Order, dan kapasitas saat checkout (FD-32).

Tanggal pickup **tidak** dipilih di cart; tanggal pickup dipilih saat checkout (FD-33).

Jika produk memiliki `max_quantity_per_order`, quantity produk tersebut dalam satu order tidak boleh melebihinya. Tidak ada batas quantity global (FD-28).

## 6.1 Ready Stock + Pre-Order

Customer **boleh memasukkan Ready Stock dan Pre-Order dalam satu cart/order**.

Contoh:

- Brownies — Ready Stock
- Birthday Cake — Pre-Order
- Cookies — Ready Stock

Semuanya dapat menjadi satu order.

Jika cart memiliki produk Pre-Order, sistem harus memeriksa tanggal pickup berdasarkan aturan Pre-Order produk tersebut.

Jika cart memiliki minimal satu produk Pre-Order, metode Cash tidak tersedia saat checkout (lihat §13.1).

---

# 7. Sistem Pickup

Versi awal menggunakan **pickup/self-pickup**.

Tidak ada sistem delivery pada versi awal.

Customer harus memilih tanggal pickup saat checkout.

V1 hanya memilih **tanggal** pickup, **bukan** slot jam (FD-10). Jam pickup bersifat **informasional** dan dapat dikonfigurasi admin melalui Website Settings (FD-11).

## 7.1 Tanggal Pickup

Sistem hanya mengizinkan tanggal yang memenuhi seluruh aturan:

1. Tanggal berada di dalam **booking horizon**: hari ini (WIB) sampai default **60 hari** ke depan, dapat dikonfigurasi (FD-08).
2. Kapasitas order tanggal tersebut belum penuh.
3. Semua produk Pre-Order memenuhi minimum waktu produksi (§8).
4. Untuk Ready Stock same-day, order dibuat **sebelum pickup cutoff** (§7.2).
5. Tanggal tidak diblokir oleh admin (FD-06).

Tanggal yang tidak memenuhi syarat harus tidak dapat dipilih atau ditampilkan sebagai unavailable dengan alasan yang jelas, misalnya:

- "Tanggal penuh — kapasitas sudah tercapai."
- "Tanggal ditutup."
- "Pre-Order membutuhkan minimal 3 hari."
- "Batas pemesanan hari ini sudah lewat."

## 7.2 Ready Stock Same-Day dan Pickup Cutoff

- Order yang hanya berisi Ready Stock **boleh same-day pickup** jika kapasitas tersedia, tanggal terbuka, dan order dibuat sebelum **pickup cutoff** (FD-19).
- Pickup cutoff dapat dikonfigurasi; default development **15:00 WIB** (FD-20). Nilai final mengikuti klien.
- Jika cutoff sudah lewat, tanggal pickup paling awal untuk Ready Stock adalah **tanggal tersedia berikutnya** (FD-21).

---

# 8. Sistem Pre-Order

Sistem Pre-Order tidak hanya berdasarkan jumlah hari tetap untuk seluruh produk.

Setiap produk Pre-Order memiliki aturan minimum waktu produksi sendiri.

Contoh:

| Produk | Tipe | Minimum Pre-Order |
|---|---|---:|
| Brownies | Ready Stock | - |
| Cake A | Pre-Order | 1 hari |
| Cake B | Pre-Order | 2 hari |
| Custom Cake | Pre-Order | 3 hari |

Jika sebuah produk membutuhkan minimum 2 hari, tanggal pickup yang terlalu dekat dengan waktu pemesanan tidak boleh dipilih.

Minimum Pre-Order dihitung dalam **hari kalender WIB** (FD-17):

> Tanggal pickup paling awal = tanggal order (WIB) + `minimum_preorder_days`.

Contoh: order dibuat 2 Oktober dengan minimum 3 hari → pickup paling awal 5 Oktober.

## 8.1 Aturan untuk Cart Campuran

Jika customer memasukkan beberapa produk Pre-Order dengan minimum waktu berbeda, tanggal pickup harus memenuhi **produk yang membutuhkan waktu paling lama**.

Contoh:

- Cake A → 1 hari
- Cake B → 3 hari

Maka order harus mengikuti minimum 3 hari.

Jika cart berisi Ready Stock dan Pre-Order, aturan Pre-Order terlama tetap berlaku untuk seluruh order (satu order = satu tanggal pickup).

## 8.2 Metode Pembayaran untuk Pre-Order

Order yang berisi minimal satu produk Pre-Order **wajib** menggunakan QRIS atau Transfer Bank. Cash tidak tersedia (FD-40). Lihat §13.1.

---

# 9. Kapasitas Order Harian

Batas kapasitas bisnis yang disepakati:

> **Kapasitas default: maksimal 10 order per tanggal pickup.**

Admin dapat meng-override kapasitas untuk tanggal tertentu (FD-07). Lihat §11.

Jenis kue tidak membedakan perhitungan kapasitas.

Contoh:

Tanggal 10 Oktober:

- Order 1 — Brownies
- Order 2 — Birthday Cake
- Order 3 — Cookies
- ...
- Order 10 — Custom Cake

Maka tanggal tersebut dianggap penuh.

## 9.1 Yang Dihitung

**1 checkout/order = 1 slot kapasitas.**

Jumlah item atau jumlah unit kue dalam satu order tidak menambah jumlah slot.

Contoh:

Customer membeli:
- 2 Brownies
- 1 Cake
- 3 Cookies

Tetap dihitung sebagai:

**1 order.**

## 9.2 Kapasitas Berdasarkan Pickup Date

Kapasitas dihitung berdasarkan tanggal customer mengambil pesanan, bukan tanggal customer membuat order.

Contoh:

Customer memesan tanggal 2 Oktober untuk pickup 5 Oktober.

Maka order tersebut menambah:

**1/10 pada tanggal 5 Oktober.**

## 9.3 Order yang Menggunakan Kapasitas

Seluruh order yang belum Dibatalkan menggunakan slot pada tanggal pickup-nya, termasuk:

- order website yang masih dalam masa reservasi pembayaran;
- order yang sudah dibayar/dikonfirmasi;
- order Cash;
- order **manual** yang dibuat admin (FD-80);
- order Selesai (tetap tercatat pada tanggal tersebut).

Order yang Dibatalkan (termasuk karena payment expiry) melepaskan slotnya.

---

# 10. Reservasi Kapasitas

Sistem harus mencegah dua customer mendapatkan slot terakhir secara bersamaan. Reservasi kapasitas wajib **concurrency-safe / atomic** (FD-05).

Aturan:
- slot kapasitas di-reserve ketika order berhasil dibuat;
- order yang belum menyelesaikan pembayaran memiliki masa reservasi sesuai metode pembayaran (tabel di bawah);
- jika reservasi berakhir atau order dibatalkan, slot dikembalikan;
- order yang sudah dikonfirmasi/berhasil dibayar mempertahankan slot sampai selesai atau dibatalkan.

| Metode | Masa reservasi default | Dapat dikonfigurasi | Jika lewat batas tanpa pembayaran |
|---|---|---|---|
| QRIS | **30 menit** (FD-12) | Ya | Payment `EXPIRED`, order Dibatalkan, slot dilepas |
| Transfer Bank | **2 jam** (FD-13) | Ya | Payment `EXPIRED`, order Dibatalkan, slot dilepas |
| Cash saat Pickup | **Tidak kedaluwarsa** (FD-15) | — | Tidak dibatalkan otomatis |

## 10.1 Pembatalan karena Payment Expiry

Untuk order QRIS/Transfer yang belum dibayar sampai masa reservasi habis (FD-14, FD-56):

- payment status = `EXPIRED`;
- order status = **Dibatalkan**;
- alasan pembatalan mencatat payment expiry, oleh System;
- kapasitas yang di-reserve dilepas.

Order Cash dikecualikan dari pembatalan karena payment expiry (FD-57).

Catatan interpretasi (lihat `FINAL-REQUIREMENT-DECISIONS.md`):
- **DI-01** — Expiry ini hanya berlaku untuk order yang **belum memiliki pembayaran terkonfirmasi**. Order yang DP-nya sudah terbayar tidak dibatalkan otomatis jika transaksi pelunasannya kedaluwarsa; hanya transaksi pelunasan tersebut yang `EXPIRED`.
- **DI-02** — Untuk Transfer Bank, timer berlaku sampai bukti pembayaran diunggah. Setelah bukti diunggah (`WAITING_VERIFICATION`), order tidak dibatalkan otomatis selama menunggu verifikasi admin.

---

# 11. Kalender dan Pengaturan Kapasitas

Admin dapat melihat kapasitas berdasarkan tanggal.

Contoh:

| Tanggal | Kapasitas | Terisi | Sisa | Status |
|---|---:|---:|---:|---|
| 8 Okt | 10 | 3 | 7 | Tersedia |
| 9 Okt | 10 | 8 | 2 | Tersedia |
| 10 Okt | 10 | 10 | 0 | Penuh |

Admin dapat:
- melihat order per tanggal;
- melihat sisa kapasitas;
- memblokir tanggal tertentu (FD-06);
- membuka kembali tanggal yang diblokir;
- mengatur kapasitas default;
- meng-override kapasitas untuk tanggal tertentu (FD-07);
- mengatur booking horizon (default 60 hari) dan pickup cutoff (default 15:00 WIB) melalui Website Settings.

Kapasitas default awal adalah **10 order per tanggal**.

Memblokir tanggal atau menurunkan kapasitas **tidak boleh** membatalkan/menghapus order yang sudah valid pada tanggal tersebut secara otomatis (EC-14). Tanggal tersebut hanya berhenti menerima order baru.

---

# 12. Checkout

Checkout harus mengumpulkan data yang diperlukan untuk memenuhi order.

Data **wajib** diisi/dipilih customer (FD-34):

- Nama customer
- Nomor WhatsApp
- Tanggal pickup
- Item order (produk dan jumlah)
- Metode pembayaran (QRIS / Transfer Bank / Cash saat Pickup)
- Opsi pembayaran:
  - DP 50%
  - Bayar penuh

Data **opsional**:

- Catatan customer

Data yang dihitung oleh **server** (bukan input customer): harga, diskon, subtotal, total, nominal DP, nominal yang harus dibayar sekarang, dan sisa pembayaran.

V1 **tidak** mewajibkan email customer maupun alamat pengiriman (FD-35).

Aturan ketersediaan opsi:
- Opsi DP 50% hanya tersedia untuk QRIS dan Transfer Bank (FD-42).
- Cash hanya pembayaran penuh dan hanya tersedia untuk order Ready Stock-only (FD-39, FD-40, FD-41).

## 12.1 Ringkasan Checkout

Customer harus dapat melihat:

- Produk
- Quantity
- Harga per produk
- Subtotal
- Diskon
- Total
- Tanggal pickup
- Metode pembayaran
- Nominal yang harus dibayar sekarang
- Sisa pembayaran jika memilih DP

Sistem harus meminta customer melakukan konfirmasi sebelum order dibuat.

## 12.2 Setelah Checkout Berhasil

Halaman order sukses menampilkan (FD-71):

- Nomor order
- Kode tracking/akses
- Aksi/link langsung ke halaman tracking
- Aksi copy (nomor order dan kode akses)
- Aksi bantuan WhatsApp
- Langkah pembayaran berikutnya sesuai metode (QRIS / instruksi transfer / informasi Cash)

Customer harus diberi tahu dengan jelas bahwa kode akses diperlukan untuk melacak pesanan dan perlu disimpan.

---

# 13. Sistem Pembayaran

Metode pembayaran versi awal (FD-36):

1. QRIS
2. Transfer bank
3. Cash saat pickup

## 13.1 Ketersediaan Metode dan Opsi

| Isi order | QRIS | Transfer Bank | Cash saat Pickup |
|---|---|---|---|
| Hanya Ready Stock | DP 50% / Penuh | DP 50% / Penuh | Penuh saja |
| Berisi minimal 1 Pre-Order | DP 50% / Penuh | DP 50% / Penuh | **Tidak tersedia** |

## 13.2 Biaya Pembayaran

Biaya gateway/payment processing **ditanggung merchant** di V1. Tidak ada biaya gateway terpisah yang dibebankan ke customer (FD-47).

## 13.3 Pemisahan Status

Sistem harus memisahkan:

**Order Status**

dan

**Payment Status**

---

# 14. Payment Status

Makna internal payment status yang wajib didukung (FD-52), dengan label UI Bahasa Indonesia (FD-53):

| Internal | Label UI (indikatif) | Makna |
|---|---|---|
| `UNPAID` | Belum Dibayar | Belum ada transaksi berjalan (mis. order Cash sebelum pickup). |
| `WAITING_PAYMENT` | Menunggu Pembayaran | Transaksi QRIS/Transfer dibuat, menunggu customer membayar. |
| `WAITING_VERIFICATION` | Menunggu Verifikasi | Bukti transfer sudah diunggah, menunggu verifikasi admin. |
| `PARTIALLY_PAID` | DP Terbayar | DP 50% sudah terkonfirmasi, masih ada sisa. |
| `PAID` | Lunas | Seluruh total sudah terkonfirmasi. |
| `FAILED` | Pembayaran Gagal | Transaksi gagal. |
| `EXPIRED` | Pembayaran Kedaluwarsa | Batas waktu pembayaran habis. |
| `REFUNDED` | Dana Dikembalikan | Seluruh pembayaran dikembalikan. |
| `PARTIALLY_REFUNDED` | Dana Dikembalikan Sebagian | Sebagian pembayaran dikembalikan. |

Label UI dapat disesuaikan pada tahap implementation selama maknanya tetap sama.

Payment status di level **order** adalah ringkasan kondisi pembayaran order. Setiap **transaksi pembayaran** (DP, penuh, pelunasan) juga memiliki status masing-masing.

Status awal per metode:

| Metode | Status awal |
|---|---|
| QRIS | `WAITING_PAYMENT` |
| Transfer Bank | `WAITING_PAYMENT` → `WAITING_VERIFICATION` setelah bukti diunggah |
| Cash saat Pickup | `UNPAID` |

---

# 15. DP 50% dan Pembayaran Penuh

Customer yang memilih QRIS atau Transfer Bank dapat memilih DP 50% atau bayar penuh (FD-42). Cash selalu bayar penuh (FD-39).

Aturan perhitungan (FD-43, FD-44):

- Nilai uang disimpan sebagai integer Rupiah.
- **DP = ceil(total × 0,5)**
- **Sisa = total − DP**

Contoh total ganjil: total Rp125.555 → DP Rp62.778, sisa Rp62.777.

### Opsi A — DP 50%

Contoh:

Total order:
`Rp300.000`

DP:
`Rp150.000`

Sisa:
`Rp150.000`

Setelah DP berhasil:

- Payment Status: DP Terbayar (`PARTIALLY_PAID`)
- Paid Amount: Rp150.000
- Remaining Amount: Rp150.000

### Opsi B — Bayar Penuh

Customer membayar:

`Rp300.000`

Setelah berhasil:

- Payment Status: Lunas (`PAID`)
- Paid Amount: Rp300.000
- Remaining Amount: Rp0

---

# 16. Pembayaran QRIS

Sistem dirancang untuk menggunakan **QRIS melalui payment gateway**, dengan preferensi QRIS dinamis pada production.

Tujuan:
- nominal pembayaran dapat dikaitkan dengan transaksi;
- transaksi dapat dikaitkan dengan order;
- sistem dapat menerima status pembayaran secara otomatis;
- mengurangi kebutuhan verifikasi screenshot secara manual.

Persyaratan QRIS (FD-37):
- target production: QRIS dinamis melalui payment gateway;
- status pembayaran berasal dari **webhook yang diverifikasi backend**;
- dapat diuji di **sandbox**;
- pemrosesan webhook **idempotent**.

Provider payment gateway **sengaja tidak dipilih** di level requirement (FD-48). Technical Implementation Plan wajib merekomendasikan provider berdasarkan:
- biaya transaksi;
- dukungan QRIS;
- dukungan DP/pembayaran bertahap (beberapa transaksi per order);
- webhook;
- dokumentasi;
- sandbox;
- kemudahan integrasi;
- dukungan Indonesia;
- settlement;
- kebutuhan legal/merchant onboarding.

Arsitektur pembayaran harus menghindari **provider lock-in** yang tidak perlu (FD-49).

---

# 17. Payment Gateway dan Webhook

Alur yang diharapkan:

```text
Customer Checkout
      ↓
Order dibuat
      ↓
Payment transaction dibuat
      ↓
QRIS / payment interface ditampilkan
      ↓
Customer melakukan pembayaran
      ↓
Payment Gateway memproses pembayaran
      ↓
Webhook dikirim ke backend
      ↓
Backend memvalidasi webhook
      ↓
Payment Status diperbarui
      ↓
Customer & Admin melihat status terbaru
```

Webhook tidak boleh dipercaya hanya berdasarkan data yang dikirim dari client/browser.

Backend harus melakukan validasi keamanan sesuai dokumentasi provider.

---

# 18. Bukti Pembayaran

Upload bukti pembayaran adalah langkah utama untuk Transfer Bank dan tetap disediakan sebagai fallback/manual verification.

### Jika order melalui website

Customer dapat mengunggah bukti pembayaran melalui website (halaman order sukses/tracking/payment) jika diperlukan.

Aturan file (FD-50, FD-51):
- Tipe yang diizinkan: **JPG/JPEG, PNG, PDF**.
- Ukuran maksimal default: **5 MB**.
- Divalidasi di server (tipe dan ukuran), bukan hanya di browser.
- Disimpan secara aman, tidak dapat dieksekusi, dan **tidak terekspos publik**.
- Hanya admin terautentikasi atau akses order yang sah yang dapat melihatnya.

### Jika order dilakukan melalui WhatsApp

Customer mengirim bukti pembayaran melalui WhatsApp.

Sistem website tidak boleh menganggap screenshot sebagai bukti pembayaran yang valid secara otomatis jika payment gateway belum mengonfirmasi transaksi.

Admin dapat melakukan verifikasi manual jika diperlukan.

---

# 19. Transfer Bank

Transfer bank dapat digunakan sebagai metode pembayaran (FD-38).

Versi awal mendukung:
- instruksi rekening bank (dikonfigurasi melalui Website Settings);
- nominal pembayaran (DP atau penuh, dari server);
- batas waktu pembayaran (default 2 jam, lihat §10);
- upload bukti pembayaran;
- verifikasi admin (menyetujui bukti → `PARTIALLY_PAID`/`PAID`).

Jika pada technical planning dipilih payment gateway dengan Virtual Account/bank transfer yang mendukung webhook, sistem dapat dikembangkan agar verifikasi transfer lebih otomatis.

---

# 20. Cash saat Pickup

Cash saat pickup **hanya tersedia untuk order yang seluruh itemnya Ready Stock** (FD-40, FD-41).

Jika customer memilih cash saat pickup:

- Customer tidak perlu upload bukti pembayaran.
- Status pembayaran awal: Belum Dibayar (`UNPAID`).
- Order tidak kedaluwarsa karena belum dibayar (FD-15).
- Admin menerima pembayaran ketika customer mengambil pesanan.
- Admin menandai pembayaran sebagai Lunas (`PAID`).
- Sistem mencatat waktu dan admin yang melakukan perubahan.

> Cash saat pickup = pembayaran penuh saat pickup. **Tidak ada DP untuk Cash** (FD-39).

---

# 21. Pelunasan DP

Jika customer memilih DP:

Sistem harus menyimpan:
- total order;
- nominal DP;
- nominal sudah dibayar;
- nominal tersisa.

Admin/customer harus dapat mengetahui total, nominal yang sudah dibayar, dan nominal yang belum dibayar (FD-45).

Sisa pembayaran dapat dibayar melalui flow online (QRIS) atau transfer yang didukung, dari **halaman tracking/payment** (FD-46). Sistem membuat transaksi pembayaran berikutnya untuk nominal sisa. Jika transaksi pelunasan kedaluwarsa, hanya transaksi tersebut yang `EXPIRED`; order tidak dibatalkan otomatis (DI-01).

Flow:

```text
Total Rp300.000
       ↓
DP Rp150.000
       ↓
Sisa Rp150.000
       ↓
Pelunasan Rp150.000
       ↓
Lunas
```

---

# 21a. Refund

- Kebijakan kelayakan refund **wajib dikonfirmasi klien sebelum production** (FD-61). Ini bukan blocker arsitektur.
- Sistem harus mampu mencatat refund: **jumlah, status, alasan, waktu, dan admin/operator** (FD-62).
- Pemrosesan refund V1 bersifat **manual dan dikendalikan admin** (FD-63). Pengembalian dana dilakukan di luar sistem; sistem mencatatnya.
- Payment status order menjadi `REFUNDED` atau `PARTIALLY_REFUNDED` sesuai jumlah yang dicatat.
- Sistem **tidak boleh** menerapkan kebijakan refund otomatis apa pun (FD-64).

---

# 22. Order Status

Status order yang digunakan:

1. **Pesanan Baru**
2. **Dikonfirmasi**
3. **Pesanan Diproses**
4. **Siap Diambil**
5. **Selesai**
6. **Dibatalkan**

## 22.1 Arti Status

### Pesanan Baru
Order baru masuk dan belum diproses/ditinjau admin.

### Dikonfirmasi
Admin telah menerima dan mengonfirmasi order.

### Pesanan Diproses
Pesanan sedang dikerjakan/diproduksi.

### Siap Diambil
Pesanan sudah selesai dibuat dan dapat diambil customer.

### Selesai
Customer sudah mengambil pesanan.

### Dibatalkan
Order dibatalkan sesuai aturan bisnis: oleh admin (dengan alasan) atau oleh System karena payment expiry.

Status "Pesanan Diterima" **tidak digunakan** (FD-55). Tahap pertama selalu disebut **Pesanan Baru**.

## 22.2 Flow Status per Metode Pembayaran

### QRIS

```text
Pesanan Baru            (payment WAITING_PAYMENT, slot reserved 30 menit)
   ↓  customer membayar QRIS
   ↓  webhook sukses terverifikasi backend
   ↓  payment PARTIALLY_PAID (DP) atau PAID (penuh)
Dikonfirmasi            (otomatis oleh System — DI-04)
   ↓
Pesanan Diproses
   ↓
Siap Diambil
   ↓
Selesai
```

### Transfer Bank

```text
Pesanan Baru            (payment WAITING_PAYMENT, slot reserved 2 jam)
   ↓  customer transfer
   ↓  bukti diunggah → payment WAITING_VERIFICATION
   ↓  admin menyetujui bukti
   ↓  payment PARTIALLY_PAID atau PAID
Dikonfirmasi
   ↓
Pesanan Diproses
   ↓
Siap Diambil
   ↓
Selesai
```

### Cash saat Pickup (hanya order Ready Stock-only)

```text
Pesanan Baru            (payment UNPAID, slot reserved tanpa expiry)
   ↓  admin menerima order
Dikonfirmasi
   ↓
Pesanan Diproses
   ↓
Siap Diambil
   ↓  customer membayar cash saat pickup → admin menandai PAID
Selesai
```

### Payment Expiry (QRIS/Transfer belum dibayar)

```text
Pesanan Baru (WAITING_PAYMENT)
   ↓  masa reservasi habis tanpa pembayaran
Dibatalkan  (payment EXPIRED, alasan: payment expiry, oleh System, slot dilepas)
```

## 22.3 Pembatalan

- Customer **tidak** memiliki self-service cancellation di V1 (FD-58).
- Customer dapat meminta pembatalan melalui WhatsApp (FD-59).
- Admin melakukan pembatalan dan **wajib** mencatat alasan serta informasi audit (FD-60).
- Pembatalan melepaskan slot kapasitas.
- Jika order yang dibatalkan sudah memiliki pembayaran, pengembalian dana dicatat secara manual sesuai §21a.

---

# 23. Order Status dan Payment Status Harus Terpisah

Contoh valid:

```text
Status Pesanan:
Pesanan Diproses

Status Pembayaran:
DP Terbayar
```

atau:

```text
Status Pesanan:
Siap Diambil

Status Pembayaran:
Lunas
```

Sistem tidak boleh menggabungkan kedua konsep tersebut menjadi satu status.

---

# 24. Order Detail

Setiap order harus memiliki detail lengkap:

- Order ID
- Nomor order
- Sumber order (website / manual oleh admin)
- Nama customer
- Nomor WhatsApp
- Tanggal order
- Tanggal pickup
- Daftar produk
- Quantity
- Harga saat order
- Diskon saat order
- Subtotal
- Total
- Metode pembayaran
- Opsi pembayaran (DP 50% / penuh)
- Nominal total
- Nominal DP (jika DP)
- Nominal dibayar
- Nominal tersisa
- Batas waktu pembayaran (jika masih dalam masa reservasi)
- Order status
- Payment status
- Daftar transaksi pembayaran
- Catatan customer jika ada
- Bukti pembayaran jika ada
- Alasan pembatalan jika Dibatalkan
- Catatan refund jika ada
- Riwayat perubahan status
- Waktu perubahan status
- Admin yang melakukan perubahan jika relevan (atau "System")

---

# 25. Order History / Audit Trail

Perubahan penting pada order sebaiknya dicatat.

Contoh:

```text
2 Okt 10:10
Pesanan Baru
oleh System

2 Okt 10:15
Dikonfirmasi
oleh Admin

3 Okt 09:00
Pesanan Diproses
oleh Admin

4 Okt 14:00
Siap Diambil
oleh Admin

5 Okt 16:30
Selesai
oleh Admin
```

Tujuannya agar admin dapat mengetahui histori order dan customer mendapatkan informasi status yang jelas.

Yang wajib dicatat di audit trail minimal: perubahan order status, perubahan payment status, verifikasi/penolakan bukti pembayaran, penandaan pembayaran Cash, pembatalan beserta alasan, pencatatan refund, pembuatan manual order, dan penerbitan ulang kode akses tracking.

---

# 26. Customer Order Tracking

Customer tidak perlu login.

Customer membuka halaman:

**Lacak Pesanan**

Kemudian memasukkan:
- nomor order; **dan**
- kode akses (tracking token).

Keduanya wajib (FD-66). Alternatifnya, customer membuka link tracking langsung dari halaman order sukses.

Halaman menampilkan:

- Nomor order
- Status pesanan
- Status pembayaran
- Tanggal pickup
- Produk yang dipesan
- Total
- Sudah dibayar
- Sisa pembayaran
- Timeline status
- Aksi pembayaran yang relevan: bayar sisa DP, melanjutkan pembayaran yang masih pending, atau upload bukti transfer
- Aksi bantuan WhatsApp (mis. untuk permintaan pembatalan)

Contoh:

```text
ENC-20261002-XXXX

✓ Pesanan Baru
✓ Dikonfirmasi
● Pesanan Diproses
○ Siap Diambil
○ Selesai

Pickup:
8 Oktober 2026

Pembayaran:
DP 50% Terbayar

Total:
Rp300.000

Dibayar:
Rp150.000

Sisa:
Rp150.000
```

## 26.1 Keamanan Tracking Token

- Token dibuat secara acak dengan entropi tinggi dan diperlakukan sebagai **kredensial keamanan** (FD-67).
- Token sebaiknya disimpan dalam bentuk representasi aman/hash bila secara teknis sesuai (FD-68).
- Nomor order saja tidak pernah membuka detail privat (FD-69).
- Token **tidak boleh** dimasukkan ke pesan WhatsApp pre-filled (FD-77).

## 26.2 Kehilangan Kode Akses

- Pemulihan di V1 dilakukan melalui **admin/WhatsApp** (FD-72). **Tidak ada** pemulihan otomatis via email (FD-73).
- Karena token dapat disimpan sebagai hash, admin tidak menampilkan token lama; admin **menerbitkan ulang kode akses** untuk order tersebut setelah memverifikasi customer, lalu menyampaikannya secara manual. Kode lama tidak berlaku lagi (DI-05).

---

# 27. Notifikasi Status

Customer harus dapat mengetahui perubahan status.

Versi awal wajib memastikan status selalu dapat dilihat melalui tracking page.

Notifikasi WhatsApp otomatis bukan requirement wajib untuk versi pertama karena membutuhkan integrasi WhatsApp/API yang sesuai.

Arsitektur sistem sebaiknya tetap dibuat agar integrasi notifikasi dapat ditambahkan kemudian.

Contoh future notification:

> Pesanan #ENC-20261002-XXXX telah berubah menjadi "Pesanan Diproses".

---

# 28. WhatsApp

Website harus menyediakan cara mudah bagi customer untuk menghubungi Enjua Cake's melalui WhatsApp.

Untuk versi awal (FD-74):
- gunakan link `wa.me`;
- gunakan pre-filled message sesuai konteks;
- **tidak ada** pengiriman pesan otomatis via WhatsApp API;
- jangan menganggap WhatsApp biasa dapat mengirim pesan otomatis dari sistem.

Titik akses WhatsApp (FD-75):
- floating contact;
- footer;
- halaman order sukses;
- halaman tracking;
- bantuan/permintaan pembatalan;
- inquiry Custom Cake.

Isi pesan pre-filled:
- **boleh** memuat nomor order (FD-76);
- **tidak boleh** memuat tracking token (FD-77).

Nomor WhatsApp diambil dari Website Settings.

Jika suatu saat menggunakan WhatsApp Business Platform/API, sistem dapat ditingkatkan menjadi notifikasi otomatis.

Order yang dilakukan langsung melalui WhatsApp berada di luar flow checkout website, dan **dicatat admin melalui fitur Manual Order** (§50) agar kapasitas tetap akurat.

---

# 29. Admin Authentication

Admin Dashboard harus dilindungi dengan autentikasi.

Customer tidak boleh dapat mengakses halaman admin.

Minimal:
- Login admin
- Logout
- Protected admin routes
- Password tidak boleh disimpan dalam plaintext
- Session/token harus dikelola dengan aman
- Validasi authorization pada server/backend
- Admin yang sedang login dapat **mengganti password** (FD-84)

Ketentuan V1:
- Satu permission level: **ADMIN**. Beberapa akun admin boleh ada dengan permission yang sama (FD-81, FD-82).
- Flow forgot-password publik self-service **tidak wajib**, kecuali technical plan merekomendasikan mekanisme yang aman dan sederhana (FD-85).

---

# 30. Admin Dashboard

Dashboard menyediakan ringkasan operasional.

Ringkasan operasional V1 (FD-90):

- Order per status (Pesanan Baru, Dikonfirmasi, Diproses, Siap Diambil, Selesai, Dibatalkan)
- Pembayaran yang perlu diverifikasi (`WAITING_VERIFICATION`)
- Pickup dan kapasitas mendatang (mis. hari ini dan beberapa hari ke depan)
- Ringkasan pendapatan sederhana
- Order yang membutuhkan perhatian (mis. order Cash yang belum dikonfirmasi, order Siap Diambil yang belum lunas)

Dashboard tidak boleh hanya menjadi tampilan statistik; fungsi utama admin adalah mengelola operasional website.

## 30.1 Modul Admin V1

- Products (termasuk kategori, featured, availability)
- Orders (termasuk Manual Order, perubahan status, pembatalan, penerbitan ulang kode akses)
- Payments (verifikasi bukti transfer, penandaan Cash, pencatatan refund)
- Pickup Capacity (kalender, blokir tanggal, override kapasitas)
- Website Settings
- Akun admin (ganti password)

---

# 31. Product Management

Admin dapat:

- Menambah produk
- Mengedit produk
- Menghapus/nonaktifkan produk
- Mengunggah foto
- Mengubah nama
- Mengubah deskripsi
- Mengubah harga
- Mengunggah foto utama dan foto tambahan
- Menambah/mengubah/menghapus `sale_price`
- Mengatur Ready Stock / Pre-Order
- Mengatur minimum Pre-Order
- Mengatur kategori produk
- Mengelola daftar kategori
- Menandai/menghapus tanda featured
- Mengatur availability (Tersedia / Sold Out)
- Mengatur `max_quantity_per_order` (opsional)
- Mengatur status produk aktif/nonaktif

## 31.1 Delete Product

Produk yang sudah pernah masuk ke order sebaiknya tidak dihapus secara hard delete.

Lebih aman menggunakan:
- inactive/archive;
- histori order tetap menyimpan snapshot data produk.

---

# 32. Website Content Management

**Website Settings adalah bagian V1** (FD-86). Admin dapat mengelola informasi website tanpa mengubah source code.

Setting yang dapat dikonfigurasi (FD-87):

- Nama bisnis
- Deskripsi bisnis
- Alamat (pickup)
- Nomor WhatsApp
- Jam operasional
- Jam pickup (informasional)
- Pickup cutoff (default development 15:00 WIB)
- Kapasitas default (default 10)
- Booking horizon (default 60 hari)
- Informasi rekening bank
- Media sosial
- Instruksi pickup
- Instruksi pembayaran

Durasi masa reservasi QRIS (default 30 menit) dan Transfer (default 2 jam) juga dapat dikonfigurasi; apakah tampil di Website Settings atau sebagai konfigurasi sistem ditentukan pada technical planning (DI-06).

Nilai production harus berasal dari klien dan **tidak boleh dikarang** (FD-88). Selama development digunakan placeholder yang ditandai jelas.

Detail field final dapat disesuaikan pada technical planning.

---

# 33. Homepage

Homepage harus menjadi titik awal customer untuk memahami Enjua Cake's.

Homepage dapat memuat (FD-95):

- Navigation/Header
- Hero
- Featured Products (produk dengan flag featured)
- Categories (kategori produk yang nyata)
- About / Tentang Kami
- How to Order / Cara Pesan (termasuk penjelasan Ready Stock & Pre-Order dan informasi pickup)
- Contact / Kontak
- Footer

Section pendukung seperti brand/value highlights dan CTA dapat ditambahkan sesuai `PRD-Design.md`.

Halaman/route fungsional terpisah (katalog/produk, detail produk, cart, checkout, order sukses, tracking, admin) ditentukan pada implementation planning (FD-96).

Search **bukan** requirement V1 (FD-94).

Struktur visual final mengikuti `PRD-Design.md` dan design reference di `design-reference/homepage-reference.jpeg`.

---

# 34. Design Reference

Design reference **sudah tersedia** di:

`design-reference/homepage-reference.jpeg`

Arah visual, UI/UX, dan design system dijabarkan di `PRD-Design.md`.

Saat menggunakan design reference, Claude Code harus:

- Menganalisis layout.
- Menganalisis hierarchy.
- Menganalisis typography.
- Menganalisis spacing.
- Menganalisis card design.
- Menganalisis navigation.
- Menganalisis responsive behavior.
- Mengidentifikasi pola visual yang relevan.
- Menggunakan reference sebagai panduan, bukan menyalin aset/karya secara sembarangan.

Design reference tidak boleh dianggap sebagai requirement fungsional. Contoh: ikon search pada reference **tidak** berarti fitur search wajib dibuat (FD-94).

Nama, logo, teks, foto, dan informasi kontak brand pada reference (Sugar Bliss) **tidak boleh** disalin (FD-100).

---

# 35. Responsive Design

Responsiveness adalah **requirement wajib**, bukan fitur tambahan. Website Enjua Cake's harus memberikan pengalaman yang nyaman dan rapi pada berbagai ukuran perangkat, minimal:

- Smartphone / HP (portrait dan landscape)
- Tablet / iPad (portrait dan landscape)
- Laptop
- Desktop monitor

Implementasi harus menggunakan pendekatan **responsive dan mobile-first**, tetapi bukan berarti tampilan desktop hanya diperkecil ke mobile. Layout, ukuran elemen, navigasi, grid produk, form, cart, checkout, tracking order, dan dashboard harus menyesuaikan secara khusus terhadap ukuran layar yang tersedia.

## 35.1 Target Pengalaman Perangkat

### Smartphone / HP
- Seluruh fungsi utama customer harus dapat digunakan tanpa perlu zoom atau horizontal scrolling.
- Navigasi harus nyaman untuk touch interaction.
- Product grid harus menyesuaikan lebar layar.
- Product card tetap mudah dibaca dan tombol mudah disentuh.
- Cart dan checkout harus nyaman digunakan dengan satu tangan bila memungkinkan.
- Form checkout tidak boleh terasa terlalu padat pada layar kecil.
- Informasi harga, diskon, status produk, total pembayaran, dan status order harus tetap mudah ditemukan.

### Tablet / iPad
- Layout harus memanfaatkan ruang layar tablet secara proporsional.
- Website tidak boleh terlihat seperti versi mobile yang diperbesar secara tidak proporsional.
- Grid produk, detail produk, cart, checkout, dan order tracking harus memiliki spacing yang sesuai untuk tablet.
- Navigasi dan elemen interaktif harus tetap nyaman digunakan dengan touch.

### Laptop / Desktop
- Layout dapat memanfaatkan ruang horizontal yang lebih besar.
- Product catalog dapat menggunakan grid yang lebih luas.
- Checkout dan dashboard dapat menggunakan multi-column layout jika meningkatkan usability.
- Tidak boleh ada elemen penting yang terlalu melebar sehingga sulit dibaca.

## 35.2 Responsive Behavior

Komponen harus memiliki perilaku responsive yang jelas, termasuk:

- Navbar desktop dapat berubah menjadi mobile navigation pada layar kecil.
- Product grid menyesuaikan jumlah kolom berdasarkan viewport.
- Cart dapat berubah dari layout horizontal menjadi stacked layout pada layar kecil.
- Checkout dapat berubah dari multi-column menjadi single-column pada layar kecil.
- Tabel admin harus memiliki strategi responsive yang jelas, misalnya horizontal scrolling yang terkontrol atau perubahan menjadi card/list pada layar kecil.
- Modal/dialog tidak boleh melebihi viewport.
- Gambar produk harus mempertahankan aspect ratio yang sesuai tanpa merusak layout.
- Typography, spacing, padding, dan ukuran komponen dapat menyesuaikan viewport agar tetap proporsional.

## 35.3 Touch & Accessibility

- Tombol dan kontrol interaktif harus memiliki area sentuh yang nyaman pada perangkat touch.
- Jangan mengandalkan hover sebagai satu-satunya cara untuk mengetahui atau menjalankan fungsi penting.
- Semua fungsi utama customer harus tetap dapat digunakan tanpa mouse.
- Fokus keyboard harus terlihat pada elemen interaktif yang relevan.
- Kontras teks dan elemen penting harus tetap terbaca pada seluruh ukuran layar.

## 35.4 Responsive Quality Gate

Sebelum dianggap selesai, website harus diuji minimal pada kategori perangkat berikut:

- Smartphone kecil
- Smartphone standar
- Tablet/iPad
- Laptop
- Desktop

Tidak boleh terdapat:

- horizontal overflow yang tidak disengaja;
- teks terpotong;
- tombol yang keluar dari viewport;
- gambar yang rusak atau terdistorsi;
- form yang sulit digunakan;
- navbar yang bertabrakan;
- card atau tabel yang merusak layout;
- fitur penting yang hanya bekerja pada desktop.

Admin dashboard juga harus tetap usable pada tablet dan smartphone untuk tindakan penting seperti melihat order, membuka detail order, mengubah status order, dan memeriksa pembayaran.

---

# 36. UX Requirements

Website harus:

- mudah dipahami pengguna baru;
- memiliki CTA yang jelas;
- memberikan feedback setelah action;
- memberikan loading state;
- memberikan error state yang jelas;
- memberikan success state;
- mencegah double submission;
- tidak menghapus data cart secara tidak sengaja;
- menampilkan harga dengan jelas;
- menampilkan tanggal pickup dengan jelas;
- memberi alasan ketika tanggal tidak tersedia.

Contoh:

Jangan hanya:

> "Tanggal tidak tersedia."

Lebih baik:

> "Tanggal penuh — kapasitas 10 order sudah tercapai."

---

# 37. Validasi

Frontend dan backend sama-sama harus melakukan validasi.

Validasi minimal:

- Data customer wajib valid.
- Nomor WhatsApp valid.
- Cart tidak boleh kosong.
- Quantity harus valid (bilangan bulat positif dan tidak melebihi `max_quantity_per_order` bila diatur).
- Produk harus masih aktif dan berstatus `AVAILABLE` (bukan Sold Out).
- Harga harus dihitung ulang di server.
- Diskon (`sale_price`) harus dihitung ulang di server.
- Tanggal pickup harus tersedia: dalam booking horizon, tidak diblokir, kapasitas belum penuh.
- Minimum Pre-Order harus terpenuhi (hari kalender WIB, minimum terlama).
- Same-day Ready Stock hanya diterima sebelum pickup cutoff.
- Kapasitas harus dicek ulang dan di-reserve secara atomik saat order dibuat.
- Metode Cash ditolak jika order berisi produk Pre-Order.
- Opsi DP ditolak untuk metode Cash.
- Payment amount (termasuk DP = ceil(total × 0,5)) harus berasal dari data server.
- Customer tidak boleh memanipulasi total pembayaran dari browser.
- File bukti pembayaran: hanya JPG/JPEG/PNG/PDF, maksimal 5 MB, divalidasi di server.

---

# 38. Business Rules Penting

## BR-01
Customer tidak wajib login.

## BR-02
Satu checkout menghasilkan satu order.

## BR-03
Satu order dapat memiliki beberapa produk.

## BR-04
Ready Stock dan Pre-Order dapat berada dalam satu order.

## BR-05
Jika order memiliki beberapa produk Pre-Order, tanggal pickup harus memenuhi minimum waktu produksi yang paling lama.

## BR-06
Kapasitas default adalah 10 order per tanggal pickup. Admin dapat meng-override kapasitas untuk tanggal tertentu dan memblokir tanggal.

## BR-07
Jumlah unit produk dalam satu order tidak menambah jumlah slot order.

## BR-08
Kapasitas dihitung berdasarkan tanggal pickup.

## BR-09
Order yang dibatalkan atau reservasinya kedaluwarsa harus mengembalikan slot kapasitas sesuai aturan reservasi.

## BR-10
Harga pada order merupakan snapshot saat order dibuat.

## BR-11
Order status dan payment status harus terpisah.

## BR-12
Untuk QRIS dan Transfer Bank, customer dapat memilih DP 50% atau pembayaran penuh. DP = ceil(total × 0,5) dalam integer Rupiah; sisa = total − DP.

## BR-13
Cash saat pickup hanya pembayaran penuh saat pickup, tanpa DP.

## BR-14
QRIS production diarahkan menggunakan payment gateway dan transaksi yang dapat dikaitkan dengan order.

## BR-15
Webhook payment harus divalidasi di backend.

## BR-16
Customer dapat melacak order tanpa login.

## BR-17
Data order customer tidak boleh dapat diakses hanya dengan menebak URL/ID tanpa mekanisme keamanan yang memadai. Tracking wajib memakai nomor order + tracking token high-entropy.

## BR-18
Cash tidak tersedia untuk order yang berisi minimal satu produk Pre-Order.

## BR-19
Order QRIS/Transfer yang belum dibayar sampai masa reservasi habis (default QRIS 30 menit, Transfer 2 jam) menjadi Dibatalkan dengan payment `EXPIRED`, dan slotnya dilepas. Order Cash tidak kedaluwarsa karena belum dibayar.

## BR-20
Ready Stock-only boleh same-day pickup bila order dibuat sebelum pickup cutoff (default 15:00 WIB); setelah cutoff, tanggal paling awal adalah tanggal tersedia berikutnya.

## BR-21
Minimum Pre-Order dihitung dalam hari kalender WIB.

## BR-22
Tanggal pickup hanya dapat dipilih dalam booking horizon (default 60 hari).

## BR-23
Produk Sold Out tetap terlihat tetapi tidak dapat dibeli; produk nonaktif tersembunyi.

## BR-24
Manual order yang dibuat admin menggunakan kapasitas tanggal pickup yang sama dengan order website.

## BR-25
Customer tidak dapat membatalkan order sendiri; pembatalan dilakukan admin dengan alasan tercatat.

## BR-26
Refund dicatat dan diproses secara manual oleh admin; tidak ada kebijakan refund otomatis.

## BR-27
Biaya payment gateway ditanggung merchant.

---

# 39. Edge Cases

Sistem harus mempertimbangkan:

### EC-01 — Slot terakhir direbut dua customer
Dua customer mencoba mengambil slot ke-10 secara bersamaan.

**Expected:** hanya satu order yang berhasil mendapatkan slot.

### EC-02 — Customer meninggalkan checkout
Cart/checkout tidak boleh langsung dianggap sebagai order final tanpa aturan reservasi yang jelas.

### EC-03 — Payment timeout
Order QRIS/Transfer yang tidak dibayar sampai batas waktu reservasi (default QRIS 30 menit, Transfer 2 jam) menjadi Dibatalkan, payment `EXPIRED`, dan slot dikembalikan. Order Cash dikecualikan.

### EC-04 — Payment berhasil tetapi browser tertutup
Status tetap harus dapat diperbarui melalui webhook.

### EC-05 — Webhook dikirim dua kali
Sistem harus idempotent sehingga tidak menggandakan pembayaran atau mengubah data secara salah.

### EC-06 — Customer membayar nominal berbeda
Backend harus mendeteksi ketidaksesuaian nominal sesuai kemampuan payment provider.

### EC-07 — Produk menjadi nonaktif setelah masuk cart
Server harus memvalidasi kembali produk saat checkout.

### EC-08 — Harga berubah setelah customer membuka halaman
Harga final harus dihitung dari data server ketika order dibuat.

### EC-09 — Admin membatalkan order
Slot kapasitas harus dikembalikan sesuai aturan bisnis.

### EC-10 — Order sudah siap diambil tetapi belum lunas
Sistem harus tetap menampilkan status pembayaran secara terpisah.

### EC-11 — Customer mengakses order orang lain
Sistem harus mencegah akses melalui nomor order yang ditebak.

### EC-12 — Upload bukti pembayaran palsu
Upload bukti tidak otomatis berarti pembayaran valid.

### EC-13 — Payment gateway tidak tersedia
Customer harus mendapatkan error yang jelas dan order tidak boleh masuk ke status pembayaran berhasil.

### EC-14 — Admin mengubah kapasitas
Perubahan kapasitas (termasuk override yang lebih kecil dari jumlah order yang sudah ada) atau pemblokiran tanggal tidak boleh menghapus/membatalkan order yang sudah valid secara otomatis.

### EC-15 — Produk menjadi Sold Out setelah masuk cart
Server menolak item tersebut saat checkout dengan pesan yang jelas; customer dapat menghapusnya dari cart.

### EC-16 — Manipulasi metode Cash untuk Pre-Order
Jika request checkout memakai Cash untuk order yang berisi Pre-Order, server menolak walaupun UI sudah menyembunyikan opsi tersebut.

### EC-17 — Checkout melewati pickup cutoff
Customer membuka checkout sebelum cutoff tetapi mengirim setelah cutoff untuk same-day pickup. Server memvalidasi ulang berdasarkan waktu server (WIB) dan menolak tanggal tersebut.

### EC-18 — Customer kehilangan kode akses tracking
Customer menghubungi admin via WhatsApp; admin memverifikasi lalu menerbitkan ulang kode akses (§26.2).

### EC-19 — Manual order pada tanggal yang hampir penuh
Manual order bersaing atas slot yang sama dengan order website dan harus melalui mekanisme reservasi atomik yang sama.

---

# 40. Security Requirements

Minimal:

- Password admin di-hash.
- Authentication dan authorization diterapkan pada server.
- Admin route dilindungi.
- Input divalidasi dan disanitasi.
- SQL/NoSQL injection dicegah sesuai database.
- XSS dicegah.
- CSRF protection diterapkan bila relevan dengan arsitektur.
- Upload file dibatasi tipe (JPG/JPEG, PNG, PDF) dan ukuran (default maksimal 5 MB), divalidasi di server.
- File upload tidak boleh dieksekusi sebagai kode dan tidak boleh terekspos publik; hanya admin/akses order yang sah yang dapat melihatnya.
- Payment webhook diverifikasi dan diproses secara idempotent.
- Tracking token dibuat high-entropy, diperlakukan sebagai kredensial, disimpan dalam bentuk aman/hash bila sesuai, dan tidak dimasukkan ke pesan WhatsApp.
- Secret API key tidak boleh masuk frontend/public repository.
- Environment variables digunakan untuk secret.
- Customer hanya dapat mengakses order miliknya.
- Server menjadi sumber kebenaran untuk harga, diskon, kapasitas, dan total pembayaran.

---

# 41. Data Model Tingkat Produk

Entity utama yang diperkirakan diperlukan:

Konvensi: nilai uang = integer Rupiah; tanggal/waktu bisnis = WIB.

## User/Admin
- id
- name
- email/username
- password hash atau provider auth
- role (V1 hanya `ADMIN`)
- created_at
- updated_at

## Category
- id
- name
- description (opsional)
- image (opsional, untuk category card)
- sort order (opsional)
- is_active
- created_at
- updated_at

## Product
- id
- category_id
- name
- description
- price
- sale_price (opsional)
- product_type (`READY_STOCK` / `PRE_ORDER`)
- minimum_preorder_days (bila `PRE_ORDER`)
- is_featured
- availability (`AVAILABLE` / `SOLD_OUT`)
- is_active
- max_quantity_per_order (opsional)
- created_at
- updated_at

## Product Image
- id
- product_id
- image_url
- is_main (tepat satu gambar utama per produk)
- sort order
- alt text
- created_at

## Order
- id
- order_number (`ENC-YYYYMMDD-XXXX`, unik)
- tracking_token (disimpan dalam bentuk aman/hash bila sesuai)
- source (`WEBSITE` / `MANUAL`)
- created_by_admin (bila manual)
- customer_name
- customer_phone
- pickup_date
- subtotal
- discount_total
- grand_total
- dp_amount (bila DP)
- paid_amount
- remaining_amount
- order_status
- payment_status
- payment_method (`QRIS` / `BANK_TRANSFER` / `CASH`)
- payment_option (`DP_50` / `FULL`)
- reservation_expires_at (QRIS/Transfer; kosong untuk Cash)
- notes (opsional)
- cancellation_reason
- cancelled_by
- cancelled_at
- created_at
- updated_at

## Order Item
- id
- order_id
- product_id
- product_name_snapshot
- product_type_snapshot
- minimum_preorder_days_snapshot
- unit_price_snapshot
- sale_price_snapshot
- quantity
- subtotal

## Payment (transaksi)
- id
- order_id
- purpose (`DP` / `FULL` / `REMAINING`)
- amount
- method
- status
- provider
- provider transaction ID / reference
- expires_at
- paid_at
- verified_by (Transfer/Cash)
- created_at
- updated_at

## Payment Proof
- id
- order_id
- payment_id
- file reference (lokasi penyimpanan privat, bukan URL publik)
- file type
- file size
- uploaded_at
- verification_status
- verified_by
- verified_at
- rejection note (opsional)

## Refund
- id
- order_id
- payment_id (opsional)
- amount
- status
- reason
- refunded_at
- recorded_by
- created_at

## Pickup Date / Capacity
- id
- date
- capacity_override (opsional; kosong = pakai kapasitas default)
- reserved_count/used_count (atau dihitung dari order aktif — ditentukan technical planning)
- is_blocked
- block_reason (opsional)
- created_at
- updated_at

## Order Status History / Audit Log
- id
- order_id
- event type (order status, payment status, verifikasi, refund, pembatalan, penerbitan ulang kode akses, dsb.)
- old value
- new value
- reason / note
- changed_by (admin atau System)
- created_at

## Payment Webhook Event
- id
- provider
- provider event/transaction ID (untuk idempotency)
- payload ringkas / hash
- verification result
- processed_at
- created_at

## Website Settings
- id
- key
- value
- updated_at

Struktur database final ditentukan pada technical planning setelah stack dan database dipilih.

---

# 42. Non-Functional Requirements

## Performance
- Halaman utama harus cepat dimuat pada desktop maupun perangkat mobile.
- Gambar harus dioptimalkan.
- Jangan mengirim aset yang tidak diperlukan.
- Gunakan lazy loading untuk gambar yang sesuai.
- Responsive layout tidak boleh bergantung pada asset desktop berukuran besar yang tidak perlu dikirim ke perangkat kecil.

## Reliability
- Order tidak boleh hilang karena refresh.
- Payment callback harus dapat diproses secara aman.
- Sistem harus menangani retry webhook.

## Scalability
Arsitektur harus cukup fleksibel untuk:
- lebih banyak produk;
- lebih banyak order;
- lebih banyak admin;
- penambahan WhatsApp API;
- penambahan delivery;
- penambahan payment method.

## Maintainability
- Kode terstruktur.
- Komponen reusable.
- Business logic tidak ditaruh sembarangan di UI.
- Environment-specific configuration menggunakan environment variables.
- Dokumentasi setup disediakan.

---

# 43. SEO

Website publik sebaiknya memiliki:

- title yang sesuai;
- meta description;
- semantic HTML;
- URL yang jelas;
- Open Graph metadata;
- favicon;
- sitemap bila relevan;
- robots configuration;
- optimasi gambar;
- struktur heading yang baik.

Detail SEO content akan ditentukan setelah branding dan copywriting final.

---

# 44. Accessibility

Minimal:

- kontras teks yang memadai;
- tombol memiliki label jelas;
- form memiliki label;
- navigasi keyboard yang wajar;
- alt text untuk gambar produk;
- focus state;
- error message yang mudah dipahami.

---

# 45. Admin Order Workflow

Urutan konfirmasi dan pembayaran **berbeda per metode pembayaran**. Flow lengkap ada di §22.2.

Ringkasan peran admin:

| Metode | Pemicu "Dikonfirmasi" | Tindakan admin terkait pembayaran |
|---|---|---|
| QRIS | Webhook sukses terverifikasi (otomatis oleh System, DI-04) | Memantau; tidak perlu verifikasi manual |
| Transfer Bank | Admin menyetujui bukti pembayaran | Verifikasi bukti transfer |
| Cash | Admin menerima order | Menandai `PAID` saat customer membayar di pickup |

Setelah Dikonfirmasi, admin menggerakkan order: **Pesanan Diproses → Siap Diambil → Selesai**.

Jika terjadi pembatalan:

```text
Pesanan
   ↓  admin membatalkan + mencatat alasan
Dibatalkan  (slot dilepas; refund dicatat manual bila ada pembayaran)
```

Kebijakan finansial pembatalan/refund (berapa yang dikembalikan) wajib dikonfirmasi klien sebelum production (FD-61); sistem cukup mampu mencatatnya.

---

# 46. Customer Order Workflow

```text
Homepage
   ↓
Product Catalog
   ↓
Product Detail
   ↓
Add to Cart
   ↓
Cart
   ↓
Checkout
   ↓
Customer Information
   ↓
Pickup Date
   ↓
Payment Method (Cash hanya untuk Ready Stock-only)
   ↓
DP 50% / Full Payment (DP hanya QRIS/Transfer)
   ↓
Konfirmasi ringkasan
   ↓
Order Created (slot reserved)
   ↓
Order Success (nomor order + kode akses)
   ↓
Payment (QRIS / transfer + upload bukti / cash saat pickup)
   ↓
Payment Confirmation
   ↓
Order Tracking (termasuk pelunasan sisa DP)
   ↓
Pickup
   ↓
Completed
```

---

# 47. Admin Workflow

```text
Admin Login
   ↓
Dashboard
   ├── Products (+ Categories)
   ├── Orders (+ Manual Order)
   ├── Payments (verifikasi, cash, refund)
   ├── Pickup Capacity
   └── Website Settings
```

---

# 48. Payment Workflow

```text
Checkout
   ↓
Calculate total on server
   ↓
Create order + reserve capacity (atomic)
   ↓
Create payment transaction (DP atau penuh)
   ↓
Customer pays
   ↓
Payment provider
   ↓
Webhook
   ↓
Validate webhook (verifikasi + idempotency)
   ↓
Update payment
   ↓
Update order payment summary (+ Dikonfirmasi)
   ↓
Customer tracking + Admin dashboard
```

Flow di atas berlaku untuk QRIS. Transfer Bank menggantikan langkah provider/webhook dengan **upload bukti → verifikasi admin**. Cash tidak membuat transaksi online; admin mencatat pembayaran saat pickup. Pelunasan sisa DP membuat transaksi baru dengan purpose `REMAINING`.

---

# 49. WhatsApp Order Workflow

Order melalui WhatsApp bukan bagian dari checkout website versi awal.

Customer dapat:
- membuka WhatsApp;
- menghubungi admin;
- berdiskusi mengenai produk/order;
- mengirim bukti pembayaran melalui WhatsApp jika pembayaran dilakukan melalui jalur tersebut.

Order WhatsApp dimasukkan ke dashboard oleh admin melalui fitur **Manual Order** (§50), yang merupakan bagian V1.

---

# 50. Admin Manual Order — V1

**Manual Order adalah bagian V1** (FD-78). Admin dapat mencatat order yang masuk dari WhatsApp/offline (FD-79).

Tujuan:
- mencatat order dari WhatsApp;
- mencatat order offline;
- menjaga semua order tetap berada dalam satu sistem;
- menghitung kapasitas pickup secara konsisten.

Flow:

```text
Admin
 ↓
Create Manual Order
 ↓
Input customer
 ↓
Pilih produk
 ↓
Pilih pickup date
 ↓
Pilih payment method/status
 ↓
Create order (reserve kapasitas secara atomik)
```

Aturan:
- Manual order **wajib memakai kapasitas tanggal pickup yang sama** dengan order website (FD-80), melalui mekanisme reservasi atomik yang sama.
- Manual order ditandai `source = MANUAL` dan mencatat admin pembuatnya di audit trail.
- Manual order memperoleh nomor order dengan format yang sama. Apakah kode akses tracking juga diterbitkan untuk manual order (agar customer WhatsApp dapat melacak) direkomendasikan, namun masih perlu dikonfirmasi (OC-10).
- Apakah manual order tunduk pada seluruh validasi checkout customer (blokir tanggal, kapasitas penuh, minimum Pre-Order, cutoff, larangan Cash untuk Pre-Order) atau admin boleh override **masih perlu dikonfirmasi** (OC-05 di `FINAL-REQUIREMENT-DECISIONS.md`).

Ini bukan requirement customer-facing, tetapi penting untuk menjaga kapasitas nyata tetap akurat.

---

# 51. Reporting Dasar

V1 **tidak** memiliki modul BI/reporting lanjutan (FD-89). Dashboard menyediakan ringkasan operasional (FD-90):

- order berdasarkan status;
- pembayaran yang perlu diverifikasi;
- order/kapasitas berdasarkan tanggal pickup mendatang;
- ringkasan pendapatan sederhana (mis. total pembayaran diterima dan total sisa pembayaran).

Laporan tambahan seperti produk yang paling sering dipesan bersifat opsional dan tidak wajib di V1.

Advanced analytics tidak menjadi requirement versi awal.

---

# 52. Empty, Loading, Error, Success States

Setiap fitur utama harus memiliki state yang jelas.

Contoh:

### Cart kosong
> Belum ada produk di keranjang.

### Checkout berhasil
> Pesanan berhasil dibuat.

### Payment pending
> Menunggu pembayaran.

### Payment success
> Pembayaran berhasil diterima.

### Date full
> Tanggal pickup penuh.

### Product unavailable / Sold Out
> Produk saat ini tidak tersedia.

### Payment expired
> Batas waktu pembayaran telah habis dan pesanan dibatalkan. Silakan buat pesanan baru.

### Waiting verification
> Bukti pembayaran sedang diverifikasi admin.

### Server error
> Terjadi masalah. Silakan coba lagi.

---

# 53. Acceptance Criteria Utama

Produk dianggap memenuhi requirement utama jika:

1. Customer dapat melihat katalog.
2. Customer dapat melihat detail produk.
3. Customer dapat memasukkan banyak produk ke cart.
4. Customer dapat mengubah quantity.
5. Customer dapat checkout tanpa login.
6. Customer dapat memilih tanggal pickup.
7. Sistem mencegah pickup date yang tidak memenuhi minimum Pre-Order (hari kalender WIB, minimum terlama).
8. Sistem membatasi kapasitas per pickup date (default 10, dapat di-override per tanggal) secara concurrency-safe.
9. Sistem menghitung 1 checkout sebagai 1 order.
10. Ready Stock dan Pre-Order dapat berada dalam satu order.
11. Customer dapat memilih DP 50% atau pembayaran penuh untuk QRIS/Transfer; DP = ceil(total × 0,5).
12. Sistem menyimpan paid amount dan remaining amount.
13. Order status dan payment status terpisah.
14. Admin dapat mengelola produk, kategori, featured, dan availability (Sold Out).
15. Admin dapat mengelola order, termasuk membuat Manual Order yang memakai kapasitas yang sama.
16. Admin dapat mengubah status order dan membatalkan order dengan alasan tercatat.
17. Customer dapat melihat perubahan status melalui tracking dengan nomor order + kode akses.
18. Pembayaran online dapat diuji di sandbox.
19. Payment webhook dapat memperbarui status secara aman dan idempotent.
20. Customer tidak dapat mengakses data order customer lain.
21. Cash pickup dapat ditandai lunas oleh admin.
22. Kapasitas pickup dikembalikan ketika order dibatalkan/expired sesuai aturan reservasi (QRIS 30 menit, Transfer 2 jam, Cash tidak expired).
23. Website responsif.
24. Data sensitif tidak disimpan atau dikirim secara tidak aman.
25. Cash tidak dapat dipilih untuk order yang berisi Pre-Order (divalidasi di server).
26. Ready Stock same-day hanya dapat dipesan sebelum pickup cutoff.
27. Tanggal pickup dibatasi booking horizon dan tanggal yang diblokir admin.
28. Admin dapat memverifikasi bukti transfer (JPG/PNG/PDF ≤ 5 MB) yang tidak terekspos publik.
29. Admin dapat mencatat refund manual (jumlah, status, alasan, waktu, operator).
30. Admin dapat mengelola Website Settings.
31. Admin dapat mengganti password.
32. UI customer dan admin menggunakan Bahasa Indonesia.

---

# 54. Status Keputusan dan Informasi yang Masih Diperlukan

PRD tidak boleh mengarang keputusan yang belum diberikan.

Sebagian besar keputusan yang sebelumnya terbuka sudah **diselesaikan** di `FINAL-REQUIREMENT-DECISIONS.md`. Bagian ini mencatat statusnya.

## 54.1 Sudah Diputuskan

| Topik | Keputusan | Referensi |
|---|---|---|
| Payment gateway | Provider sengaja tidak dipilih di level requirement; direkomendasikan di Technical Implementation Plan, hindari lock-in | FD-48, FD-49 |
| Masa reservasi pembayaran | QRIS 30 menit, Transfer 2 jam (configurable), Cash tidak expired; order expired → Dibatalkan | FD-12–15, §10 |
| Jam pickup | Hanya tanggal yang dipilih; jam pickup informasional & configurable | FD-10, FD-11 |
| Blokir tanggal / hari libur | Admin dapat memblokir tanggal | FD-06 |
| Customer notes | Opsional saat checkout | FD-34 |
| Custom Cake | Kategori/produk biasa; tanpa configurator; kustomisasi via WhatsApp | FD-29 |
| Pembatalan | Hanya admin, dengan alasan; customer meminta via WhatsApp | FD-58–60 |
| Refund (sistem) | Dicatat manual oleh admin; tanpa kebijakan otomatis | FD-61–64 |

## 54.2 Klarifikasi Tambahan (Bukan Blocker untuk Technical Implementation Plan)

Daftar lengkap ada di `FINAL-REQUIREMENT-DECISIONS.md` §19 (OC-01 s.d. OC-12). Ringkasnya: penolakan bukti transfer, pembayaran QRIS yang terlambat setelah expiry, cutoff untuk Pre-Order, tenggat & jalur pelunasan sisa DP, validasi Manual Order, konfirmasi manual QRIS, retry QRIS setelah gagal, no-show Cash, status yang boleh dibatalkan, kode akses untuk manual order, serta wording badge.

## 54.3 Data Klien yang Wajib Ada Sebelum Go-Live

Tidak memblokir planning maupun development. Selama development digunakan placeholder/konfigurasi yang ditandai jelas (FD-99).

### Branding
- Logo final
- Warna brand final (palet `PRD-Design.md` adalah arah desain)
- Font final
- Tone of voice / copy marketing yang disetujui
- Foto produk final

### Konten & Operasional
- Deskripsi bisnis
- Alamat pickup
- Jam operasional & jam pickup final
- Pickup cutoff final (jika berbeda dari default 15:00 WIB)
- Nomor WhatsApp
- Akun media sosial
- Instruksi pickup & instruksi pembayaran
- Data produk & kategori asli

### Bank Transfer
- Nama bank
- Nomor rekening
- Nama pemilik rekening

### Kebijakan
- Kebijakan pembatalan & refund finansial (penting karena ada DP 50%)
- Privacy policy / terms (bila ditampilkan)

### Payment Gateway
- Merchant account production dan onboarding QRIS


---

# 55. Future Enhancements

Setelah versi awal stabil, sistem dapat dikembangkan menjadi:

1. WhatsApp Business/API notification.
2. Custom cake configurator/builder.
3. Customer account.
4. Order history customer.
5. Delivery/local courier.
6. Dynamic delivery fee.
7. Promo code.
8. Voucher.
9. Scheduled discount.
10. Product variants (ukuran, rasa, dsb.).
11. Product search.
12. Pickup time slot.
13. Customer self-service cancellation.
14. Loyalty program.
15. Product review.
16. Advanced analytics / BI reporting.
17. Inventory management (stok terhitung).
18. Ingredient stock management.
19. Production planning.
20. Granular admin roles (RBAC).
21. Multi-branch.
22. Automated reminder sebelum pickup.
23. Automated payment reminder.
24. Automated refund workflow.
25. Pemulihan kode akses tracking otomatis (mis. via email/OTP).

Catatan: **Admin Manual Order** dan **Website Settings** sudah dipindahkan ke scope V1 (FD-78, FD-86). Item di atas tidak boleh diimplementasikan di V1 tanpa persetujuan terpisah.

---

# 56. Prinsip Implementasi untuk Claude Code

Claude Code **tidak boleh langsung membuat fitur yang belum didefinisikan sebagai requirement** hanya karena menurut model fitur tersebut terlihat umum.

Jika menemukan requirement yang ambigu:

1. Identifikasi ambiguitas.
2. Jelaskan konsekuensinya.
3. Ajukan pilihan.
4. Tunggu keputusan sebelum mengubah requirement.

Claude Code harus membedakan:

- **Confirmed Requirement**
- **Recommended Implementation**
- **Open Question**

Jangan mengubah recommendation menjadi business rule tanpa persetujuan.

---

# 57. Prinsip Source of Truth

Dalam sistem:

**Server/database adalah source of truth.**

Browser/customer tidak boleh menjadi sumber kebenaran untuk:
- harga;
- diskon;
- total;
- kapasitas;
- status pembayaran;
- status order;
- ketersediaan produk.

Frontend hanya menampilkan dan mengirim data.

Backend melakukan validasi dan perhitungan final.

---

# 58. Prinsip Payment Security

Jangan pernah:

- menyimpan secret payment gateway di frontend;
- menerima nominal pembayaran dari frontend sebagai nilai final;
- mengubah status menjadi "paid" hanya karena customer mengunggah screenshot;
- mempercayai webhook tanpa validasi;
- menampilkan secret API key.

Payment status final harus berasal dari mekanisme pembayaran yang dapat dipercaya atau verifikasi admin sesuai metode pembayaran.

---

# 59. Prinsip Pengembangan

Pengembangan dilakukan secara bertahap:

### Phase 1 — Foundation
- Project setup
- Database
- Authentication admin
- Basic layout

### Phase 2 — Public Website
- Homepage
- Product catalog
- Product detail
- Responsive design

### Phase 3 — Shopping
- Cart (persisted di browser)
- Checkout
- Pickup date (booking horizon, cutoff, blokir tanggal)
- Capacity system (reservasi atomik, override per tanggal)
- Pre-order validation

### Phase 4 — Orders
- Order creation
- Order success (nomor order + kode akses)
- Order detail
- Tracking (nomor order + token)
- Status management
- Reservation expiry & auto-cancel

### Phase 5 — Payment
- Payment gateway sandbox
- QRIS
- Payment status
- Webhook
- DP/full payment & pelunasan sisa
- Transfer bank + upload bukti + verifikasi admin
- Cash saat pickup
- Manual proof fallback

### Phase 6 — Admin
- Product & category management
- Order management
- Manual order
- Payment management (verifikasi, cash, refund record)
- Capacity management
- Website settings
- Ganti password admin

### Phase 7 — Testing
- Functional testing
- Payment testing
- Capacity race-condition testing
- Security testing
- Responsive testing
- Edge-case testing

### Phase 8 — Production
- Production environment
- Domain
- Hosting
- Production payment gateway
- QRIS merchant
- Monitoring
- Backup

Technical stack dan urutan detail implementasi akan ditentukan dalam **Technical Implementation Plan**, bukan dipaksakan di PRD ini.

---

# 60. Definition of Done

Fitur dianggap selesai apabila:

- Requirement telah diimplementasikan.
- Happy path berjalan.
- Error state tersedia.
- Validasi frontend dan backend tersedia bila diperlukan.
- Tidak merusak fitur existing.
- Responsive.
- Tidak terdapat secret di source code.
- Data tersimpan sesuai model.
- Authorization diterapkan.
- Edge case utama diuji.
- Dokumentasi setup diperbarui.
- Untuk payment, sandbox flow berhasil diuji sebelum production.

---

# 61. Ringkasan Produk

Enjua Cake's adalah website pemesanan kue dengan dua sisi utama:

### Customer

```text
Browse
 ↓
Product
 ↓
Cart
 ↓
Checkout (termasuk Pickup Date)
 ↓
Order Success (nomor order + kode akses)
 ↓
Payment
 ↓
Tracking
 ↓
Pickup
```

### Admin

```text
Login
 ↓
Dashboard
 ├── Products (+ Categories)
 ├── Orders (+ Manual Order)
 ├── Payments
 ├── Pickup Capacity
 └── Website Settings
```

Core business rules:

```text
1 customer tidak wajib login
1 checkout = 1 order
1 order dapat memiliki banyak produk
Ready Stock + Pre-Order boleh dalam satu order
kapasitas default 10 order per pickup date (override per tanggal oleh admin)
manual order memakai kapasitas yang sama
Pre-Order mengikuti minimum production lead time (hari kalender WIB, terlama)
Ready Stock same-day sebelum pickup cutoff
booking horizon default 60 hari
pickup only, pilih tanggal saja
QRIS + transfer bank + cash pickup
Cash hanya untuk Ready Stock-only, bayar penuh
DP 50% (ceil) atau full payment untuk QRIS/Transfer
reservasi: QRIS 30 menit, Transfer 2 jam, Cash tanpa expiry
order status ≠ payment status
tracking tanpa customer login, wajib nomor order + token
payment production diarahkan melalui payment gateway
QRIS diarahkan menggunakan dynamic transaction flow
webhook terverifikasi & idempotent untuk payment confirmation
refund dicatat manual oleh admin
UI Bahasa Indonesia, timezone WIB, uang integer Rupiah
```

---

# 62. Status Dokumen

**PRD Version 1.1 — Consolidated**

Versi 1.1 menyelaraskan PRD v1.0 dengan keputusan final hasil architecture review yang dicatat di `FINAL-REQUIREMENT-DECISIONS.md`.

Status prasyarat coding:
1. ~~Ambiguitas requirement utama diselesaikan~~ — selesai (`FINAL-REQUIREMENT-DECISIONS.md`).
2. ~~Design reference tersedia/ditinjau~~ — tersedia di `design-reference/homepage-reference.jpeg`, dijabarkan di `PRD-Design.md`.
3. User menyetujui PRD v1.1 — **menunggu**.
4. Technical Implementation Plan dibuat dan disetujui — **belum dibuat**.

Klarifikasi tambahan (OC-xx) dan data klien sebelum go-live (§54.3) **tidak** memblokir pembuatan Technical Implementation Plan.

**Jangan mulai implementasi hanya berdasarkan dokumen ini sebelum Technical Implementation Plan disetujui.**
