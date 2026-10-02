# Enjua Cake's — PRD Design Specification

**Version:** 1.3  
**Status:** Consolidated — selaras dengan `FINAL-REQUIREMENT-DECISIONS.md` v1.1 (seluruh OC resolved)  
**Related documents:** `PRD.md` (v1.3), `FINAL-REQUIREMENT-DECISIONS.md` (v1.2), `IMPLEMENTATION-PLAN.md`  

**Riwayat:** v1.1 — penyelarasan dengan keputusan final. v1.2 — penerapan resolusi OC-01 s.d. OC-12 (FD-106 s.d. FD-117) pada UI checkout, payment, tracking, dan admin. v1.3 — FD-118 (tanpa reinstate), FD-119 (override Manual Order), FD-120 (timer tidak pernah di-reset).
**Primary visual reference:** `design-reference/homepage-reference.jpeg`

---

## 1. Purpose

Dokumen ini mendefinisikan arah visual, UI, UX, layout, responsive behavior, dan interaction design untuk website **Enjua Cake's**.

`PRD.md` menjelaskan **apa yang harus dilakukan sistem**. Dokumen ini menjelaskan **bagaimana sistem tersebut harus terlihat dan terasa bagi pengguna**.

Claude Code wajib menggunakan dokumen ini sebagai acuan desain setelah `PRD.md` dan `FINAL-REQUIREMENT-DECISIONS.md` dipahami.

Jika ada perbedaan antara dokumen ini dan keputusan final, `FINAL-REQUIREMENT-DECISIONS.md` yang berlaku.

---

# 2. Design Reference

Referensi utama yang diberikan untuk desain adalah screenshot website bakery (`design-reference/homepage-reference.jpeg`) dengan karakter visual:

* warm
* elegant
* soft
* premium tetapi tetap approachable
* editorial
* bakery / handmade feeling
* banyak whitespace
* fotografi produk sebagai elemen utama
* warna cream, dusty rose/mauve, cokelat, dan warna pastel
* typography dengan heading serif yang kuat dan body text yang sederhana
* rounded cards dengan sudut lembut
* penggunaan tekstur brush/paint pada beberapa transisi section
* layout editorial yang menggabungkan teks, gambar, dan card

### Aturan penggunaan referensi

Referensi tersebut adalah **referensi visual**, bukan template yang harus disalin.

Jangan menyalin:

* nama brand Sugar Bliss
* logo
* teks
* foto produk
* alamat
* informasi kontak
* identitas brand
* aset visual milik referensi

Yang diadaptasi adalah prinsip desain seperti:

* hierarchy
* composition
* spacing
* typography relationship
* color mood
* card treatment
* image placement
* section rhythm
* visual storytelling

Elemen pada referensi yang **tidak** menjadi requirement V1:

* ikon search pada navbar (search bukan fitur V1)
* section kopi / "Perfect Pair" (diadaptasi sebagai section About/brand story, bukan produk kopi)
* link Shipping Policy dan Returns pada footer (layanan pickup only)

Identitas visual final harus menggunakan brand **Enjua Cake's**.

---

# 3. Overall Design Direction

Website Enjua Cake's harus memberikan kesan:

> **Warm, premium, handmade, appetizing, elegant, dan mudah digunakan.**

Website jangan terlihat seperti marketplace generik.

Fokus visual utama adalah **produk kue**.

Desain harus membuat pengguna merasa:

* nyaman menjelajah produk
* mudah menemukan kue
* percaya terhadap toko
* tertarik melihat foto produk
* mudah melakukan pemesanan
* tidak bingung ketika checkout

## 3.1 Bahasa UI

Bahasa utama UI customer dan admin adalah **Bahasa Indonesia** (FD-91).

* Nama brand tetap **Enjua Cake's**.
* Label fungsional (navigasi, tombol, status, form, pesan error) ditulis dalam Bahasa Indonesia.
* Jangan mencampur label fungsional berbahasa Inggris kecuali disetujui.
* Istilah bisnis yang sudah dipakai PRD (mis. DP, QRIS) boleh dipertahankan.
* **Badge produk tetap menggunakan istilah "Ready Stock", "Pre-Order", dan "Sold Out"** dan **tidak** diterjemahkan (FD-117). Ini adalah pengecualian yang disetujui terhadap aturan Bahasa Indonesia.
* Seluruh contoh copy di dokumen ini adalah placeholder; copy final mengikuti persetujuan klien.

---

# 4. Visual Language

## 4.1 Color Direction

Gunakan palet yang terinspirasi dari referensi.

Palet di bawah adalah **arah desain**, bukan nilai literal yang tidak boleh diubah (FD-101). Warna **wajib disesuaikan** bila diperlukan untuk mencapai kontras yang terbaca dan aksesibel, sambil menjaga nuansa warm premium bakery (FD-102).

### Primary Background

Warm cream / off-white.

Contoh arah warna:

* `#F8EDE1`
* `#F6EADD`

### Primary Accent

Dusty rose / muted mauve.

Contoh arah:

* `#B79A98`
* `#A97878`

