# PRD — Enjua Cake's
## Product Requirements Document

**Document Version:** 1.0  
**Status:** Draft for Review  
**Product:** Enjua Cake's — Online Cake Ordering & Management Website  
**Primary Goal:** Menjadi website penjualan kue yang memungkinkan pelanggan melihat produk, melakukan pemesanan untuk pickup, memilih Ready Stock atau Pre-Order, melakukan pembayaran, dan melacak status pesanan; sekaligus menyediakan dashboard admin untuk mengelola produk, pesanan, pembayaran, dan informasi website.

---

# 1. Ringkasan Produk

Enjua Cake's adalah website penjualan kue untuk pelanggan yang ingin melihat katalog produk, memilih produk, menentukan jumlah, memilih tanggal pengambilan (pickup), melakukan checkout dan pembayaran, serta memantau status pesanan tanpa harus membuat akun.

Sistem juga menyediakan **Admin Dashboard**. Admin dapat mengelola katalog produk, harga, diskon, status Ready Stock/Pre-Order, aturan minimum Pre-Order, pesanan, pembayaran, kapasitas pesanan per tanggal pickup, dan informasi website.

Produk dapat berupa kue Ready Stock maupun Pre-Order. Sistem Pre-Order mempertimbangkan **minimum waktu produksi produk** dan **kapasitas maksimal 10 order per tanggal pickup**.

Sistem pembayaran dirancang agar dapat menggunakan **payment gateway dengan QRIS dinamis** dan mekanisme **webhook** untuk memperbarui status pembayaran secara otomatis. Selama tahap development, payment gateway harus dapat diuji menggunakan sandbox/test environment.

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

Setiap order memiliki nomor unik, misalnya:

`ENC-20261008-001`

Customer dapat melihat perkembangan pesanan melalui halaman tracking.

Untuk keamanan, halaman tracking sebaiknya menggunakan:
- nomor order; dan
- kode akses/token unik atau mekanisme autentikasi ringan lainnya.

Nomor order saja tidak boleh menjadi satu-satunya pengaman jika halaman menampilkan data pribadi customer.

---

# 5. Katalog Produk

Setiap produk minimal memiliki:

- ID produk
- Nama produk
- Foto utama
- Foto tambahan (opsional)
- Deskripsi
- Harga normal
- Diskon (opsional)
- Harga setelah diskon
- Tipe produk:
  - Ready Stock
  - Pre-Order
- Minimum Pre-Order dalam hari jika produk Pre-Order
- Status aktif/nonaktif
- Waktu dibuat
- Waktu diperbarui

## 5.1 Tampilan Produk

Customer dapat melihat:

- Foto produk
- Nama produk
- Harga
- Harga diskon jika ada
- Label Ready Stock atau Pre-Order
- Informasi minimum Pre-Order bila relevan
- Deskripsi produk
- Tombol tambah ke cart

## 5.2 Harga dan Diskon

Admin dapat:
- Mengubah harga.
- Menambahkan diskon.
- Mengubah diskon.
- Menghapus diskon.

Harga yang digunakan pada order harus disimpan sebagai **snapshot harga saat order dibuat**, sehingga perubahan harga produk di kemudian hari tidak mengubah histori order lama.

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

## 6.1 Ready Stock + Pre-Order

Customer **boleh memasukkan Ready Stock dan Pre-Order dalam satu cart/order**.

Contoh:

- Brownies — Ready Stock
- Birthday Cake — Pre-Order
- Cookies — Ready Stock

Semuanya dapat menjadi satu order.

Jika cart memiliki produk Pre-Order, sistem harus memeriksa tanggal pickup berdasarkan aturan Pre-Order produk tersebut.

---

# 7. Sistem Pickup

Versi awal menggunakan **pickup/self-pickup**.

Tidak ada sistem delivery pada versi awal.

Customer harus memilih tanggal pickup saat checkout.

## 7.1 Tanggal Pickup

Sistem hanya menampilkan tanggal yang memenuhi seluruh aturan:

1. Tanggal masih dapat dipesan.
2. Kapasitas order tanggal tersebut belum penuh.
3. Semua produk Pre-Order memenuhi minimum waktu produksi.
4. Tanggal tidak diblokir oleh admin.
5. Jika ada aturan operasional/pickup hour, tanggal tersebut tersedia sesuai konfigurasi.

