# Enjua Cake's — Final Requirement Decisions

**Document Version:** 1.2  
**Tanggal:** 2 Oktober 2026  
**Status:** Final — hasil architecture review (user + technical architect); seluruh OC (OC-01 s.d. OC-14) **RESOLVED**  
**Related documents:** `PRD.md` (v1.3), `PRD-Design.md` (v1.3), `IMPLEMENTATION-PLAN.md`, `design-reference/homepage-reference.jpeg`

### Riwayat Versi

| Versi | Perubahan |
|---|---|
| 1.0 | Keputusan final FD-01 s.d. FD-105, interpretasi turunan DI-01 s.d. DI-06, Open Clarifications OC-01 s.d. OC-12. |
| 1.1 | OC-01 s.d. OC-12 diselesaikan oleh user (§19). Keputusan resolusi dicatat sebagai FD-106 s.d. FD-117 (§19a). DI-01 s.d. DI-06 dikonfirmasi final; DI-03 diamandemen oleh FD-108. State transition order status didefinisikan (§19b). Konsekuensi turunan baru DI-07 s.d. DI-09 dan dua item lanjutan OC-13, OC-14 (§19c). |
| 1.2 | OC-13 dan OC-14 diselesaikan (FD-118, FD-119). DI-07 ditetapkan sebagai keputusan final (FD-120). FD-107 diamandemen: order Dibatalkan tidak dapat di-reinstate. Tidak ada lagi item OPEN. |

---

# 0. Fungsi Dokumen Ini

Dokumen ini adalah **resolution record** untuk seluruh requirement yang sebelumnya ambigu atau saling bertentangan antara `PRD.md`, `PRD-Design.md`, dan design reference.

## 0.1 Urutan Prioritas Sumber Kebenaran

1. **Dokumen ini** — prioritas tertinggi untuk poin yang sebelumnya ambigu/bertentangan.
2. **`PRD.md`** — sumber functional requirements dan business rules yang tidak diubah oleh dokumen ini.
3. **`PRD-Design.md`** — sumber design/UI/UX requirements.
4. **`design-reference/homepage-reference.jpeg`** — inspirasi visual saja, tidak boleh disalin literal.

`PRD.md` dan `PRD-Design.md` versi 1.3 sudah diselaraskan dengan dokumen ini. Jika di kemudian hari ditemukan perbedaan, dokumen ini yang berlaku sampai dokumen lain diperbaiki.

## 0.2 Konvensi

- **FD-xx** = Final Decision (keputusan yang sudah dikunci).
- **DI-xx** = Derived Interpretation — konsekuensi logis langsung dari FD yang perlu ditulis eksplisit agar implementasi konsisten. Bukan keputusan bisnis baru; ditandai agar dapat dikoreksi bila tidak sesuai maksud.
- **OC-xx** = Open Clarification — pertanyaan yang belum diputuskan pada saat ditemukan, **bukan blocker** untuk Technical Implementation Plan. Status setiap OC dicatat sebagai **OPEN** atau **RESOLVED**; pertanyaan aslinya tidak dihapus (decision history).
- **GL-xx** = Data klien yang wajib tersedia sebelum **go-live** (bukan blocker untuk planning maupun development).
- Nilai enum internal (mis. `READY_STOCK`, `WAITING_PAYMENT`) adalah identifier konseptual. Nama teknis final ditentukan pada technical planning, maknanya tidak boleh berubah.

---

# 1. Order & Pickup

| ID | Keputusan |
|---|---|
| FD-01 | Layanan **pickup only**. Tidak ada delivery di V1. |
| FD-02 | Kapasitas default **10 order per tanggal pickup**. |
| FD-03 | **1 order = 1 slot kapasitas**, berapa pun jumlah item/unitnya. |
| FD-04 | Ready Stock dan Pre-Order boleh berada dalam satu order. |
| FD-05 | Reservasi kapasitas wajib **concurrency-safe / atomic** (slot terakhir tidak boleh didapat dua order). |
| FD-06 | Admin **dapat memblokir** tanggal pickup (dan membukanya kembali). |
| FD-07 | Admin **dapat meng-override kapasitas** untuk tanggal tertentu. |
| FD-08 | **Booking horizon** default **60 hari** ke depan, dapat dikonfigurasi. |
| FD-09 | Timezone sistem untuk seluruh aturan tanggal/waktu bisnis: **Asia/Jakarta (WIB)**. |
| FD-10 | V1 hanya memilih **tanggal** pickup, **bukan** slot jam. |
| FD-11 | Jam pickup bersifat **informasional** dan dapat dikonfigurasi. |

---

# 2. Reservasi Pembayaran & Kedaluwarsa

| ID | Keputusan |
|---|---|
| FD-12 | **QRIS:** slot di-reserve selama pembayaran pending. Default expiry **30 menit**, dapat dikonfigurasi. |
| FD-13 | **Transfer Bank:** slot di-reserve selama menunggu transfer/bukti. Default expiry **2 jam**, dapat dikonfigurasi. |
| FD-14 | Order QRIS/Transfer yang **belum dibayar** sampai expiry: payment = `EXPIRED`, order = **Dibatalkan**, alasan pembatalan mencatat payment expiry, slot kapasitas **dilepas**. |
| FD-15 | Order **Cash tidak kedaluwarsa** karena belum dibayar (pembayaran terjadi saat pickup). |

**Derived interpretations:**

- **DI-01** *(dikonfirmasi final — FD-114)* — Expiry pada FD-14 hanya berlaku untuk order yang **belum memiliki pembayaran terkonfirmasi**. Order yang DP-nya sudah terbayar (`PARTIALLY_PAID`) tidak dibatalkan otomatis apabila transaksi pelunasannya kedaluwarsa; hanya transaksi pelunasan tersebut yang `EXPIRED`.
- **DI-02** *(dikonfirmasi final — FD-114; lihat juga FD-106 dan DI-07 untuk kasus bukti ditolak)* — Untuk Transfer Bank, timer expiry berlaku sampai bukti pembayaran diunggah ("waiting for transfer/proof"). Setelah bukti diunggah (`WAITING_VERIFICATION`), order tidak dibatalkan otomatis selama menunggu verifikasi admin.