### Dark Text

Warm dark brown, bukan hitam murni.

Contoh arah:

* `#3E2B24`

### Secondary Accent

Muted chocolate / cocoa.

Contoh arah:

* `#6E4635`

### Soft Card Colors

Gunakan pastel lembut untuk membedakan category/card:

* blush pink
* warm beige
* muted lavender
* soft peach

### Status Colors

Dibutuhkan token warna tambahan untuk badge dan status yang tetap harmonis dengan palet utama:

* soft green / sage untuk Ready Stock
* dusty rose untuk Pre-Order
* neutral gelap untuk Sold Out
* warna untuk sukses, peringatan, dan error yang tetap muted

### Important Rule — Kontras

Warna harus tetap memiliki kontras yang cukup untuk readability. Target minimum mengikuti WCAG 2.1 AA:

* teks normal: rasio kontras minimal **4.5:1** (SC 1.4.3)
* teks besar (≥ 24px, atau ≥ 18.66px bold): minimal **3:1**
* komponen UI dan ikon penting: minimal **3:1** (SC 1.4.11)

Catatan dari analisis referensi: teks cream (`#F8EDE1`) di atas mauve `#B79A98` hanya sekitar **2.2:1**, dan di atas `#A97878` sekitar **3.2:1**. Artinya teks kecil berwarna terang di atas mauve (seperti hero copy dan footer pada referensi) **tidak memenuhi** AA. Solusi yang diizinkan: menggunakan varian mauve/cocoa yang lebih gelap untuk background yang memuat teks, atau menggunakan teks gelap di atas mauve terang. Nilai final ditentukan saat penyusunan design system.

Jangan menggunakan terlalu banyak warna berbeda.

Palet utama harus terasa konsisten di seluruh halaman.

---

# 5. Typography

## 5.1 Heading

Gunakan serif yang memiliki karakter editorial/elegant.

Karakter yang dicari:

* expressive
* elegant
* warm
* tidak terlalu formal

Heading dapat menggunakan ukuran besar pada hero dan section heading.

## 5.2 Body

Gunakan sans-serif yang bersih dan mudah dibaca.

Body text harus:

* sederhana
* tidak terlalu tipis
* nyaman dibaca di mobile
* memiliki line-height yang cukup

Font final mengikuti persetujuan klien (lihat `PRD.md` §54.3).

## 5.3 Hierarchy

Minimal terdapat hierarchy:

1. Display / Hero heading
2. Page heading
3. Section heading
4. Card heading
5. Body text
6. Supporting text
7. Caption / metadata

Jangan menggunakan ukuran heading besar secara berlebihan.

---

# 6. Layout Philosophy

Layout harus menggunakan banyak whitespace dan tidak terasa penuh.

Gunakan:

* centered content container
* generous horizontal padding
* consistent vertical spacing
* editorial split layouts
* asymmetric compositions ketika sesuai
* rounded cards
* large product photography

Desktop tidak boleh terasa seperti kumpulan komponen yang ditempelkan.

Setiap section harus memiliki hubungan visual dengan section berikutnya.

---

# 7. Global Navigation

## Desktop

Navbar mengikuti prinsip referensi:

* logo Enjua Cake's di sisi kiri
* navigation di area tengah
* ikon cart (dengan jumlah item) di sisi kanan
* primary CTA **Pesan Sekarang**
* background terang/transparan sesuai section
* navbar tetap bersih dan tidak terlalu tinggi

Item navigasi (FD-92):

* Beranda
* Produk
* Cara Pesan
* Tentang Kami
* Lacak Pesanan
* Kontak
* Cart (ikon, dengan label aksesibel)
* Pesan Sekarang (CTA)

**Tidak ada ikon/fitur search** di V1 (FD-94), walaupun referensi menampilkan ikon search.

Apakah Tentang Kami, Cara Pesan, dan Kontak berupa anchor di homepage atau halaman terpisah ditentukan pada implementation planning (FD-96).

## Mobile

Navbar berubah menjadi (FD-93):

* logo
* cart
* hamburger menu

Menu dibuka menggunakan mobile navigation panel/drawer yang memuat seluruh item navigasi desktop, termasuk **Lacak Pesanan** dan **Pesan Sekarang**.

Jangan memaksakan desktop navbar ke layar mobile.

## Floating WhatsApp

Tombol kontak WhatsApp mengambang (floating) boleh ditampilkan di halaman customer (FD-75). Tombol tidak boleh menutupi CTA penting (mis. tombol checkout/sticky CTA di mobile).

---

# 8. Homepage

Homepage menjadi halaman dengan visual paling kuat.

Section yang dapat dimuat (FD-95):

1. Navbar
2. Hero
3. Brand/value highlights (opsional)
4. Featured Products — produk dengan flag **featured** dari admin
5. Categories — kategori produk **nyata** dari sistem produk
6. About / Tentang Kami (brand story)
7. Cara Pesan (termasuk penjelasan Ready Stock vs Pre-Order dan informasi pickup)
8. Kontak
9. CTA
10. Footer

