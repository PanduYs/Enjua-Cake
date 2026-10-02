# Enjua Cake's — PRD Design Specification

**Version:** 1.0  
**Status:** Draft for Review  
**Related document:** `PRD.md`  
**Primary visual reference:** `design-reference/homepage-reference.jpeg`

\---

## 1\. Purpose

Dokumen ini mendefinisikan arah visual, UI, UX, layout, responsive behavior, dan interaction design untuk website **Enjua Cake's**.

`PRD.md` menjelaskan **apa yang harus dilakukan sistem**. Dokumen ini menjelaskan **bagaimana sistem tersebut harus terlihat dan terasa bagi pengguna**.

Claude Code wajib menggunakan dokumen ini sebagai acuan desain setelah `PRD.md` dipahami.

\---

# 2\. Design Reference

Referensi utama yang diberikan untuk desain adalah screenshot website bakery dengan karakter visual:

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

Identitas visual final harus menggunakan brand **Enjua Cake's**.

\---

# 3\. Overall Design Direction

Website Enjua Cake's harus memberikan kesan:

> \*\*Warm, premium, handmade, appetizing, elegant, dan mudah digunakan.\*\*

Website jangan terlihat seperti marketplace generik.

Fokus visual utama adalah **produk kue**.

Desain harus membuat pengguna merasa:

* nyaman menjelajah produk
* mudah menemukan kue
* percaya terhadap toko
* tertarik melihat foto produk
* mudah melakukan pemesanan
* tidak bingung ketika checkout

\---

# 4\. Visual Language

## 4.1 Color Direction

Gunakan palet yang terinspirasi dari referensi:

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

### Important Rule

Warna harus tetap memiliki kontras yang cukup untuk readability.

Jangan menggunakan terlalu banyak warna berbeda.

Palet utama harus terasa konsisten di seluruh halaman.

\---

# 5\. Typography

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

\---

# 6\. Layout Philosophy

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

\---

# 7\. Global Navigation

## Desktop

Navbar mengikuti prinsip referensi:

* logo Enjua Cake's di sisi kiri
* navigation di area tengah
* search icon
* cart icon
* primary CTA seperti `Order Now`
* background terang/transparan sesuai section
* navbar tetap bersih dan tidak terlalu tinggi

Navigation yang direkomendasikan:

* Home
* Cakes / Products
* About
* How to Order
* Contact

Nama final menu dapat disesuaikan dengan konten website.

## Mobile

Navbar berubah menjadi:

* logo
* cart
* hamburger menu

Menu dibuka menggunakan mobile navigation panel/drawer.

Jangan memaksakan desktop navbar ke layar mobile.

\---

# 8\. Homepage

Homepage menjadi halaman dengan visual paling kuat.

Urutan section direkomendasikan:

1. Navbar
2. Hero
3. Brand/value highlights
4. Featured categories
5. Featured products
6. About / brand story
7. Ordering information
8. Pickup information
9. CTA
10. Footer

Urutan dapat disesuaikan jika hasil implementasi dari design reference menunjukkan komposisi yang lebih baik.

\---

# 9\. Hero Section

Hero mengikuti prinsip visual reference.

## Composition

Desktop:

* text berada di satu sisi
* hero product image berada di sisi lainnya
* background menggunakan warm cream + dusty rose/mauve
* section memiliki visual transition yang organic/paint-like bila sesuai

## Content

Hero harus memiliki:

### Headline

Singkat, memorable, dan berhubungan dengan produk Enjua Cake's.

### Supporting text

Menjelaskan secara singkat produk/bakery.

### Primary CTA

Contoh:

`Order Now`

### Secondary CTA

Contoh:

`Explore Cakes`

CTA final mengikuti content yang disetujui.

## Product Image

Gunakan foto kue berkualitas tinggi.

Produk menjadi focal point.

Jangan membuat text menutupi bagian penting dari produk.

\---

# 10\. Brand / Value Highlights

Setelah hero dapat digunakan section singkat untuk menunjukkan keunggulan.

Contoh konsep:

* Freshly Made
* Quality Ingredients
* Made with Care

Gunakan icon sederhana dengan gaya yang konsisten.

Icon tidak boleh terlalu kompleks.

\---

# 11\. Product Categories

Mengikuti prinsip tiga card pada referensi.

Category card dapat digunakan untuk:

* Cakes
* Desserts
* Cookies
* Custom Cakes
* kategori lain sesuai produk aktual

Setiap card:

* background pastel berbeda
* category title
* short description
* product image
* directional arrow / CTA

Card harus memiliki visual yang ringan dan premium.

\---

# 12\. Product Listing

Halaman produk harus fokus pada produk.

## Product Card

Setiap card minimal menampilkan:

* product image
* product name
* price
* discounted price jika ada
* discount indicator jika ada
* Ready Stock / Pre-Order badge
* CTA / add to cart

Jika produk memiliki informasi tambahan yang penting, tampilkan secara ringkas.