---

# 3. Ready Stock & Pre-Order

| ID | Keputusan |
|---|---|
| FD-16 | Setiap produk Pre-Order memiliki `minimum_preorder_days`. |
| FD-17 | Hari dihitung sebagai **hari kalender WIB**. |
| FD-18 | Cart dengan beberapa produk Pre-Order memakai `minimum_preorder_days` **terlama**. |
| FD-19 | Ready Stock **boleh same-day pickup** jika kapasitas tersedia, tanggal terbuka, dan order dibuat **sebelum pickup cutoff**. *(Lihat FD-108: cutoff juga berlaku untuk Pre-Order.)* |
| FD-20 | **Pickup cutoff** dapat dikonfigurasi; default development **15:00 WIB**. |
| FD-21 | Jika cutoff sudah lewat, tanggal pickup paling awal untuk Ready Stock adalah **tanggal tersedia berikutnya**. |

**Derived interpretation:**

- **DI-03** *(dikonfirmasi final — FD-114, **diamandemen oleh FD-108**)* — Versi awal: tanggal pickup paling awal untuk order yang berisi Pre-Order = tanggal order (WIB) + `minimum_preorder_days` terlama (hari kalender). **Versi berlaku setelah FD-108:** yang dipakai adalah **tanggal order efektif** (tanggal order bila sebelum pickup cutoff; hari kalender berikutnya bila pada/sesudah cutoff) + `minimum_preorder_days` terlama. Contoh (cutoff 15:00, minimum 3 hari): order 2 Okt 14:00 → paling awal 5 Okt; order 2 Okt 16:00 → paling awal 6 Okt.

---

# 4. Produk

| ID | Keputusan |
|---|---|
| FD-22 | Konsep produk wajib mendukung: `name`, `description`, `price`, `sale_price` (opsional), `product_type` (`READY_STOCK` / `PRE_ORDER`), `minimum_preorder_days` (bila Pre-Order), `category`, `featured` (boolean), `availability` (`AVAILABLE` / `SOLD_OUT`), `active` (boolean), `max_quantity_per_order` (opsional), satu gambar utama, nol atau lebih gambar tambahan, timestamps. |
| FD-23 | **Category** adalah bagian resmi sistem produk. Category card di homepage wajib memakai kategori produk yang nyata. |
| FD-24 | **Featured** adalah flag produk yang dikendalikan admin. |
| FD-25 | **Diskon V1** = `price` + `sale_price` opsional. Persentase diskon boleh dihitung untuk tampilan. **Tidak ada** coupon, voucher, promo code, atau scheduled discount di V1. |
| FD-26 | **Sold Out** = state availability manual yang dikendalikan admin, **bukan** sistem penghitungan stok. |
| FD-27 | `active = false` → produk tersembunyi/nonaktif. `SOLD_OUT` → produk **tetap terlihat** tetapi **tidak dapat dibeli** saat ini. |
| FD-28 | Kapasitas tetap dihitung **per order**, bukan per unit. Produk boleh memiliki `max_quantity_per_order` opsional. **Tidak ada** batas quantity global. |
| FD-29 | **Custom Cake** boleh ada sebagai kategori/produk. **Tidak ada** custom cake builder/configurator di V1. Kustomisasi kompleks diarahkan ke WhatsApp. |
| FD-30 | **Product variants bukan bagian V1** kecuali disetujui terpisah di kemudian hari. Referensi variant yang mengesankan fitur ter-implementasi dihapus. |

---

# 5. Cart & Checkout

| ID | Keputusan |
|---|---|
| FD-31 | Cart anonim disimpan (persisted) di **browser customer**. |
| FD-32 | Harga dari browser **tidak pernah dipercaya**. Server menghitung ulang dan memvalidasi harga, diskon, availability, aturan Pre-Order, dan kapasitas saat checkout. |
| FD-33 | Tanggal pickup dipilih di **CHECKOUT**, bukan di cart. |
| FD-34 | Data checkout **wajib**: nama customer, nomor WhatsApp, tanggal pickup, item order, metode pembayaran, opsi pembayaran. **Opsional**: catatan customer. |
| FD-35 | **Tidak** mewajibkan email customer maupun alamat pengiriman di V1. |

---

# 6. Pembayaran

## 6.1 Metode

| ID | Keputusan |
|---|---|
| FD-36 | Metode pembayaran V1: **QRIS**, **Transfer Bank**, **Cash saat Pickup**. |
| FD-37 | **QRIS:** target production adalah QRIS dinamis melalui payment gateway; wajib webhook yang diverifikasi backend; wajib mendukung sandbox; pemrosesan webhook wajib **idempotent**. *(Konfirmasi QRIS hanya via webhook: FD-111; retry setelah gagal: FD-112; webhook terlambat: FD-107.)* |
| FD-38 | **Transfer Bank:** customer menerima instruksi rekening, mengunggah bukti pembayaran, admin memverifikasi bukti. *(Penolakan bukti: FD-106.)* |
| FD-39 | **Cash:** hanya pembayaran penuh, **tanpa DP**. Admin menandai pembayaran `PAID` saat pickup. |

## 6.2 Pembatasan Pre-Order

| ID | Keputusan |
|---|---|
| FD-40 | **Cash TIDAK tersedia** jika order berisi **minimal satu** produk Pre-Order. Order dengan Pre-Order wajib memakai QRIS atau Transfer Bank. |
| FD-41 | Order yang **hanya** berisi Ready Stock boleh memakai QRIS, Transfer Bank, atau Cash. |

## 6.3 DP