Tanggal yang tidak memenuhi syarat harus tidak dapat dipilih atau ditampilkan sebagai unavailable dengan alasan yang jelas.

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

## 8.1 Aturan untuk Cart Campuran

Jika customer memasukkan beberapa produk Pre-Order dengan minimum waktu berbeda, tanggal pickup harus memenuhi **produk yang membutuhkan waktu paling lama**.

Contoh:

- Cake A → 1 hari
- Cake B → 3 hari

Maka order harus mengikuti minimum 3 hari.

---

# 9. Kapasitas Order Harian

Batas kapasitas bisnis yang disepakati:

> **Maksimal 10 order per tanggal pickup.**

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

---

# 10. Reservasi Kapasitas

Sistem harus mencegah dua customer mendapatkan slot terakhir secara bersamaan.

Direkomendasikan:
- slot kapasitas di-reserve ketika order berhasil dibuat;
- order yang belum menyelesaikan pembayaran dapat memiliki masa reservasi yang dapat dikonfigurasi;
- jika reservasi berakhir atau order dibatalkan, slot dikembalikan;
- order yang sudah dikonfirmasi/berhasil dibayar mempertahankan slot sampai selesai atau dibatalkan sesuai aturan bisnis.

Durasi masa reservasi pembayaran **belum ditentukan** dan harus menjadi konfigurasi yang dapat diputuskan sebelum production.

---

# 11. Kalender dan Pengaturan Kapasitas

Admin dapat melihat kapasitas berdasarkan tanggal.

Contoh:

| Tanggal | Kapasitas | Terisi | Sisa | Status |
|---|---:|---:|---:|---|
| 8 Okt | 10 | 3 | 7 | Tersedia |
| 9 Okt | 10 | 8 | 2 | Tersedia |
| 10 Okt | 10 | 10 | 0 | Penuh |

Admin sebaiknya dapat:
- melihat order per tanggal;
- melihat sisa kapasitas;
- memblokir tanggal tertentu;
- membuka kembali tanggal yang diblokir;
- mengatur kapasitas default.

Kapasitas default awal adalah **10 order per tanggal**.

---

# 12. Checkout

Checkout harus mengumpulkan data yang diperlukan untuk memenuhi order.

Minimal data yang diperlukan:

- Nama customer
- Nomor WhatsApp
- Tanggal pickup
- Detail produk
- Jumlah
- Harga
- Diskon
- Total
- Metode pembayaran
- Pilihan pembayaran:
  - DP 50%
  - Bayar penuh

Data tambahan yang memang diperlukan operasional dapat ditambahkan setelah finalisasi bisnis.

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

---

# 13. Sistem Pembayaran

Metode pembayaran versi awal:

1. QRIS
2. Transfer bank
3. Cash saat pickup

Sistem harus memisahkan:

**Order Status**

dan

**Payment Status**

---

# 14. Payment Status

Status pembayaran minimal:

- Belum Dibayar
- Menunggu Pembayaran
- DP Terbayar
- Lunas
- Pembayaran Gagal
- Pembayaran Kedaluwarsa
- Refund (jika suatu saat diperlukan)

Nama status dapat disesuaikan pada tahap implementation selama maknanya tetap sama.

---

# 15. DP 50% dan Pembayaran Penuh

Customer dapat memilih:

### Opsi A — DP 50%

Contoh:

Total order:
`Rp300.000`

DP:
`Rp150.000`

Sisa:
`Rp150.000`

Setelah DP berhasil:

- Payment Status: DP Terbayar
- Paid Amount: Rp150.000
- Remaining Amount: Rp150.000

### Opsi B — Bayar Penuh

Customer membayar:

`Rp300.000`

Setelah berhasil:

- Payment Status: Lunas
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

Provider payment gateway **belum ditentukan** dan harus dipilih pada tahap technical planning berdasarkan:
- biaya transaksi;
- dukungan QRIS;
- dukungan DP/pembayaran bertahap;
- webhook;
- dokumentasi;
- sandbox;
- kemudahan integrasi;
- dukungan Indonesia;
- settlement;
- kebutuhan legal/merchant onboarding.

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

Upload bukti pembayaran tetap disediakan sebagai fallback/manual verification.

### Jika order melalui website