Urutan dapat disesuaikan jika hasil implementasi dari design reference menunjukkan komposisi yang lebih baik.

Konten homepage (nama, deskripsi, alamat, jam, WhatsApp) diambil dari Website Settings, bukan di-hardcode.

---

# 9. Hero Section

Hero mengikuti prinsip visual reference.

## Composition

Desktop:

* text berada di satu sisi
* hero product image berada di sisi lainnya
* background menggunakan warm cream + dusty rose/mauve (dengan penyesuaian kontras, lihat §4.1)
* section memiliki visual transition yang organic/paint-like bila sesuai

Mobile:

* image dan text tersusun vertikal
* CTA tetap terlihat tanpa harus scroll jauh

## Content

Hero harus memiliki:

### Headline

Singkat, memorable, dan berhubungan dengan produk Enjua Cake's. Copy final disetujui klien.

### Supporting text

Menjelaskan secara singkat produk/bakery.

### Primary CTA

Contoh:

`Pesan Sekarang`

### Secondary CTA

Contoh:

`Lihat Produk`

CTA final mengikuti content yang disetujui.

## Product Image

Gunakan foto kue berkualitas tinggi. Selama development boleh memakai placeholder; tidak boleh memakai foto dari referensi.

Produk menjadi focal point.

Jangan membuat text menutupi bagian penting dari produk.

---

# 10. Brand / Value Highlights

Setelah hero dapat digunakan section singkat untuk menunjukkan keunggulan.

Contoh konsep (placeholder):

* Dibuat Segar
* Bahan Berkualitas
* Dibuat dengan Sepenuh Hati

Klaim pada section ini adalah klaim marketing dan **wajib disetujui klien** sebelum production.

Gunakan icon sederhana dengan gaya yang konsisten.

Icon tidak boleh terlalu kompleks.

---

# 11. Product Categories

Mengikuti prinsip tiga card pada referensi, tetapi **jumlah dan isi card mengikuti kategori nyata** yang dikelola admin (FD-23). Jangan membuat kategori statis/fiktif.

Contoh kategori (ilustrasi, bukan daftar final):

* Cakes
* Desserts
* Cookies
* Custom Cake

Setiap card:

* background pastel berbeda
* nama kategori
* deskripsi singkat
* gambar kategori/produk
* directional arrow / CTA menuju daftar produk kategori tersebut

Layout harus tetap rapi bila jumlah kategori bukan tiga (mis. grid yang menyesuaikan, atau horizontal scroll yang disengaja di mobile).

## Custom Cake

Custom Cake boleh tampil sebagai kategori/produk biasa (FD-29).

* **Tidak ada** custom cake builder/configurator di V1.
* Untuk kustomisasi kompleks, tampilkan CTA inquiry WhatsApp (mis. "Konsultasi via WhatsApp").

Card harus memiliki visual yang ringan dan premium.

---

# 12. Product Listing

Halaman produk harus fokus pada produk.

Filter berdasarkan kategori boleh disediakan karena kategori adalah bagian resmi sistem produk. **Search tidak** disediakan di V1.

## Product Card

Setiap card minimal menampilkan:

* product image (gambar utama)
* product name
* price
* harga sale (`sale_price`) jika ada, dengan harga normal dicoret
* indikator diskon jika ada (persentase boleh dihitung untuk tampilan)
* badge Ready Stock / Pre-Order
* badge Sold Out bila produk sedang tidak dapat dibeli
* CTA tambah ke keranjang

Jika produk memiliki informasi tambahan yang penting (mis. minimum Pre-Order), tampilkan secara ringkas.

## Perilaku Sold Out

Sold Out adalah status availability manual dari admin (FD-26, FD-27):

* produk **tetap terlihat** di listing
* CTA tambah ke keranjang **dinonaktifkan** dan diberi label jelas yang memakai istilah **Sold Out** (FD-117)
* status tidak hanya dibedakan lewat warna; gunakan label teks

Produk nonaktif (`active = false`) tidak ditampilkan sama sekali.

## Card Style

* rounded corners
* warm neutral background
* image menjadi focal point
* subtle interaction
* tidak menggunakan border yang terlalu berat

---

# 13. Product Detail Page

Product detail harus memiliki layout:

### Desktop

Image gallery di satu sisi (gambar utama + gambar tambahan bila ada).

Informasi produk di sisi lain:

* product name
* kategori
* price
* harga sale / diskon
* availability (Tersedia / Sold Out)
* Ready Stock / Pre-Order
* description
* minimum Pre-Order jika berlaku (mis. "Pesan minimal 3 hari sebelum pickup")
* quantity (dibatasi `max_quantity_per_order` bila diatur)
* tambah ke keranjang (nonaktif bila Sold Out)
* ordering notes jika diperlukan
* CTA WhatsApp untuk produk Custom Cake / pertanyaan kustomisasi

Tidak ada pemilihan variant (ukuran/rasa) di V1 (FD-30).

### Mobile

Image berada di atas.

Informasi produk berada di bawah.