| ID | Keputusan |
|---|---|
| FD-42 | QRIS dan Transfer Bank mendukung **DP 50%** atau **Bayar Penuh**. |
| FD-43 | Nilai mata uang disimpan sebagai **integer Rupiah**. |
| FD-44 | **DP = ceil(total × 0,5)**. **Sisa = total − DP**. Contoh: total Rp125.555 → DP Rp62.778, sisa Rp62.777. |
| FD-45 | Customer dapat melihat total, jumlah sudah dibayar, dan sisa pembayaran. |
| FD-46 | Sisa pembayaran dapat dibayar melalui flow online/transfer yang didukung dari halaman tracking/payment. *(Pelunasan wajib sebelum Selesai, hanya QRIS/Transfer: FD-109.)* |

## 6.4 Biaya & Provider

| ID | Keputusan |
|---|---|
| FD-47 | Biaya gateway/payment processing **ditanggung merchant** di V1. Tidak ada biaya gateway terpisah untuk customer. |
| FD-48 | Provider payment gateway **sengaja tidak dipilih** di level requirement. Technical Implementation Plan wajib merekomendasikan provider berdasarkan QRIS, sandbox, webhook, dokumentasi, biaya, dan merchant onboarding. |
| FD-49 | Arsitektur pembayaran harus menghindari **provider lock-in** yang tidak perlu. |

## 6.5 Bukti Pembayaran

| ID | Keputusan |
|---|---|
| FD-50 | Tipe file yang diizinkan: **JPG/JPEG, PNG, PDF**. Ukuran maksimal default **5 MB**. |
| FD-51 | Upload divalidasi di server, disimpan secara aman, tidak dapat dieksekusi, dan **tidak terekspos publik**. Hanya admin terautentikasi / akses order yang sah yang dapat melihatnya. |

---

# 7. Payment Status

| ID | Keputusan |
|---|---|
| FD-52 | Makna internal payment status wajib mendukung: `UNPAID`, `WAITING_PAYMENT`, `WAITING_VERIFICATION`, `PARTIALLY_PAID`, `PAID`, `FAILED`, `EXPIRED`, `REFUNDED`, `PARTIALLY_REFUNDED`. |
| FD-53 | UI customer/admin memakai **label Bahasa Indonesia** yang jelas. |

Pemetaan label (label indikatif, wording final boleh disesuaikan selama makna sama — sesuai PRD §14):

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

---

# 8. Order Status & Flow

| ID | Keputusan |
|---|---|
| FD-54 | Order status final: **Pesanan Baru, Dikonfirmasi, Pesanan Diproses, Siap Diambil, Selesai, Dibatalkan**. *(State transition: FD-116, §19b.)* |
| FD-55 | **Tidak** memakai status "Pesanan Diterima" (konflik dengan "Pesanan Baru"). |

## 8.1 Flow per Metode Pembayaran

**QRIS**
```text
Pesanan Baru (order dibuat, payment WAITING_PAYMENT, slot reserved 30 menit)
→ customer bayar QRIS
→ webhook sukses terverifikasi
→ payment PARTIALLY_PAID (DP) atau PAID (penuh)
→ order Dikonfirmasi
→ Pesanan Diproses
→ Siap Diambil
→ Selesai
```

**Transfer Bank**
```text
Pesanan Baru (payment WAITING_PAYMENT, slot reserved 2 jam)
→ customer transfer
→ bukti pembayaran diunggah → WAITING_VERIFICATION
→ admin menyetujui bukti
→ payment PARTIALLY_PAID atau PAID
→ order Dikonfirmasi
→ Pesanan Diproses
→ Siap Diambil
→ Selesai
```

**Cash (hanya order Ready Stock-only)**
```text
Pesanan Baru (payment UNPAID, slot reserved tanpa expiry)
→ admin menerima order → Dikonfirmasi
→ Pesanan Diproses
→ Siap Diambil
→ customer membayar cash saat pickup → admin menandai PAID
→ Selesai
```

**Derived interpretation:**

- **DI-04** *(dikonfirmasi final — FD-114; diperkuat FD-111)* — Pada flow QRIS tidak ada langkah admin sebelum "Dikonfirmasi" (berbeda dengan Cash yang eksplisit "admin accepts"). Karena itu, perubahan ke **Dikonfirmasi** setelah webhook sukses terverifikasi dibaca sebagai **otomatis oleh System** dan dicatat di audit trail sebagai "oleh System". Pada Transfer Bank, persetujuan bukti oleh admin memicu Dikonfirmasi.

## 8.2 Order Expiry

| ID | Keputusan |
|---|---|
| FD-56 | Untuk order QRIS/Transfer yang belum dibayar dan kedaluwarsa: payment = `EXPIRED`; order = **Dibatalkan**; alasan pembatalan mencatat payment expiry; kapasitas yang di-reserve dilepas. |
| FD-57 | Order Cash dikecualikan dari pembatalan karena payment expiry. |

## 8.3 Pembatalan

| ID | Keputusan |
|---|---|
| FD-58 | Customer **tidak** memiliki self-service cancellation di V1. |
| FD-59 | Customer dapat meminta pembatalan melalui WhatsApp. |
| FD-60 | Admin yang melakukan pembatalan dan mencatat alasan + informasi audit. |

## 8.4 Refund

| ID | Keputusan |
|---|---|
| FD-61 | Kebijakan kelayakan refund **wajib dikonfirmasi klien sebelum production**. Ini **bukan blocker** arsitektur. |
| FD-62 | Sistem harus mampu mencatat refund: **jumlah, status, alasan, waktu, operator**. |
| FD-63 | Pemrosesan refund V1 bersifat **manual / dikendalikan admin**. |
| FD-64 | **Jangan** mengarang kebijakan refund otomatis. |

---

# 9. Order Tracking & Order Number