Customer dapat mengunggah bukti pembayaran melalui website jika diperlukan.

### Jika order dilakukan melalui WhatsApp

Customer mengirim bukti pembayaran melalui WhatsApp.

Sistem website tidak boleh menganggap screenshot sebagai bukti pembayaran yang valid secara otomatis jika payment gateway belum mengonfirmasi transaksi.

Admin dapat melakukan verifikasi manual jika diperlukan.

---

# 19. Transfer Bank

Transfer bank dapat digunakan sebagai metode pembayaran.

Untuk versi awal dapat mendukung:
- instruksi rekening bank;
- nominal pembayaran;
- upload bukti pembayaran;
- verifikasi admin.

Jika pada technical planning dipilih payment gateway dengan Virtual Account/bank transfer yang mendukung webhook, sistem dapat dikembangkan agar verifikasi transfer lebih otomatis.

---

# 20. Cash saat Pickup

Jika customer memilih cash saat pickup:

- Customer tidak perlu upload bukti pembayaran.
- Status pembayaran awal: Belum Dibayar.
- Admin menerima pembayaran ketika customer mengambil pesanan.
- Admin dapat menandai pembayaran sebagai Lunas.
- Sistem mencatat waktu dan admin yang melakukan perubahan.

Versi awal direkomendasikan menggunakan:

> Cash saat pickup = pembayaran penuh saat pickup.

DP cash saat pickup bukan requirement versi awal.

---

# 21. Pelunasan DP

Jika customer memilih DP:

Sistem harus menyimpan:
- total order;
- nominal DP;
- nominal sudah dibayar;
- nominal tersisa.

Admin/customer harus dapat mengetahui nominal yang belum dibayar.

Untuk pembayaran pelunasan online, sistem dapat membuat transaksi pembayaran berikutnya untuk nominal sisa.

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
Order dibatalkan sesuai aturan bisnis.

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
- Nominal total
- Nominal dibayar
- Nominal tersisa
- Order status
- Payment status
- Catatan customer jika ada
- Bukti pembayaran jika ada
- Riwayat perubahan status
- Waktu perubahan status
- Admin yang melakukan perubahan jika relevan

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

---

# 26. Customer Order Tracking

Customer tidak perlu login.

Customer membuka halaman:

**Lacak Pesanan**

Kemudian memasukkan:
- nomor order;
- kode akses/token jika digunakan.

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

Contoh:

```text
ENC-20261008-001

✓ Pesanan Diterima
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

---

# 27. Notifikasi Status

Customer harus dapat mengetahui perubahan status.

Versi awal wajib memastikan status selalu dapat dilihat melalui tracking page.

Notifikasi WhatsApp otomatis bukan requirement wajib untuk versi pertama karena membutuhkan integrasi WhatsApp/API yang sesuai.

Arsitektur sistem sebaiknya tetap dibuat agar integrasi notifikasi dapat ditambahkan kemudian.

Contoh future notification:

> Pesanan #ENC-20261008-001 telah berubah menjadi "Pesanan Diproses".

---

# 28. WhatsApp

Website harus menyediakan cara mudah bagi customer untuk menghubungi Enjua Cake's melalui WhatsApp.

Untuk versi awal:
- gunakan link WhatsApp;
- dapat menggunakan pre-filled message;
- jangan menganggap WhatsApp biasa dapat mengirim pesan otomatis dari sistem.

Jika suatu saat menggunakan WhatsApp Business Platform/API, sistem dapat ditingkatkan menjadi notifikasi otomatis.

Order yang dilakukan langsung melalui WhatsApp berada di luar flow checkout website dan dapat dikelola admin secara manual sesuai kebutuhan operasional.

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

---

# 30. Admin Dashboard

Dashboard menyediakan ringkasan operasional.

Informasi yang direkomendasikan:

- Pesanan baru
- Pesanan yang sedang diproses
- Pesanan siap diambil
- Pesanan selesai
- Pesanan dibatalkan
- Pembayaran yang perlu diverifikasi
- Total order berdasarkan periode
- Kapasitas pickup terdekat
- Order yang membutuhkan perhatian

Dashboard tidak boleh hanya menjadi tampilan statistik; fungsi utama admin adalah mengelola operasional website.

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
- Menambah/mengubah/menghapus diskon
- Mengatur Ready Stock / Pre-Order
- Mengatur minimum Pre-Order
- Mengatur status produk aktif/nonaktif

## 31.1 Delete Product

Produk yang sudah pernah masuk ke order sebaiknya tidak dihapus secara hard delete.

Lebih aman menggunakan:
- inactive/archive;
- histori order tetap menyimpan snapshot data produk.

---

# 32. Website Content Management

Admin dapat mengelola informasi website tanpa mengubah source code jika fitur tersebut memang disediakan dalam dashboard.

Informasi yang dapat dikelola:

- Nama/brand
- Deskripsi Enjua Cake's
- Informasi pemesanan
- Informasi pickup
- Kontak
- Nomor WhatsApp
- Alamat pickup
- Jam operasional/pickup
- Informasi Pre-Order
- Informasi pembayaran
- Informasi tambahan lainnya

Detail field final dapat disesuaikan pada technical planning.

---

# 33. Homepage

Homepage harus menjadi titik awal customer untuk memahami Enjua Cake's.

Struktur konten yang direkomendasikan:

1. Navigation/Header
2. Hero section
3. Perkenalan singkat Enjua Cake's
4. Produk unggulan
5. Kategori/jenis produk jika diperlukan
6. Informasi Ready Stock & Pre-Order
7. Cara pemesanan
8. Informasi pickup
9. Call-to-action
10. Informasi kontak
11. Footer

Struktur visual final mengikuti design reference yang akan diberikan user.

---

# 34. Design Reference

Design reference belum tersedia dalam bentuk screenshot desain website yang final.

Ketika design reference diberikan, Claude Code harus:

- Menganalisis layout.
- Menganalisis hierarchy.
- Menganalisis typography.
- Menganalisis spacing.
- Menganalisis card design.
- Menganalisis navigation.
- Menganalisis responsive behavior.
- Mengidentifikasi pola visual yang relevan.
- Menggunakan reference sebagai panduan, bukan menyalin aset/karya secara sembarangan.

Design reference tidak boleh dianggap sebagai requirement fungsional.

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
- Quantity harus valid.
- Produk harus masih aktif.
- Harga harus dihitung ulang di server.
- Diskon harus dihitung ulang di server.
- Tanggal pickup harus tersedia.
- Minimum Pre-Order harus terpenuhi.
- Kapasitas harus dicek ulang saat order dibuat.
- Payment amount harus berasal dari data server.
- Customer tidak boleh memanipulasi total pembayaran dari browser.

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
Maksimal kapasitas adalah 10 order per tanggal pickup.

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
Customer dapat memilih DP 50% atau pembayaran penuh.

## BR-13
Cash saat pickup pada versi awal menggunakan pembayaran penuh saat pickup.

## BR-14
QRIS production diarahkan menggunakan payment gateway dan transaksi yang dapat dikaitkan dengan order.

## BR-15
Webhook payment harus divalidasi di backend.

## BR-16
Customer dapat melacak order tanpa login.

## BR-17
Data order customer tidak boleh dapat diakses hanya dengan menebak URL/ID tanpa mekanisme keamanan yang memadai.

---

# 39. Edge Cases

Sistem harus mempertimbangkan:

### EC-01 — Slot terakhir direbut dua customer
Dua customer mencoba mengambil slot ke-10 secara bersamaan.

**Expected:** hanya satu order yang berhasil mendapatkan slot.

### EC-02 — Customer meninggalkan checkout
Cart/checkout tidak boleh langsung dianggap sebagai order final tanpa aturan reservasi yang jelas.

### EC-03 — Payment timeout
Order yang tidak dibayar sampai batas waktu reservasi harus dapat kedaluwarsa dan slot dikembalikan.

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
Perubahan kapasitas tidak boleh menghapus order yang sudah valid secara otomatis.

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
- Upload file dibatasi tipe dan ukuran.
- File upload tidak boleh dieksekusi sebagai kode.
- Payment webhook diverifikasi.
- Secret API key tidak boleh masuk frontend/public repository.
- Environment variables digunakan untuk secret.
- Customer hanya dapat mengakses order miliknya.
- Server menjadi sumber kebenaran untuk harga, diskon, kapasitas, dan total pembayaran.

---

# 41. Data Model Tingkat Produk

Entity utama yang diperkirakan diperlukan:

## User/Admin
- id
- name
- email/username
- password hash atau provider auth
- role
- created_at
- updated_at

## Product
- id
- name
- description
- image
- price
- discount
- product_type
- minimum_preorder_days
- is_active
- created_at
- updated_at

## Order
- id
- order_number
- customer_name
- customer_phone
- pickup_date
- subtotal
- discount_total
- grand_total
- paid_amount
- remaining_amount
- order_status
- payment_status
- payment_method
- payment_option
- notes
- created_at
- updated_at

## Order Item
- id
- order_id
- product_id
- product_name_snapshot
- unit_price_snapshot
- discount_snapshot
- quantity
- subtotal

## Payment
- id
- order_id
- transaction/reference ID
- payment type
- amount
- method
- status
- provider
- provider transaction ID
- paid_at
- created_at
- updated_at

## Pickup Capacity
- id
- date
- capacity
- reserved_count/used_count
- blocked
- created_at
- updated_at

## Order Status History
- id
- order_id
- old_status
- new_status
- changed_by
- created_at

## Payment Proof
- id
- order_id
- payment_id
- file_url
- uploaded_at
- verification_status
- verified_by
- verified_at

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

Flow:

```text
Customer
   ↓