CTA harus mudah dijangkau dengan satu tangan (mis. sticky CTA di bagian bawah).

---

# 14. Ready Stock & Pre-Order Visual System

Gunakan badge yang jelas tetapi tetap sesuai visual brand.

### Ready Stock

Badge dengan warna soft green / neutral.

### Pre-Order

Badge dengan warna dusty rose / muted accent. Dapat disertai informasi minimum hari.

### Sold Out

Badge dengan warna neutral/darker. Merupakan status **manual dari admin**, bukan hasil penghitungan stok. Badge Sold Out dapat tampil bersamaan dengan badge tipe produk.

Badge tidak boleh terlalu besar sehingga mendominasi foto produk.

Badge harus memiliki label teks, tidak hanya warna.

Label badge **wajib** persis: **Ready Stock**, **Pre-Order**, **Sold Out** — tidak diterjemahkan (FD-117).

---

# 15. Cart

Cart harus terasa sederhana dan tidak seperti halaman admin.

Cart disimpan di browser customer sehingga tidak hilang karena refresh (FD-31).

Setiap item:

* thumbnail
* product name
* badge Ready Stock / Pre-Order
* price
* quantity control (menghormati `max_quantity_per_order`)
* subtotal
* remove action

Summary:

* subtotal
* discount
* total (estimasi; total final dihitung server saat checkout)
* checkout CTA

**Tanggal pickup tidak dipilih di cart** (FD-33). Pemilihan tanggal pickup, metode pembayaran, dan opsi DP/penuh dilakukan di checkout.

Informasi pendukung yang boleh ditampilkan di cart:

* jika cart berisi Pre-Order: informasi bahwa tanggal pickup paling awal mengikuti minimum Pre-Order terlama
* jika cart berisi Pre-Order: informasi bahwa pembayaran Cash tidak tersedia
* jika ada item yang menjadi Sold Out/nonaktif: peringatan dan opsi menghapus item

Cart harus responsive.

---

# 16. Checkout

Checkout harus dibuat sebagai proses yang jelas.

Desktop dapat memakai multi-column (form + ringkasan pesanan). Mobile memakai single-column dengan ringkasan yang mudah diakses.

Informasi:

### Data Pemesan

Wajib:

* nama
* nomor WhatsApp

Opsional:

* catatan pesanan

**Tidak** meminta email maupun alamat pengiriman (FD-35).

### Pickup

* tanggal pickup (pilih tanggal saja, tanpa slot jam — FD-10)
* informasi jam pickup (informasional, dari Website Settings)
* alamat/instruksi pickup
* availability

Calendar/date picker:

* hanya menampilkan rentang booking horizon (default 60 hari)
* tanggal tidak tersedia ditampilkan **disabled** dengan alasan yang jelas, misalnya:
  * "Penuh"
  * "Tutup"
  * "Belum memenuhi minimum Pre-Order"
  * "Batas pemesanan hari ini sudah lewat"
* alasan tidak boleh hanya disampaikan lewat warna atau hover; harus dapat diakses via sentuhan dan keyboard
* tampilkan informasi pickup cutoff yang jelas, karena cutoff berlaku untuk Ready Stock **dan** Pre-Order (FD-108). Contoh copy (placeholder): "Pesanan setelah pukul 15:00 WIB dihitung sebagai pesanan hari berikutnya."

### Ringkasan Pesanan

Tampilkan seluruh produk, quantity, harga, subtotal, diskon, dan total.

### Pembayaran

Pilihan metode:

* QRIS
* Transfer Bank
* Cash saat Pickup

Aturan tampilan:

* Jika order berisi Pre-Order, **Cash tidak tersedia**. Tampilkan sebagai disabled dengan penjelasan (mis. "Cash hanya tersedia untuk pesanan Ready Stock"), bukan disembunyikan tanpa penjelasan.
* Opsi DP/penuh hanya tampil untuk QRIS dan Transfer Bank. Cash selalu bayar penuh.

Pilihan DP/penuh harus terlihat jelas:

`Bayar DP 50%`

atau

`Bayar Penuh`

Jika memilih DP, tampilkan dengan jelas:

* total
* jumlah DP (dibulatkan ke atas ke Rupiah terdekat)
* sisa pembayaran

### Konfirmasi

Customer harus mengonfirmasi ringkasan sebelum order dibuat. Tombol submit dilindungi dari double submission.

---

# 17. Payment UI

Payment UI harus membuat customer yakin terhadap:

* nominal yang harus dibayar
* metode pembayaran
* status pembayaran
* sisa pembayaran
* batas waktu pembayaran

Contoh:

```text
Total Pesanan       Rp300.000
DP 50%              Rp150.000
Sisa Pembayaran     Rp150.000
```

### QRIS

* tampilkan QR dan nominal
* tampilkan batas waktu pembayaran (default 30 menit) beserta hitung mundur
* status otomatis diperbarui setelah pembayaran terverifikasi melalui webhook; tidak ada konfirmasi manual (FD-111)
* jika transaksi QRIS gagal dan batas waktu reservasi belum habis, tampilkan aksi untuk **membuat QRIS baru** pada order yang sama (FD-112); hitung mundur tetap mengikuti batas waktu reservasi order dan tidak dimulai ulang (DI-08)