| ID | Keputusan |
|---|---|
| FD-65 | Tidak ada akun/login customer. |
| FD-66 | Tracking membutuhkan **order identifier + mekanisme akses aman**. |
| FD-67 | Sistem membuat **tracking token acak high-entropy**, diperlakukan sebagai **kredensial keamanan**. |
| FD-68 | Sebaiknya disimpan dalam bentuk representasi aman/hash bila secara teknis sesuai. |
| FD-69 | Nomor order saja **tidak pernah** boleh membuka detail order yang bersifat privat. |
| FD-70 | Format nomor order: **`ENC-YYYYMMDD-XXXX`**. Tanggal = **tanggal order dibuat** (WIB). Suffix menjamin keunikan. Nomor order = identifikasi yang mudah dibaca, **bukan** autentikasi. |

## 9.1 Penyampaian Akses Tracking

| ID | Keputusan |
|---|---|
| FD-71 | Setelah checkout berhasil, tampilkan: nomor order, kode tracking/akses, aksi/link tracking langsung, aksi copy, dan aksi bantuan WhatsApp. |
| FD-72 | Jika customer kehilangan informasi akses, pemulihan di V1 dilakukan melalui **admin/WhatsApp**. |
| FD-73 | **Tidak** membangun pemulihan otomatis via email. |

**Derived interpretation:**

- **DI-05** *(dikonfirmasi final — FD-114)* — Jika token disimpan sebagai hash (FD-68), sistem tidak dapat menampilkan ulang token lama. Konsekuensinya, pemulihan oleh admin (FD-72) dilakukan dengan **menerbitkan ulang (regenerate) kode akses** untuk order tersebut, lalu admin menyampaikannya secara manual via WhatsApp setelah memverifikasi customer. Token lama otomatis tidak berlaku.

---

# 10. WhatsApp

| ID | Keputusan |
|---|---|
| FD-74 | V1 memakai link `wa.me` dengan pre-filled text. **Tidak ada** pengiriman pesan otomatis via WhatsApp API. |
| FD-75 | WhatsApp dapat ditampilkan pada: floating contact, footer, halaman order sukses, tracking, bantuan pembatalan, dan inquiry Custom Cake. |
| FD-76 | Pesan konteks **boleh** memuat nomor order. |
| FD-77 | Pesan pre-filled **tidak boleh** memuat tracking token. |

---

# 11. Manual Order

| ID | Keputusan |
|---|---|
| FD-78 | **Manual Order adalah bagian V1.** |
| FD-79 | Admin dapat mencatat order yang masuk dari WhatsApp/offline. |
| FD-80 | Manual order **wajib memakai kapasitas tanggal pickup yang sama**, agar kapasitas nyata tetap akurat. *(Validasi & override: FD-110; tracking token: FD-115.)* |

---

# 12. Admin

| ID | Keputusan |
|---|---|
| FD-81 | V1 memiliki satu permission level: **ADMIN**. |
| FD-82 | Boleh ada beberapa akun admin dengan permission yang sama. Tidak ada RBAC kompleks di V1. |
| FD-83 | Login/logout admin yang aman. |
| FD-84 | Admin yang sedang login dapat **mengganti password**. |
| FD-85 | Flow forgot-password publik self-service **tidak wajib**, kecuali technical plan merekomendasikan mekanisme yang aman dan sederhana. |

---

# 13. Website Settings

| ID | Keputusan |
|---|---|
| FD-86 | **Website Settings adalah bagian V1.** |
| FD-87 | Setting yang dapat dikonfigurasi meliputi: nama bisnis, deskripsi bisnis, alamat, nomor WhatsApp, jam operasional, jam pickup, pickup cutoff, kapasitas default, booking horizon, informasi rekening bank, media sosial, instruksi pickup, instruksi pembayaran. |
| FD-88 | Nilai production harus berasal dari klien dan **tidak boleh dikarang**. |

**Derived interpretation:**

- **DI-06** *(dikonfirmasi final — FD-114)* — Durasi expiry reservasi QRIS (FD-12) dan Transfer (FD-13) juga "dapat dikonfigurasi". Apakah konfigurasi tersebut tampil di Website Settings admin atau cukup sebagai konfigurasi sistem/environment ditentukan di technical planning.

---

# 14. Reporting

| ID | Keputusan |
|---|---|
| FD-89 | **Tidak ada** modul BI/reporting lanjutan di V1. |
| FD-90 | Dashboard menyediakan ringkasan operasional: order per status, pembayaran yang perlu diverifikasi, pickup/kapasitas mendatang, dan ringkasan pendapatan sederhana. |

---

# 15. Bahasa, Navigasi, Struktur Halaman

| ID | Keputusan |
|---|---|
| FD-91 | Bahasa utama UI customer dan admin: **Bahasa Indonesia**. Nama brand tetap **Enjua Cake's**. Jangan mencampur label fungsional Bahasa Inggris kecuali disetujui. *(Pengecualian badge Ready Stock / Pre-Order / Sold Out: FD-117.)* |
| FD-92 | Navigasi desktop: **Beranda, Produk, Cara Pesan, Tentang Kami, Lacak Pesanan, Kontak, Cart, Pesan Sekarang**. |
| FD-93 | Navigasi mobile: **Logo, Cart, Hamburger/drawer**. |
| FD-94 | **Search bukan requirement V1.** Jangan mengimplementasikan search hanya karena ikon search ada di design reference. |
| FD-95 | Homepage dapat memuat: Hero, Featured Products, Categories, About, How to Order, Contact. |
| FD-96 | Halaman/route fungsional terpisah (katalog/produk, cart, checkout, order sukses, tracking, admin) ditentukan pada implementation planning. |

---

# 16. Footer & Brand Assets

| ID | Keputusan |
|---|---|
| FD-97 | Footer berisi informasi Enjua Cake's yang relevan: navigasi, kontak, alamat, informasi pickup, WhatsApp, media sosial, privacy/terms, kebijakan pembatalan/refund **bila disediakan**. |
| FD-98 | **Tidak** menampilkan shipping policy (pickup only). Tidak menyalin konten Sugar Bliss. |
| FD-99 | Placeholder diperbolehkan selama development. Sebelum production, klien wajib menyediakan/menyetujui: logo, foto produk, alamat, WhatsApp, rekening bank, akun sosial media, dan informasi operasional final. |
| FD-100 | **Tidak pernah** menyalin logo/foto/kontak Sugar Bliss. |