## Card Style

* rounded corners
* warm neutral background
* image menjadi focal point
* subtle interaction
* tidak menggunakan border yang terlalu berat

\---

# 13\. Product Detail Page

Product detail harus memiliki layout:

### Desktop

Image gallery di satu sisi.

Informasi produk di sisi lain:

* product name
* price
* discount
* availability
* Ready Stock / Pre-Order
* description
* minimum preorder information jika berlaku
* quantity
* add to cart
* ordering notes jika diperlukan

### Mobile

Image berada di atas.

Informasi produk berada di bawah.

CTA harus mudah dijangkau dengan satu tangan.

\---

# 14\. Ready Stock \& Pre-Order Visual System

Gunakan badge yang jelas tetapi tetap sesuai visual brand.

Contoh:

### Ready Stock

Badge dengan warna soft green / neutral.

### Pre-Order

Badge dengan warna dusty rose / muted accent.

### Sold Out

Badge dengan warna neutral/darker.

Badge tidak boleh terlalu besar sehingga mendominasi foto produk.

\---

# 15\. Cart

Cart harus terasa sederhana dan tidak seperti halaman admin.

Setiap item:

* thumbnail
* product name
* variant/custom information jika ada
* price
* quantity control
* subtotal
* remove action

Summary:

* subtotal
* discount
* total
* selected pickup date
* payment summary
* checkout CTA

Cart harus responsive.

\---

# 16\. Checkout

Checkout harus dibuat sebagai proses yang jelas.

Informasi:

### Customer Information

* nama
* WhatsApp
* informasi kontak yang diperlukan

### Pickup

* tanggal pickup
* informasi jam pickup
* availability

Calendar/date picker harus menampilkan tanggal yang tidak tersedia sebagai disabled.

### Order Summary

Tampilkan seluruh produk.

### Payment

Pilihan:

* QRIS
* Bank Transfer
* Cash on Pickup

Pilihan DP/full payment harus terlihat jelas.

Contoh:

`Bayar DP 50%`

atau

`Bayar Penuh 100%`

Jika memilih DP:

* total
* jumlah DP
* sisa pembayaran

harus ditampilkan dengan jelas.

\---

# 17\. Payment UI

Payment UI harus membuat customer yakin terhadap:

* nominal yang harus dibayar
* metode pembayaran
* status pembayaran
* sisa pembayaran

Contoh:

```text
Total Pesanan       Rp300.000
DP 50%              Rp150.000
Sisa Pembayaran     Rp150.000
```

Jika pembayaran otomatis berhasil:

`Pembayaran berhasil`

Jika menunggu:

`Menunggu pembayaran`

Jika membutuhkan bukti:

`Upload bukti pembayaran`

\---

# 18\. Order Tracking

Halaman tracking harus sederhana.

Customer memasukkan:

* order number
* access code/token jika digunakan

Kemudian melihat:

### Order Information

* order number
* pickup date
* products
* total

### Order Status Timeline

Contoh:

`Pesanan Baru`
↓
`Dikonfirmasi`
↓
`Pesanan Diproses`
↓
`Siap Diambil`
↓
`Selesai`

Status aktif harus mudah dikenali.

### Payment Status

Dipisahkan dari order status.

Contoh:

`DP 50% Terbayar`

atau

`Lunas`

\---

# 19\. Status Visual

Status harus menggunakan kombinasi:

* label
* icon
* visual state

Jangan mengandalkan warna saja.

Ini membantu accessibility.

\---

# 20\. Admin Dashboard

Admin menggunakan visual system yang sama tetapi lebih functional.

Admin dashboard harus:

* clean
* information-dense tetapi tidak penuh
* mudah scanning
* responsive
* memiliki hierarchy yang jelas

## Dashboard Overview

Dapat menampilkan:

* pesanan hari ini
* pesanan mendatang
* order baru
* order diproses
* order siap pickup
* pembayaran menunggu verifikasi
* kapasitas pickup

## Order Management

Table desktop.

Card/list layout pada mobile.

Admin dapat membuka detail order.

\---

# 21\. Admin Product Management

Gunakan form yang jelas untuk:

* product image
* product name
* description
* price
* discount
* Ready Stock / Pre-Order
* minimum preorder days
* active/inactive

Form tidak boleh terlalu padat.

\---

# 22\. Responsive Design

Responsive adalah **mandatory requirement**, bukan optional enhancement.

Website harus terasa matang pada:

* mobile phone
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

\---

# 23\. Responsive Breakpoint Philosophy

Breakpoint tidak harus mengikuti angka secara kaku.

Layout harus berubah berdasarkan kebutuhan konten.

Namun implementasi dapat menggunakan breakpoint standar seperti:

* mobile: < 640px
* tablet: 640px–1023px
* desktop: >= 1024px
* large desktop: >= 1280px

Breakpoint final boleh disesuaikan berdasarkan hasil testing.

\---

# 24\. Interaction Design

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