### Transfer Bank

* tampilkan instruksi rekening (dari Website Settings) dan nominal
* tampilkan batas waktu (default 2 jam)
* area upload bukti: JPG/JPEG, PNG, atau PDF, maksimal 5 MB, dengan pesan error yang jelas bila tidak sesuai
* setelah upload: status `Menunggu Verifikasi`
* jika bukti **ditolak** admin: tampilkan status kembali `Menunggu Pembayaran`, alasan penolakan yang aman ditampilkan, dan aksi untuk mengunggah bukti baru; batas waktu yang ditampilkan tetap batas waktu reservasi awal, tidak pernah di-reset (FD-106, FD-120). Jika batas waktu awal sudah lewat saat bukti ditolak, tampilkan state pesanan Dibatalkan karena batas waktu pembayaran habis

### Cash saat Pickup

* tampilkan informasi bahwa pembayaran penuh dilakukan saat pengambilan

### Pesan Status

Jika pembayaran otomatis berhasil:

`Pembayaran berhasil`

Jika menunggu:

`Menunggu pembayaran`

Jika membutuhkan bukti:

`Upload bukti pembayaran`

Jika bukti sudah dikirim:

`Bukti pembayaran sedang diverifikasi`

Jika kedaluwarsa:

`Batas waktu pembayaran habis. Pesanan dibatalkan.`

Jika bukti ditolak:

`Bukti pembayaran belum dapat diterima. Silakan unggah bukti yang baru sebelum batas waktu.`

Jika QRIS gagal:

`Pembayaran QRIS gagal. Silakan buat QRIS baru sebelum batas waktu.`

### Pelunasan Sisa DP

Dari halaman tracking/payment, customer dapat membayar sisa DP melalui **QRIS atau Transfer Bank saja** (FD-46, FD-109).

* Cash **tidak** ditampilkan sebagai opsi pelunasan.
* Tampilkan informasi yang jelas bahwa sisa pembayaran **wajib lunas sebelum pesanan dapat diselesaikan** (FD-109). Contoh copy (placeholder): "Sisa pembayaran perlu dilunasi melalui QRIS atau transfer sebelum pesanan dapat diselesaikan."

---

# 17a. Order Success

Setelah checkout berhasil, halaman sukses menampilkan (FD-71):

* nomor order
* kode akses tracking, ditonjolkan dan mudah dibaca
* tombol salin (copy) untuk nomor order dan kode akses
* tombol/link langsung ke halaman tracking
* tombol bantuan WhatsApp
* langkah pembayaran berikutnya sesuai metode

Tampilkan peringatan yang jelas bahwa kode akses perlu disimpan karena diperlukan untuk melacak pesanan.

Pesan WhatsApp pre-filled boleh berisi nomor order, tetapi **tidak boleh** berisi kode akses (FD-77).

---

# 18. Order Tracking

Halaman tracking harus sederhana.

Customer memasukkan:

* nomor order
* kode akses

Keduanya wajib (FD-66).

Kemudian melihat:

### Order Information

* nomor order
* tanggal pickup
* produk
* total

### Order Status Timeline

`Pesanan Baru`
↓
`Dikonfirmasi`
↓
`Pesanan Diproses`
↓
`Siap Diambil`
↓
`Selesai`

Status **Dibatalkan** ditampilkan sebagai state terpisah beserta alasan yang aman untuk ditampilkan (mis. "Batas waktu pembayaran habis").

Label "Pesanan Diterima" tidak digunakan (FD-55).

Status aktif harus mudah dikenali.

### Payment Status

Dipisahkan dari order status.

Contoh label:

* `Belum Dibayar`
* `Menunggu Pembayaran`
* `Menunggu Verifikasi`
* `DP Terbayar`
* `Lunas`
* `Pembayaran Kedaluwarsa`

Tampilkan juga total, sudah dibayar, dan sisa.

### Aksi

* bayar sisa DP (QRIS/Transfer) / lanjutkan pembayaran pending / buat QRIS baru setelah gagal / upload bukti transfer atau bukti baru setelah ditolak (sesuai kondisi)
* bantuan WhatsApp, termasuk untuk permintaan pembatalan (customer tidak dapat membatalkan sendiri — FD-58)

### Kode akses hilang

Tampilkan informasi bahwa customer dapat menghubungi admin via WhatsApp untuk pemulihan akses. Tidak ada pemulihan via email.

---

# 19. Status Visual

Status harus menggunakan kombinasi:

* label
* icon
* visual state

Jangan mengandalkan warna saja.

Ini membantu accessibility.

---

# 20. Admin Dashboard

Admin menggunakan visual system yang sama tetapi lebih functional. Bahasa UI admin adalah Bahasa Indonesia.

Admin dashboard harus:

* clean
* information-dense tetapi tidak penuh
* mudah scanning
* responsive
* memiliki hierarchy yang jelas