---

# 17. Accessibility & Responsive

| ID | Keputusan |
|---|---|
| FD-101 | Palet reference adalah **arah desain**, bukan palet literal yang tidak boleh diubah. |
| FD-102 | Warna disesuaikan bila perlu untuk mencapai kontras yang terbaca/aksesibel, dengan tetap menjaga arah visual warm premium bakery. |
| FD-103 | **Mobile-first**. Wajib berfungsi di HP kecil, HP normal, tablet, laptop, dan desktop. |
| FD-104 | Tidak boleh ada horizontal overflow, teks terpotong, fungsi khusus desktop, kontrol penting yang hanya bisa via hover, atau layar admin yang tidak usable di mobile. |
| FD-105 | Menghormati aksesibilitas keyboard/focus dan reduced-motion bila relevan. |

---

# 18. Resolusi Ambiguitas Sebelumnya

Pemetaan dari laporan understanding & validation sebelumnya ke keputusan final.

| # | Ambiguitas / konflik sebelumnya | Resolusi | Dokumen diperbarui |
|---|---|---|---|
| 1 | Kategori di desain, tidak ada di data model | Category resmi (FD-23) | PRD §5, §41; Design §11 |
| 2 | Featured tanpa flag | Flag `featured` (FD-24) | PRD §5, §31, §41; Design §8 |
| 3 | Sold Out tanpa konsep stok | Availability manual (FD-26, FD-27) | PRD §5, §31; Design §12–14 |
| 4 | Foto tambahan vs satu `image` | 1 utama + 0..n tambahan (FD-22) | PRD §41 |
| 5 | Tipe diskon | `price` + `sale_price` (FD-25) | PRD §5.2, §41 |
| 6 | Variant di cart | Bukan V1 (FD-30) | Design §15 |
| 7 | Batas quantity | `max_quantity_per_order` opsional (FD-28) | PRD §6, §37 |
| 8 | Custom Cake | Kategori/produk biasa, kustomisasi via WhatsApp (FD-29) | PRD §54; Design §11 |
| 9 | Tanggal pickup di cart vs checkout | Checkout (FD-33) | Design §15–16 |
| 10 | Cara hitung minimum Pre-Order, cutoff, timezone | FD-09, FD-17–21 | PRD §7, §8 |
| 11 | Booking horizon | 60 hari (FD-08) | PRD §7.1 |
| 12 | Blokir tanggal (§7.1 vs §54.8) | Admin dapat blokir (FD-06) | PRD §11, §54 |
| 13 | Override kapasitas per tanggal | Diizinkan (FD-07) | PRD §11 |
| 14 | Masa reservasi & Cash vs expiry | FD-12–15 | PRD §10 |
| 15 | Urutan konfirmasi admin vs pembayaran | Flow per metode (§8.1) | PRD §22, §45 |
| 16 | Status order expired | Dibatalkan + EXPIRED (FD-56) | PRD §22 |
| 17 | Customer cancel sendiri | Tidak; via WhatsApp → admin (FD-58–60) | PRD §22 |
| 18 | Refund policy | Ditunda ke klien; sistem mencatat refund manual (FD-61–64) | PRD §21a, §54 |
| 19 | "Pesanan Diterima" vs "Pesanan Baru" | "Pesanan Baru" (FD-55) | PRD §26; Design §18 |
| 20 | Belum Dibayar vs Menunggu Pembayaran; status verifikasi | Enum final (FD-52) | PRD §14 |
| 21 | Pelunasan DP | Online/transfer dari tracking/payment page (FD-46) | PRD §21 |
| 22 | Pembulatan DP | ceil(total × 0,5), integer Rupiah (FD-43–44) | PRD §15 |
| 23 | Biaya gateway | Ditanggung merchant (FD-47) | PRD §16 |
| 24 | Cash untuk Pre-Order | Tidak tersedia (FD-40) | PRD §13, §20 |
| 25 | Token "jika digunakan" vs BR-17 | Token wajib (FD-66–69) | PRD §4.2, §26 |
| 26 | Penyampaian & pemulihan token | FD-71–73, DI-05 | PRD §26 |
| 27 | Format nomor order | `ENC-YYYYMMDD-XXXX`, tanggal order (FD-70) | PRD §4.2 |
| 28 | Field checkout tambahan / notes | Wajib + notes opsional, tanpa email (FD-34–35) | PRD §12 |
| 29 | Manual Order | Bagian V1 (FD-78–80) | PRD §49–50, §55, §59 |
| 30 | Website Settings | Bagian V1 (FD-86–88) | PRD §32 |
| 31 | Reporting | Ringkasan operasional saja (FD-89–90) | PRD §51 |
| 32 | Role admin | Satu level ADMIN (FD-81–85) | PRD §3.2, §29 |
| 33 | Bahasa UI | Bahasa Indonesia (FD-91) | Design (seluruh contoh copy) |
| 34 | Search icon | Bukan V1 (FD-94) | Design §7, §35 |
| 35 | Navigasi / Lacak Pesanan | FD-92–93 | Design §7 |
| 36 | Footer Shipping/Returns | Tanpa shipping; refund bila disediakan (FD-97–98) | Design §27 |
| 37 | Kontras palet mauve | Palet = arah, boleh disesuaikan (FD-101–102) | Design §4, §25 |
| 38 | PRD §34 "design reference belum tersedia" | Diperbaiki: tersedia di `design-reference/homepage-reference.jpeg` | PRD §34 |
| 39 | Tipe & ukuran bukti pembayaran | JPG/PNG/PDF, 5 MB (FD-50–51) | PRD §18, §40 |
| 40 | Penempatan link WhatsApp & isi pesan | FD-74–77 | PRD §28 |
| 41 | OC-01 s.d. OC-12 (v1.0) | FD-106 s.d. FD-117 (v1.1) | PRD v1.2; Design v1.2 |