Checkout
   ↓
Order dibuat
   ↓
Pesanan Baru
   ↓
Admin review
   ↓
Dikonfirmasi
   ↓
Pembayaran sesuai pilihan
   ↓
Pesanan Diproses
   ↓
Produksi selesai
   ↓
Siap Diambil
   ↓
Customer mengambil
   ↓
Selesai
```

Jika terjadi pembatalan:

```text
Pesanan
   ↓
Dibatalkan
```

Pembatalan harus memiliki aturan bisnis yang jelas untuk pembayaran/DP/refund sebelum production.

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
Payment Method
   ↓
DP 50% / Full Payment
   ↓
Order Created
   ↓
Payment
   ↓
Payment Confirmation
   ↓
Order Tracking
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
   ├── Products
   ├── Orders
   ├── Payments
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
Create order
   ↓
Create payment transaction
   ↓
Customer pays
   ↓
Payment provider
   ↓
Webhook
   ↓
Validate webhook
   ↓
Update payment
   ↓
Update order payment summary
   ↓
Customer tracking + Admin dashboard
```

---

# 49. WhatsApp Order Workflow

Order melalui WhatsApp bukan bagian dari checkout website versi awal.

Customer dapat:
- membuka WhatsApp;
- menghubungi admin;
- berdiskusi mengenai produk/order;
- mengirim bukti pembayaran melalui WhatsApp jika pembayaran dilakukan melalui jalur tersebut.

Jika order WhatsApp perlu dimasukkan ke dashboard pada fase berikutnya, admin dapat memiliki fungsi **Create Order Manually**.

Fitur ini direkomendasikan sebagai enhancement karena akan membantu menyatukan order dari website dan WhatsApp ke dalam satu dashboard.

---

# 50. Admin Manual Order — Recommended Enhancement