## Dashboard Overview

Ringkasan operasional (FD-90), mis.:

* pesanan hari ini
* pesanan mendatang
* order per status (baru, dikonfirmasi, diproses, siap diambil)
* pembayaran menunggu verifikasi
* kapasitas pickup mendatang
* ringkasan pendapatan sederhana
* order yang membutuhkan perhatian
* **payment exception** yang perlu direview (mis. pembayaran QRIS valid setelah order expired — FD-107)

Tidak ada modul BI/reporting lanjutan di V1.

## Order Management

Table desktop.

Card/list layout pada mobile.

Admin dapat:

* membuka detail order
* mengubah status order — kontrol hanya menampilkan **transition yang diizinkan** dari status saat ini (FD-116, `PRD.md` §22.4); tidak ada pilihan mundur/lompat bebas
* menyelesaikan order (Siap Diambil → Selesai) hanya bila payment `Lunas`; bila belum lunas, aksi dinonaktifkan dengan penjelasan (DI-09, FD-109)
* membatalkan order dengan alasan wajib — aksi batal **tidak tersedia** untuk order Selesai (FD-116)
* menerbitkan ulang kode akses tracking
* membuat **Manual Order** (FD-78)

## Manual Order

Form untuk mencatat order dari WhatsApp/offline: data customer, produk, tanggal pickup (dengan informasi kapasitas tersisa), metode & status pembayaran. Manual order memakai kapasitas yang sama dengan order website.

* Form menerapkan **validasi yang sama** dengan checkout website dan menampilkan pesan validasi yang sama (FD-110).
* Override **hanya** tersedia untuk: minimum preorder days, booking horizon, pickup cutoff, dan daily capacity (FD-119). Validasi lain (mis. tanggal diblokir, produk Sold Out/nonaktif, larangan Cash untuk Pre-Order, aturan pembayaran) ditampilkan sebagai error biasa **tanpa** opsi override.
* Override dilakukan secara eksplisit per validasi (bukan otomatis): UI menampilkan nilai/aturan normal (nilai sebelum) dan nilai yang dipakai (nilai sesudah), lalu **wajib** mengisi alasan. Admin dan timestamp tercatat otomatis di audit log.
* Manual Order tidak menyediakan cara untuk melewati verifikasi QRIS, penerbitan tracking token, maupun state transition.
* Setelah tersimpan, tampilkan nomor order dan **kode akses tracking** (FD-115) beserta aksi copy agar admin dapat menyampaikannya ke customer secara manual.

## Payment Management

* daftar bukti transfer menunggu verifikasi, dengan pratinjau file (tidak terekspos publik)
* aksi setujui bukti
* aksi **tolak** bukti dengan alasan → transaksi kembali `Menunggu Pembayaran` (FD-106)
* tandai pembayaran Cash sebagai lunas (bukan untuk pelunasan sisa DP — FD-109)
* **tidak ada** aksi konfirmasi manual untuk QRIS (FD-111)
* daftar **Payment Exception** untuk direview, dengan aksi mencatat manual resolution/refund (FD-107, FD-118). **Tidak ada** aksi reinstate untuk order Dibatalkan; bila customer tetap ingin memesan, customer membuat order baru
* catat refund (jumlah, status, alasan; waktu & operator tercatat otomatis)

## Pickup Capacity

* kalender/tabel kapasitas per tanggal (kapasitas, terisi, sisa, status)
* blokir / buka tanggal
* override kapasitas per tanggal

## Website Settings

Form untuk informasi bisnis, kontak, jam, pickup cutoff, kapasitas default, booking horizon, rekening bank, media sosial, instruksi pickup, dan instruksi pembayaran.

## Akun

* ganti password admin

Admin dashboard harus tetap usable pada tablet dan smartphone untuk tindakan penting: melihat order, membuka detail, mengubah status, dan memeriksa pembayaran.

---

# 21. Admin Product Management

Gunakan form yang jelas untuk:

* gambar utama
* gambar tambahan (nol atau lebih)
* nama produk
* deskripsi
* kategori
* harga
* harga sale (opsional)
* Ready Stock / Pre-Order
* minimum hari Pre-Order (hanya tampil bila Pre-Order)
* featured
* availability (Tersedia / Sold Out)
* maksimal quantity per order (opsional)
* aktif/nonaktif

Juga tersedia pengelolaan daftar kategori.

Form tidak boleh terlalu padat.

---

# 22. Responsive Design

Responsive adalah **mandatory requirement**, bukan optional enhancement.

Website harus terasa matang pada:

* HP kecil
* HP standar
* tablet / iPad
* laptop
* desktop

## Mobile

Prioritas:

* touch-friendly controls
* readable typography
* clear CTA
* simple navigation
* single-column layouts bila diperlukan
* compact cards
* checkout yang mudah digunakan

## Tablet

Gunakan layout intermediate.

Jangan sekadar menggunakan mobile layout yang diperbesar.

## Laptop/Desktop

Manfaatkan ruang horizontal untuk:

* editorial layouts
* product grids
* split hero
* dashboard tables
* multi-column checkout