---

# 19. Open Clarifications — Status Resolusi

Item berikut ditemukan saat konsolidasi v1.0 dan **seluruhnya telah diselesaikan oleh user** pada v1.1. Pertanyaan asli dipertahankan sebagai decision history.

| ID | Pertanyaan asli (v1.0) | Resolusi final (v1.1) | Status |
|---|---|---|---|
| OC-01 | Bila admin **menolak** bukti transfer (bukti tidak valid), payment kembali ke `WAITING_PAYMENT` (customer boleh upload ulang) atau `FAILED`? Apakah timer expiry berjalan lagi? | Payment kembali ke `WAITING_PAYMENT`; customer dapat mengunggah bukti baru; reservation expiry **tidak** di-reset/dimulai ulang. → FD-106 | **RESOLVED** |
| OC-02 | **Pembayaran QRIS terlambat**: webhook sukses diterima setelah order sudah dibatalkan karena expiry dan slot sudah dilepas. Diperlakukan bagaimana (ditandai "perlu perhatian" untuk admin → reinstate atau refund manual)? | Tidak ada reaktivasi otomatis; payment/event ditandai **exception** untuk review admin; reinstate/refund diputuskan manual. → FD-107 | **RESOLVED** |
| OC-03 | Apakah **pickup cutoff** juga berlaku untuk Pre-Order? Keputusan saat ini hanya menyebut cutoff untuk Ready Stock same-day. Tanpa cutoff, Pre-Order 1 hari yang dipesan pukul 23:50 dapat diambil keesokan harinya. | Ya. Cutoff berlaku juga untuk Pre-Order dan menentukan tanggal order efektif untuk perhitungan minimum hari. → FD-108 | **RESOLVED** |
| OC-04 | **Sisa DP**: apakah ada batas waktu pelunasan (mis. sebelum Siap Diambil / sebelum tanggal pickup)? Apakah order boleh **Selesai** jika belum `PAID`? Apakah admin boleh mencatat pelunasan sisa secara **cash saat pickup** untuk order DP? | Order DP wajib lunas sebelum **Selesai**. Pelunasan hanya via QRIS atau Transfer Bank; Cash tidak dipakai untuk pelunasan. → FD-109 | **RESOLVED** |
| OC-05 | **Manual Order**: apakah tunduk pada validasi yang sama dengan checkout customer (blokir tanggal, kapasitas penuh, minimum Pre-Order, cutoff, larangan Cash untuk Pre-Order), atau admin boleh override? Jika override diizinkan, apakah wajib alasan di audit trail? | Validasi bisnis sama dengan order website; override terbatas diizinkan bila perlu; setiap override wajib alasan + audit log. → FD-110 | **RESOLVED** |
| OC-06 | Apakah admin dapat mengonfirmasi order QRIS secara manual **sebelum** webhook diterima (mis. saat gateway bermasalah), atau verifikasi QRIS selalu otomatis? Konfirmasi juga DI-04 (Dikonfirmasi otomatis oleh System setelah webhook sukses). | QRIS hanya dikonfirmasi melalui verified gateway webhook; tidak ada konfirmasi QRIS manual oleh admin di V1. → FD-111 | **RESOLVED** |
| OC-07 | Setelah pembayaran QRIS **gagal** (`FAILED`) di dalam masa reservasi, apakah customer boleh membuat transaksi QRIS baru untuk order yang sama sampai expiry? | Ya, selama reservasi order masih valid; hanya transaksi valid/sukses yang dihitung sebagai pembayaran. → FD-112 | **RESOLVED** |
| OC-08 | **No-show order Cash**: tidak ada expiry otomatis. Konfirmasi bahwa pembatalan no-show dilakukan manual oleh admin (tanpa aturan otomatis). | Dikonfirmasi: Cash no-show tidak expired otomatis; admin membatalkan manual bila perlu. → FD-113 | **RESOLVED** |
| OC-09 | Konfirmasi DI-01 s.d. DI-06 bila maksudnya berbeda. | DI-01 s.d. DI-06 dikonfirmasi final (DI-03 diamandemen oleh FD-108). → FD-114 | **RESOLVED** |
| OC-10 | Apakah **Manual Order** juga diterbitkan kode akses tracking (agar customer WhatsApp/offline dapat melacak pesanannya)? Direkomendasikan ya. | Ya. Manual Order juga mendapat tracking access code/token dengan mekanisme tracking yang sama. → FD-115 | **RESOLVED** |
| OC-11 | Dari status mana saja admin boleh membatalkan order (mis. apakah order **Siap Diambil** masih boleh dibatalkan)? Apakah transisi status boleh mundur/lompat? | Order status mengikuti state transition yang didefinisikan; Selesai tidak dapat menjadi Dibatalkan; tidak ada transisi mundur/lompat bebas; pembatalan mengikuti aturan pembatalan. → FD-116, §19b | **RESOLVED** |
| OC-12 | Wording badge: tetap "Ready Stock / Pre-Order / Sold Out" (istilah yang dipakai PRD dan lazim di e-commerce Indonesia) atau diterjemahkan (mis. "Habis" untuk Sold Out)? Terkait FD-91 (tidak mencampur label Inggris tanpa persetujuan). | Badge tetap **Ready Stock**, **Pre-Order**, **Sold Out** (tidak diterjemahkan). → FD-117 | **RESOLVED** |

---

# 19a. Keputusan Final dari Resolusi OC