Animasi harus:

* cepat
* smooth
* tidak berlebihan
* tidak mengganggu checkout

Contoh:

* card image sedikit scale ketika hover
* button memiliki transition
* cart item update secara smooth
* order status memiliki transition ringan

\---

# 25\. Accessibility

Design harus memperhatikan:

* readable contrast
* keyboard navigation
* visible focus state
* semantic HTML
* accessible labels
* touch target yang cukup besar
* informasi tidak hanya dibedakan berdasarkan warna
* reduced-motion preference

\---

# 26\. Image Direction

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

\---

# 27\. Footer

Footer mengikuti mood visual reference.

Isi dapat meliputi:

* Enjua Cake's branding
* short description
* quick links
* customer information
* pickup information
* contact
* social media
* copyright

Footer dapat menggunakan dusty rose/mauve sebagai background section.

\---

# 28\. Empty States

Contoh:

### Cart Empty

Illustration/photo kecil +:

> Your cart is waiting for something sweet.

CTA:

`Explore Cakes`

Copy final dapat disesuaikan.

### No Product

Berikan informasi yang jelas dan CTA untuk kembali ke product listing.

\---

# 29\. Loading States

Gunakan skeleton/loading state yang mengikuti visual system.

Jangan menggunakan spinner besar untuk seluruh halaman jika hanya sebagian data yang sedang dimuat.

\---

# 30\. Error States

Error message harus:

* jelas
* tidak menyalahkan user
* memberikan langkah berikutnya

Contoh:

> Pembayaran belum terdeteksi. Silakan periksa kembali atau upload bukti pembayaran.

\---

# 31\. Design Consistency Rules

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

Jangan membuat setiap halaman memiliki gaya visual berbeda.

\---

# 32\. What Must NOT Be Done

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
* mengorbankan responsive behavior demi desktop appearance
* membuat mobile hanya sebagai versi desktop yang diperkecil

\---

# 33\. Design Acceptance Criteria

Design dianggap memenuhi requirement apabila:

* \[ ] Visual direction terasa warm, premium, handmade, dan bakery-oriented.
* \[ ] Produk menjadi focal point.
* \[ ] Homepage memiliki hierarchy yang jelas.
* \[ ] Typography memiliki hierarchy yang konsisten.
* \[ ] Color palette konsisten.
* \[ ] Product cards konsisten.
* \[ ] Ready Stock dan Pre-Order mudah dibedakan.
* \[ ] Cart mudah digunakan.
* \[ ] Checkout mudah dipahami.
* \[ ] Payment information jelas.
* \[ ] Order tracking mudah dipahami.
* \[ ] Admin dashboard konsisten dengan brand tetapi tetap functional.
* \[ ] Website usable pada mobile.
* \[ ] Website usable pada tablet/iPad.
* \[ ] Website usable pada laptop.
* \[ ] Website usable pada desktop.
* \[ ] Tidak ada accidental horizontal scrolling.
* \[ ] Tidak ada teks atau CTA yang terpotong.
* \[ ] Touch target nyaman digunakan.
* \[ ] Keyboard focus terlihat.
* \[ ] Reduced-motion diperhatikan.
* \[ ] Loading, empty, error, disabled, dan success state tersedia.
* \[ ] Design tidak bergantung pada hover.
* \[ ] Referensi visual digunakan sebagai inspirasi, bukan disalin.

\---

# 34\. Implementation Guidance for Claude Code

Sebelum melakukan coding:

1. Baca `PRD.md`.
2. Baca dokumen ini.
3. Baca/analisisi `design-reference/homepage-reference.jpeg`.
4. Identifikasi visual patterns dari reference.
5. Buat design system yang konsisten.
6. Pastikan functional requirements dari `PRD.md` tidak berubah.
7. Jangan membuat keputusan bisnis baru tanpa menandainya sebagai `Need Clarification`.
8. Jika ada konflik antara design dan functional requirements, prioritaskan functional correctness lalu cari solusi visual yang tetap sesuai design direction.
9. Pastikan responsive behavior dirancang sejak awal, bukan ditambahkan setelah desktop selesai.

\---

# 35\. Reference Mapping

Reference utama terutama digunakan untuk menginspirasi:

|Reference Element|Enjua Cake's Adaptation|
|-|-|
|Bakery hero|Enjua Cake's hero|
|Large product photography|Hero cake/product photography|
|Serif headline|Enjua editorial heading|
|Dusty rose background|Enjua accent palette|
|Cream background|Main background|
|Three category cards|Product/category sections|
|Editorial split section|About / brand story / promotional section|
|Soft rounded cards|Product/category cards|
|Organic section transitions|Selected homepage transitions|
|Warm footer|Enjua footer|

\---

# 36\. Final Design Principle

> \*\*Enjua Cake's should feel like a warm premium bakery brand first, and an e-commerce website second.\*\*

The interface must remain easy to use, but the visual experience should make the products feel desirable before the user even starts ordering.