## Tidak Boleh Terjadi

* horizontal overflow yang tidak disengaja
* teks atau CTA terpotong
* fungsi yang hanya bekerja di desktop
* kontrol penting yang hanya dapat diakses via hover
* layar admin yang tidak usable di mobile

---

# 23. Responsive Breakpoint Philosophy

Breakpoint tidak harus mengikuti angka secara kaku.

Layout harus berubah berdasarkan kebutuhan konten.

Namun implementasi dapat menggunakan breakpoint standar seperti:

* mobile: < 640px
* tablet: 640px–1023px
* desktop: >= 1024px
* large desktop: >= 1280px

Breakpoint final boleh disesuaikan berdasarkan hasil testing.

---

# 24. Interaction Design

Interaction harus subtle.

Gunakan:

* hover
* focus
* active
* pressed
* loading
* success
* error
* disabled states

Hover hanya sebagai pelengkap; tidak ada informasi atau aksi penting yang hanya tersedia via hover.

Animasi harus:

* cepat
* smooth
* tidak berlebihan
* tidak mengganggu checkout
* dinonaktifkan/dikurangi bila pengguna mengaktifkan reduced-motion

Contoh:

* card image sedikit scale ketika hover
* button memiliki transition
* cart item update secara smooth
* order status memiliki transition ringan

---

# 25. Accessibility

Design harus memperhatikan:

* readable contrast (target WCAG 2.1 AA, lihat §4.1)
* keyboard navigation
* visible focus state
* semantic HTML
* accessible labels (termasuk ikon cart, tombol copy, tombol WhatsApp)
* touch target yang cukup besar
* informasi tidak hanya dibedakan berdasarkan warna (status, badge, tanggal disabled)
* reduced-motion preference
* alt text untuk gambar produk

Jika palet referensi bertentangan dengan kontras yang aksesibel, **kontras yang diutamakan**, dengan penyesuaian warna yang tetap menjaga arah visual (FD-102).

---

# 26. Image Direction

Product photography merupakan elemen penting.

Foto produk sebaiknya:

* high quality
* warm lighting
* appetizing
* natural
* consistent background
* tidak terlalu banyak distraksi

Foto hero dapat lebih editorial/lifestyle.

Foto product card harus lebih konsisten agar grid terlihat rapi.

Selama development boleh memakai placeholder yang jelas ditandai. Foto produk asli disediakan klien sebelum production. Foto dari referensi tidak boleh digunakan.

---

# 27. Footer

Footer mengikuti mood visual reference.

Isi footer (FD-97):

* branding Enjua Cake's dan deskripsi singkat
* navigasi
* kontak
* alamat
* informasi pickup
* WhatsApp
* media sosial
* privacy / terms
* kebijakan pembatalan/refund **bila disediakan klien**
* copyright

**Tidak** menampilkan shipping policy karena layanan pickup only (FD-98). Tidak menyalin konten Sugar Bliss.

Footer dapat menggunakan dusty rose/mauve sebagai background section, dengan kontras teks yang memenuhi §4.1.

---

# 28. Empty States

Contoh (copy placeholder):

### Cart Empty

Illustration/photo kecil +:

> Keranjangmu masih kosong. Yuk, pilih kue favoritmu.

CTA:

`Lihat Produk`

Copy final dapat disesuaikan.

### No Product

Berikan informasi yang jelas dan CTA untuk kembali ke daftar produk.

### Kategori Kosong

Informasikan bahwa belum ada produk di kategori tersebut, dengan CTA ke semua produk.

---

# 29. Loading States

Gunakan skeleton/loading state yang mengikuti visual system.

Jangan menggunakan spinner besar untuk seluruh halaman jika hanya sebagian data yang sedang dimuat.

---

# 30. Error States

Error message harus:

* jelas
* tidak menyalahkan user
* memberikan langkah berikutnya

Contoh:

> Pembayaran belum terdeteksi. Silakan periksa kembali atau upload bukti pembayaran.

> Tanggal ini sudah penuh. Silakan pilih tanggal lain.

> Produk "…" saat ini Sold Out dan telah dihapus dari pesananmu.

> File harus berformat JPG, PNG, atau PDF dengan ukuran maksimal 5 MB.

---

# 31. Design Consistency Rules

Claude Code wajib menjaga konsistensi:

* spacing
* typography
* button style
* card radius
* image treatment
* icon style
* badge style
* form style
* color usage
* bahasa dan istilah (Bahasa Indonesia)

Jangan membuat setiap halaman memiliki gaya visual berbeda.

---

# 32. What Must NOT Be Done

Jangan:

* menyalin website referensi secara literal
* menggunakan nama Sugar Bliss
* menggunakan aset/foto dari referensi sebagai aset production
* membuat desain seperti marketplace generik
* menggunakan terlalu banyak gradient
* menggunakan terlalu banyak shadow
* membuat UI terlalu ramai
* menggunakan animasi berlebihan
* mengorbankan usability demi estetika
* mengorbankan kontras/aksesibilitas demi kemiripan dengan palet referensi
* mengorbankan responsive behavior demi desktop appearance
* membuat mobile hanya sebagai versi desktop yang diperkecil
* menampilkan ikon/fitur search (bukan V1)
* menampilkan pemilihan variant produk (bukan V1)
* menampilkan pemilihan tanggal pickup di cart
* menampilkan pemilihan slot jam pickup (V1 hanya tanggal)
* menampilkan shipping policy atau opsi delivery
* mencampur label fungsional berbahasa Inggris tanpa persetujuan

---

# 33. Design Acceptance Criteria

Design dianggap memenuhi requirement apabila:

* [ ] Visual direction terasa warm, premium, handmade, dan bakery-oriented.
* [ ] Produk menjadi focal point.
* [ ] Homepage memiliki hierarchy yang jelas.
* [ ] Category cards memakai kategori nyata; featured products memakai flag featured.
* [ ] Typography memiliki hierarchy yang konsisten.
* [ ] Color palette konsisten dan memenuhi kontras WCAG 2.1 AA.
* [ ] Product cards konsisten.
* [ ] Ready Stock, Pre-Order, dan Sold Out mudah dibedakan (tidak hanya lewat warna) dan memakai istilah tersebut tanpa diterjemahkan.
* [ ] Cart mudah digunakan dan tidak memuat pemilihan tanggal pickup.
* [ ] Checkout mudah dipahami, termasuk alasan tanggal disabled dan alasan Cash tidak tersedia.
* [ ] Payment information jelas (nominal, DP, sisa, batas waktu), termasuk state bukti ditolak, QRIS gagal, dan pelunasan sisa via QRIS/Transfer.
* [ ] Informasi pickup cutoff terlihat saat memilih tanggal pickup.
* [ ] Admin hanya dapat memilih transition status yang diizinkan; order Selesai tidak dapat dibatalkan.
* [ ] Override Manual Order hanya tersedia untuk empat validasi yang diizinkan dan selalu meminta alasan.
* [ ] Tidak ada kontrol reinstate untuk order Dibatalkan.
* [ ] Halaman order sukses menonjolkan nomor order dan kode akses.
* [ ] Order tracking mudah dipahami.
* [ ] Admin dashboard konsisten dengan brand tetapi tetap functional.
* [ ] UI customer dan admin menggunakan Bahasa Indonesia.
* [ ] Website usable pada HP kecil dan HP standar.
* [ ] Website usable pada tablet/iPad.
* [ ] Website usable pada laptop.
* [ ] Website usable pada desktop.
* [ ] Tidak ada accidental horizontal scrolling.
* [ ] Tidak ada teks atau CTA yang terpotong.
* [ ] Touch target nyaman digunakan.
* [ ] Keyboard focus terlihat.
* [ ] Reduced-motion diperhatikan.
* [ ] Loading, empty, error, disabled, dan success state tersedia.
* [ ] Design tidak bergantung pada hover.
* [ ] Referensi visual digunakan sebagai inspirasi, bukan disalin.

---

# 34. Implementation Guidance for Claude Code

Sebelum melakukan coding:

1. Baca `FINAL-REQUIREMENT-DECISIONS.md`.
2. Baca `PRD.md`.
3. Baca dokumen ini.
4. Baca/analisis `design-reference/homepage-reference.jpeg`.
5. Identifikasi visual patterns dari reference.
6. Buat design system yang konsisten (termasuk token warna yang sudah diuji kontrasnya).
7. Pastikan functional requirements dari `PRD.md` tidak berubah.
8. Jangan membuat keputusan bisnis baru tanpa menandainya sebagai `Need Clarification`.
9. Jika ada konflik antara design dan functional requirements, prioritaskan functional correctness lalu cari solusi visual yang tetap sesuai design direction.
10. Pastikan responsive behavior dirancang sejak awal, bukan ditambahkan setelah desktop selesai.

---

# 35. Reference Mapping

Reference utama terutama digunakan untuk menginspirasi:

| Reference Element | Enjua Cake's Adaptation |
|---|---|
| Bakery hero | Enjua Cake's hero |
| Large product photography | Hero cake/product photography |
| Serif headline | Enjua editorial heading |
| Dusty rose background | Enjua accent palette (disesuaikan untuk kontras) |
| Cream background | Main background |
| Three category cards | Category cards dari kategori produk nyata (jumlah mengikuti data) |
| Value highlight icons | Brand/value highlights (klaim disetujui klien) |
| Editorial split section (kopi) | About / brand story / Cara Pesan |
| Soft rounded cards | Product/category cards |
| Organic section transitions | Selected homepage transitions |
| Navbar pill CTA | CTA "Pesan Sekarang" |
| Navbar search icon | **Tidak diadaptasi** (search bukan V1) |
| Warm footer | Enjua footer (tanpa shipping policy) |

---

# 36. Final Design Principle

> **Enjua Cake's should feel like a warm premium bakery brand first, and an e-commerce website second.**

The interface must remain easy to use, but the visual experience should make the products feel desirable before the user even starts ordering.