| ID | Sumber | Keputusan |
|---|---|---|
| FD-106 | OC-01 | Jika admin **menolak** bukti transfer bank, status transaksi pembayaran kembali ke `WAITING_PAYMENT` sehingga customer dapat mengunggah bukti baru. Timer/reservation expiry **tidak** di-reset atau dimulai ulang. Penolakan dicatat di audit trail. *(Detail final: FD-120.)* |
| FD-107 | OC-02 | Jika webhook QRIS yang **valid** masuk setelah order sudah expired/Dibatalkan dan slot sudah dilepas, sistem **tidak** otomatis mengaktifkan kembali order. Payment/event tersebut ditandai sebagai **exception** untuk review admin. Keputusan reinstate atau refund dilakukan **manual** sesuai kondisi. *(Diamandemen oleh FD-118: order Dibatalkan **tidak dapat** di-reinstate; resolusi manual berupa refund atau customer membuat order baru.)* |
| FD-108 | OC-03 | **Pickup cutoff juga berlaku untuk Pre-Order.** Cutoff menentukan **tanggal order efektif** untuk perhitungan minimum Pre-Order: order sebelum cutoff → tanggal efektif = tanggal order; order pada/sesudah cutoff → tanggal efektif = hari kalender berikutnya (WIB). Tanggal pickup paling awal = tanggal efektif + `minimum_preorder_days` terlama (Pre-Order) atau = tanggal efektif (Ready Stock-only). Tanggal tetap harus lolos aturan lain (kapasitas, blokir, booking horizon). |
| FD-109 | OC-04 | Order dengan **DP 50%** wajib **lunas (`PAID`)** sebelum dapat berstatus **Selesai**. Pelunasan sisa hanya melalui **QRIS** atau **Transfer Bank**. **Cash tidak digunakan** sebagai metode pelunasan sisa DP. |
| FD-110 | OC-05 | **Manual Order** mengikuti validasi bisnis yang sama dengan order website. Admin dapat melakukan **override terbatas** bila memang diperlukan. Setiap override **wajib** mencatat alasan dan audit log. *(Ruang lingkup override ditetapkan FD-119.)* |
| FD-111 | OC-06 | Pembayaran QRIS **hanya** dapat dikonfirmasi melalui **verified payment gateway webhook**. **Tidak ada** konfirmasi QRIS manual oleh admin di V1. |
| FD-112 | OC-07 | Jika transaksi QRIS **gagal** tetapi reservasi order masih valid dan belum expired, customer dapat membuat **transaksi QRIS baru** pada order yang sama. Hanya transaksi pembayaran yang valid/sukses yang dihitung sebagai pembayaran. |
| FD-113 | OC-08 | Order Cash yang tidak diambil (no-show) **tidak** otomatis expired karena payment. Admin melakukan pembatalan secara manual bila diperlukan. |
| FD-114 | OC-09 | DI-01 s.d. DI-06 dikonfirmasi sebagai **keputusan final**. DI-03 berlaku dalam bentuk yang diamandemen oleh FD-108. |
| FD-115 | OC-10 | **Manual Order** juga mendapatkan **tracking access code/token** dan memakai mekanisme tracking order yang sama. |
| FD-116 | OC-11 | Order status **wajib** mengikuti state transition yang didefinisikan (§19b). Status **Selesai tidak dapat** diubah menjadi Dibatalkan. Tidak boleh ada perubahan status **mundur** atau **lompat** secara bebas di luar transition yang didefinisikan. Pembatalan mengikuti aturan pembatalan yang sudah ditetapkan (FD-56–FD-60). |
| FD-117 | OC-12 | Badge produk tetap menggunakan istilah **Ready Stock**, **Pre-Order**, dan **Sold Out**, **tidak** diterjemahkan ke Bahasa Indonesia. Ini adalah pengecualian yang disetujui terhadap FD-91. |

---

# 19b. Order Status State Transition

Disusun dari FD-54, flow per metode (§8.1), FD-56–FD-60, FD-109, FD-111, dan FD-116. Transition di luar tabel ini **tidak diizinkan**.

| Dari | Ke | Aktor | Syarat |
|---|---|---|---|
| Pesanan Baru | Dikonfirmasi | System | **QRIS:** webhook sukses terverifikasi; payment `PARTIALLY_PAID` atau `PAID` (FD-111, DI-04). |
| Pesanan Baru | Dikonfirmasi | Admin | **Transfer Bank:** admin menyetujui bukti pembayaran; payment `PARTIALLY_PAID` atau `PAID`. |
| Pesanan Baru | Dikonfirmasi | Admin | **Cash:** admin menerima order. |
| Pesanan Baru | Dibatalkan | System | QRIS/Transfer belum dibayar dan reservasi habis; payment `EXPIRED` (FD-56). Tidak berlaku untuk Cash (FD-57, FD-113). |
| Pesanan Baru | Dibatalkan | Admin | Alasan wajib (FD-60). |
| Dikonfirmasi | Pesanan Diproses | Admin | — |
| Dikonfirmasi | Dibatalkan | Admin | Alasan wajib. |
| Pesanan Diproses | Siap Diambil | Admin | — |
| Pesanan Diproses | Dibatalkan | Admin | Alasan wajib. |
| Siap Diambil | Selesai | Admin | Payment `PAID` (lihat DI-09). |
| Siap Diambil | Dibatalkan | Admin | Alasan wajib. |
| Selesai | — | — | **Terminal.** Tidak dapat menjadi Dibatalkan (FD-116). |
| Dibatalkan | — | — | **Terminal.** Tidak dapat di-reinstate; transition **Dibatalkan → Dikonfirmasi tidak ada** (FD-118). |

Setiap transition dicatat di audit trail (waktu, aktor admin/System, alasan bila ada). Pembatalan melepaskan slot kapasitas; refund bila ada dicatat manual (FD-62, FD-63).

---

# 19c. Konsekuensi Turunan Baru dan Item Lanjutan

## Derived interpretations (v1.1)

Konsekuensi literal dari kombinasi keputusan; bukan keputusan bisnis baru. Ditandai agar dapat dikoreksi bila tidak sesuai maksud.