Admin sebaiknya dapat membuat order secara manual.

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
Create order
```

Ini bukan requirement customer-facing, tetapi sangat berguna untuk operasional nyata.

---

# 51. Reporting Dasar

Dashboard dapat menyediakan laporan dasar:

- jumlah order;
- order berdasarkan status;
- order berdasarkan tanggal pickup;
- total penjualan;
- total pembayaran;
- total pembayaran yang masih tersisa;
- produk yang paling sering dipesan.

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

### Product unavailable
> Produk saat ini tidak tersedia.

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
7. Sistem mencegah pickup date yang tidak memenuhi minimum Pre-Order.
8. Sistem membatasi maksimal 10 order per pickup date.
9. Sistem menghitung 1 checkout sebagai 1 order.
10. Ready Stock dan Pre-Order dapat berada dalam satu order.
11. Customer dapat memilih DP 50% atau pembayaran penuh.
12. Sistem menyimpan paid amount dan remaining amount.
13. Order status dan payment status terpisah.
14. Admin dapat mengelola produk.
15. Admin dapat mengelola order.
16. Admin dapat mengubah status order.
17. Customer dapat melihat perubahan status melalui tracking.
18. Pembayaran online dapat diuji di sandbox.
19. Payment webhook dapat memperbarui status secara aman.
20. Customer tidak dapat mengakses data order customer lain.
21. Cash pickup dapat ditandai lunas oleh admin.
22. Kapasitas pickup dikembalikan ketika order dibatalkan/expired sesuai aturan reservasi.
23. Website responsif.
24. Data sensitif tidak disimpan atau dikirim secara tidak aman.

---

# 54. Requirement yang Masih Perlu Diputuskan

PRD tidak boleh mengarang keputusan yang belum diberikan.

Hal berikut masih perlu dikonfirmasi sebelum technical planning final:

## 54.1 Branding
- Logo final
- Warna brand
- Font
- Tone of voice
- Foto produk final

## 54.2 Konten
- Deskripsi bisnis
- Alamat pickup
- Jam pickup
- Nomor WhatsApp
- Informasi pembayaran

## 54.3 Payment Gateway
Provider final belum dipilih.

Kandidat dapat dibandingkan pada tahap technical planning berdasarkan:
- biaya;
- QRIS;
- payment link;
- webhook;
- sandbox;
- settlement;
- dokumentasi;
- kebutuhan merchant.

## 54.4 Bank Transfer
- Nama bank
- Nomor rekening
- Nama pemilik rekening

## 54.5 Kebijakan Pembatalan dan Refund
Belum ditentukan.

Ini penting terutama karena ada DP 50%.

## 54.6 Masa Reservasi Pembayaran
Belum ditentukan.

Contoh keputusan yang perlu dibuat:
- Berapa lama order unpaid mempertahankan slot?
- Setelah expired apakah order otomatis dibatalkan?
- Apakah customer dapat membayar kembali?

## 54.7 Jam Pickup
Belum ditentukan.

## 54.8 Hari Libur
Perlu ditentukan apakah admin dapat memblokir tanggal tertentu.

## 54.9 Customer Notes
Perlu diputuskan apakah customer dapat menambahkan catatan khusus pada order.

## 54.10 Custom Cake
Custom cake belum menjadi requirement yang dikunci.

Jika nantinya didukung, perlu ditentukan:
- upload reference image;
- ukuran;
- rasa;
- desain;
- tulisan di kue;
- warna;
- request khusus;
- harga custom;
- approval desain.

---

# 55. Future Enhancements

Setelah versi awal stabil, sistem dapat dikembangkan menjadi:

1. WhatsApp Business/API notification.
2. Admin manual order dari WhatsApp.
3. Custom cake configurator.
4. Customer account.
5. Order history customer.
6. Delivery/local courier.
7. Dynamic delivery fee.
8. Promo code.
9. Voucher.
10. Loyalty program.
11. Product review.
12. Advanced analytics.
13. Inventory management.
14. Ingredient stock management.
15. Production planning.
16. Multi-admin role.
17. Multi-branch.
18. Automated reminder sebelum pickup.
19. Automated payment reminder.
20. Automated refund workflow.

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
- Cart
- Checkout
- Pickup date
- Capacity system
- Pre-order validation

### Phase 4 — Orders
- Order creation
- Order detail
- Tracking
- Status management

### Phase 5 — Payment
- Payment gateway sandbox
- QRIS
- Payment status
- Webhook
- DP/full payment
- Manual proof fallback

### Phase 6 — Admin
- Product management
- Order management
- Payment management
- Capacity management
- Website settings

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
Checkout
 ↓
Pickup Date
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
 ├── Products
 ├── Orders
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
maksimal 10 order per pickup date
Pre-Order mengikuti minimum production lead time
pickup only
DP 50% atau full payment
QRIS + transfer bank + cash pickup
order status ≠ payment status
tracking tanpa customer login
payment production diarahkan melalui payment gateway
QRIS diarahkan menggunakan dynamic transaction flow
webhook digunakan untuk payment confirmation
```

---

# 62. Status Dokumen

**PRD Version 1.0 — Draft for Review**

Dokumen ini sudah mencakup requirement inti yang telah disepakati berdasarkan diskusi awal.

**PRD belum dianggap final untuk coding sampai:**
1. user menyetujui isi PRD;
2. open questions yang dianggap wajib diputuskan telah diselesaikan;
3. design reference tersedia/ditinjau;
4. technical implementation plan dibuat dan disetujui.

**Jangan mulai implementasi production hanya berdasarkan dokumen ini sebelum tahap plan selesai.**