- **DI-07** *(ditetapkan sebagai keputusan final — FD-120)* — (FD-106 + DI-02) Timer berhenti selama `WAITING_VERIFICATION`. Jika bukti ditolak, transaksi kembali ke `WAITING_PAYMENT` dengan **batas waktu reservasi awal** (tidak di-reset). Jika batas waktu awal itu sudah lewat ketika bukti ditolak, order langsung memenuhi kondisi FD-56 (payment `EXPIRED`, order Dibatalkan, slot dilepas).
- **DI-08** — (FD-112 + FD-12) Masa reservasi melekat pada **order**, bukan pada transaksi. Transaksi QRIS baru setelah kegagalan **tidak** memperpanjang masa reservasi order.
- **DI-09** — (Flow §8.1 + FD-109) Untuk semua metode, transition **Siap Diambil → Selesai** mensyaratkan payment `PAID`: QRIS/Transfer penuh sudah `PAID` sejak dikonfirmasi; Cash ditandai `PAID` oleh admin saat pickup; DP harus dilunasi via QRIS/Transfer terlebih dahulu.

## Item lanjutan

Kedua item di bawah **RESOLVED** pada v1.2. Pertanyaan asli dipertahankan sebagai decision history.

| ID | Pertanyaan asli (v1.1) | Status |
|---|---|---|
| OC-13 | FD-107 mengizinkan **reinstate manual**, sedangkan FD-116 melarang transition yang tidak didefinisikan dan tidak ada transition keluar dari Dibatalkan. Bagaimana reinstate dijalankan? Opsi: (a) satu transition pengecualian **Dibatalkan → Dikonfirmasi**, hanya oleh admin, hanya untuk order dengan exception FD-107, dengan reservasi ulang kapasitas dan alasan + audit; atau (b) Dibatalkan tetap terminal dan "reinstate" dilakukan dengan membuat **Manual Order baru** yang ditautkan ke pembayaran exception. Rekomendasi: (b), karena state machine tetap ketat tanpa transition baru. | **RESOLVED** → FD-118 |
| OC-14 | FD-110 mengizinkan **override terbatas** untuk Manual Order. Validasi mana yang boleh di-override (mis. kapasitas penuh, tanggal diblokir, minimum Pre-Order, cutoff, booking horizon, larangan Cash untuk Pre-Order) dan mana yang tidak? Rekomendasi: Technical Implementation Plan mengusulkan daftar validasi yang dapat di-override untuk disetujui. | **RESOLVED** → FD-119 |

---

# 19d. Keputusan Final v1.2

| ID | Sumber | Keputusan |
|---|---|---|
| FD-118 | OC-13 | Order yang sudah berstatus **Dibatalkan tidak dapat di-reinstate**. Transition **Dibatalkan → Dikonfirmasi tidak dibuat**. Jika pembayaran QRIS masuk setelah order expired/Dibatalkan, pembayaran tersebut menjadi **Payment Exception** untuk review admin. Admin dapat melakukan **manual resolution/refund** sesuai kondisi, atau customer dapat **membuat order baru**. |
| FD-119 | OC-14 | **Manual Order mengikuti validasi normal.** Admin **hanya** boleh melakukan override terhadap: (1) **minimum preorder days**, (2) **booking horizon**, (3) **pickup cutoff**, (4) **daily capacity**. Setiap override **wajib** mencatat: **alasan, admin/operator, timestamp, nilai sebelum, nilai sesudah**. **Payment rules, QRIS verification, security/tracking, dan state transition tidak boleh di-bypass** melalui Manual Order. |
| FD-120 | DI-07 | **Timer reservasi tidak pernah di-reset.** (1) Jika bukti transfer di-upload **sebelum** reservasi habis, payment masuk `WAITING_VERIFICATION` dan order **tidak** auto-cancel hanya karena admin belum memverifikasi. (2) Jika bukti kemudian **ditolak**, payment kembali ke `WAITING_PAYMENT` **tanpa** timer baru. (3) Jika saat penolakan batas waktu reservasi awal **sudah lewat**, order menjadi expired: payment `EXPIRED`, order **Dibatalkan**, slot dilepas. |

Konsekuensi literal FD-119 (bukan aturan baru, hanya membaca daftar "hanya boleh"):

- Validasi yang **tidak** ada di daftar override tetap berlaku penuh untuk Manual Order, antara lain: tanggal yang **diblokir** admin, produk nonaktif/Sold Out, `max_quantity_per_order`, larangan **Cash untuk Pre-Order**, Cash tanpa DP, perhitungan DP, verifikasi QRIS via webhook, penerbitan tracking token, dan state transition.
- Override **daily capacity** memungkinkan tanggal terisi melebihi kapasitasnya; jumlah terisi tetap dihitung apa adanya sehingga tanggal tampil penuh untuk order website.

---

# 20. Data Klien Wajib Sebelum Go-Live (Bukan Blocker Planning/Development)

Selama development memakai placeholder/konfigurasi yang jelas ditandai.

| ID | Data |
|---|---|
| GL-01 | Logo final & aset brand |
| GL-02 | Foto produk asli & data produk (nama, deskripsi, harga, kategori, tipe, minimum Pre-Order) |
| GL-03 | Alamat pickup |
| GL-04 | Nomor WhatsApp |
| GL-05 | Rekening bank (nama bank, nomor, nama pemilik) |
| GL-06 | Akun media sosial |
| GL-07 | Jam operasional & jam pickup final |
| GL-08 | Pickup cutoff final (jika klien mengubah default 15:00 WIB) |
| GL-09 | Kebijakan pembatalan & refund (finansial) final |
| GL-10 | Merchant account payment gateway production (termasuk onboarding QRIS) |
| GL-11 | Konten Privacy Policy / Terms (bila ditampilkan di footer) |
| GL-12 | Copy & klaim marketing (headline hero, brand story, value highlights) yang disetujui klien |
