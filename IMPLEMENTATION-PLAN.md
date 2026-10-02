# Enjua Cake's — Technical Implementation Plan

**Document Version:** 1.1 (revisi TD-09: masa berlaku pelunasan DP terpisah dari reservasi awal)  
**Tanggal:** 2 Oktober 2026  
**Status:** Draft — **menunggu persetujuan user**. Belum ada kode yang boleh ditulis sebelum dokumen ini disetujui.  
**Sumber requirement:** `FINAL-REQUIREMENT-DECISIONS.md` (v1.2), `PRD.md` (v1.3), `PRD-Design.md` (v1.3), `design-reference/homepage-reference.jpeg`

---

# 0. Cara Membaca Dokumen Ini

Dokumen ini menerjemahkan requirement final menjadi rencana teknis. Dokumen ini **tidak** mengubah business rule. Jika ada bagian yang tampak bertentangan dengan PRD atau keputusan final, **PRD dan keputusan final yang berlaku**, dan bagian plan ini harus diperbaiki.

Setiap keputusan teknis yang **tidak** ditentukan oleh PRD ditulis dengan format:

> **TD-xx — Judul**
> - **Rekomendasi:** …
> - **Alasan:** …
> - **Trade-off:** …
> - **Dampak:** …

Status setiap TD adalah **Proposed** sampai disetujui. Daftar lengkap ada di §41.

Rujukan requirement memakai kode dari dokumen sumber: `FD-xx` (keputusan final), `BR-xx` (business rule PRD §38), `EC-xx` (edge case PRD §39), `§xx` (bagian PRD).

---

# 1. Ringkasan Sistem

Satu aplikasi web dengan dua permukaan:

1. **Website publik (customer, tanpa login):** katalog, detail produk, cart, checkout dengan pemilihan tanggal pickup, pembayaran (QRIS / Transfer Bank / Cash), halaman order sukses, dan tracking dengan nomor order + kode akses.
2. **Admin dashboard (login):** produk & kategori, order (termasuk Manual Order), pembayaran (verifikasi transfer, Cash, refund, Payment Exception), kapasitas pickup, Website Settings, akun admin.

Ditambah dua jalur non-interaktif:

3. **Webhook payment gateway** untuk konfirmasi QRIS.
4. **Job terjadwal** untuk memfinalisasi order yang kedaluwarsa.

Skala bisnis yang dirancang: kapasitas default 10 order per tanggal pickup, booking horizon 60 hari, satu lokasi pickup, beberapa akun admin. Volume ini kecil; arsitektur dioptimalkan untuk **kebenaran (correctness), keamanan, dan kemudahan perawatan**, bukan untuk throughput tinggi.

---

# 2. Project Architecture

## TD-01 — Modular monolith full-stack

- **Rekomendasi:** Satu codebase TypeScript full-stack (frontend + backend dalam satu aplikasi), dengan **business logic dipisahkan ke lapisan domain** yang tidak bergantung pada UI maupun framework.
- **Alasan:** Volume kecil, tim kecil, satu domain bisnis. Satu deployment mengurangi biaya operasional dan kompleksitas. PRD §42 meminta "business logic tidak ditaruh sembarangan di UI" — dipenuhi dengan lapisan domain terpisah, bukan dengan microservice.
- **Trade-off:** Scaling independen per komponen tidak tersedia (tidak dibutuhkan pada skala ini). Disiplin arsitektur internal harus dijaga lewat struktur folder dan aturan import.
- **Dampak:** Deployment sederhana; refactor ke service terpisah tetap mungkin karena domain sudah terisolasi.

## 2.1 Lapisan

```text
┌──────────────────────────────────────────────────────────────┐
│ Presentation                                                 │
│  - Public pages (SSR/RSC)      - Admin pages (SSR + forms)   │
│  - Client components (cart, date picker, upload, countdown)  │
├──────────────────────────────────────────────────────────────┤
│ Application / Services  (use-case, transaksi DB)             │
│  checkout · payments · orders · capacity · manualOrder ·     │
│  tracking · products · settings · auth · audit               │
├──────────────────────────────────────────────────────────────┤
│ Domain  (fungsi murni, tanpa I/O, 100% unit-tested)          │
│  pricing · dp · pickupDate · orderStateMachine ·             │
│  paymentStatus · overrides · orderNumber · whatsappMessage   │
├──────────────────────────────────────────────────────────────┤
│ Infrastructure                                               │
│  db (ORM + SQL) · payment provider adapters · storage ·      │
│  rate limiter · logger · clock (WIB)                         │
└──────────────────────────────────────────────────────────────┘
```

Aturan:
- **Domain** tidak boleh import framework, ORM, atau provider.
- **Services** adalah satu-satunya tempat yang membuka transaksi database dan memanggil domain + infrastructure.
- **Presentation** hanya memanggil services; tidak pernah menghitung harga/kapasitas/status sendiri (PRD §57: server adalah source of truth).

---

# 3. Recommended Technology Stack

## TD-02 — Stack inti

| Lapisan | Rekomendasi | Alasan utama |
|---|---|---|
| Bahasa | **TypeScript** (strict) | Satu bahasa untuk frontend, backend, dan validasi; tipe membantu menjaga enum status/payment konsisten. |
| Framework web | **Next.js (App Router)** | SSR/RSC untuk SEO halaman publik (PRD §43), route handler untuk webhook/API, Server Actions untuk form admin, optimasi gambar bawaan, ekosistem besar. |
| Database | **PostgreSQL** | Transaksi ACID, row-level locking (`SELECT … FOR UPDATE`) untuk reservasi kapasitas atomik (FD-05), unique constraint untuk idempotency, tipe `date`/`timestamptz` yang tepat. |
| ORM / query | **Drizzle ORM** + drizzle-kit (migrations) | Dekat dengan SQL sehingga locking, transaksi, dan query agregasi kapasitas mudah ditulis eksplisit; schema dalam TypeScript. |
| Validasi | **Zod** | Satu schema dipakai di client (UX) dan server (otoritatif) — PRD §37. |
| Styling | **Tailwind CSS** dengan design tokens | Mobile-first breakpoint utility, token warna/spacing terpusat sesuai PRD-Design §4, §31. |
| Komponen aksesibel | **Radix UI primitives** (via pola shadcn/ui, kode komponen dimiliki repo) | Dialog, menu, select, popover dengan keyboard & ARIA yang benar (PRD §44, Design §25). |
| Date picker | **react-day-picker** | Mendukung tanggal disabled + label alasan, navigasi keyboard. |
| State cart | **Zustand** + persist ke `localStorage` | Cart anonim tersimpan di browser (FD-31), ringan. |
| Auth admin | **Better Auth** (email + password, session di database) — lihat TD-10 | Session server-side, hashing modern, tanpa vendor eksternal. |
| Password hashing | **Argon2id** | Direkomendasikan OWASP Password Storage Cheat Sheet. |
| Nomor telepon | **libphonenumber-js** | Validasi & normalisasi nomor WhatsApp Indonesia (PRD §37). |
| Tanggal/waktu | Modul `clock` internal berbasis **date-fns** + **@date-fns/tz** (zona `Asia/Jakarta`) | Satu tempat untuk semua aturan WIB (FD-09). |
| Gambar | `next/image` + **sharp** | Resize/kompresi produk (PRD §42 performance). |
| Logging | **pino** (JSON terstruktur) | Log aman, mudah dikirim ke penyimpanan log. |
| Error monitoring | **Sentry** (opsional, direkomendasikan) | Visibilitas error production. |
| Testing | **Vitest**, **Playwright**, **@axe-core/playwright**, **Testcontainers** (PostgreSQL) | Lihat §35. |

- **Alasan keseluruhan:** Seluruh kebutuhan (SSR, API, webhook, admin, cron endpoint) tercakup oleh satu framework dan satu database relasional; tidak ada komponen yang dipilih hanya karena populer.
- **Trade-off:** Next.js memiliki kurva belajar (RSC, caching) dan pembaruan versi yang cepat; Drizzle lebih muda daripada Prisma. Alternatif yang setara: **Prisma** (DX sangat matang, tetapi locking memerlukan raw SQL), atau backend terpisah (mis. NestJS) + frontend terpisah (lebih banyak deployment).
- **Dampak:** Semua contoh struktur folder, testing, dan deployment di dokumen ini mengasumsikan stack ini. Mengganti satu komponen (mis. Drizzle → Prisma) tidak mengubah desain domain.

> Versi library spesifik dikunci saat Phase 1 (lockfile) dan tidak ditentukan di dokumen ini.

---

# 4. Folder Structure

## TD-03 — Struktur repo

```text
enjua-cake/
├── src/
│   ├── app/
│   │   ├── (public)/                 # layout publik: navbar, footer, floating WA
│   │   │   ├── page.tsx              # Beranda
│   │   │   ├── produk/page.tsx       # katalog + filter kategori
│   │   │   ├── produk/[slug]/page.tsx
│   │   │   ├── keranjang/page.tsx
│   │   │   ├── checkout/page.tsx
│   │   │   ├── pesanan/sukses/page.tsx
│   │   │   └── lacak/page.tsx        # input + hasil tracking, aksi pembayaran
│   │   ├── admin/
│   │   │   ├── login/page.tsx
│   │   │   └── (protected)/          # layout: guard session ADMIN
│   │   │       ├── page.tsx          # dashboard
│   │   │       ├── pesanan/…         # list, detail, manual order
│   │   │       ├── pembayaran/…      # verifikasi, exception, refund
│   │   │       ├── kapasitas/…
│   │   │       ├── produk/… · kategori/…
│   │   │       ├── pengaturan/…
│   │   │       └── akun/…
│   │   └── api/
│   │       ├── webhooks/payments/[provider]/route.ts
│   │       ├── cron/expire-reservations/route.ts
│   │       ├── tracking/route.ts     # verifikasi nomor order + token
│   │       ├── uploads/payment-proof/route.ts
│   │       └── admin/files/[id]/route.ts   # stream bukti bayar (auth)
│   ├── components/
│   │   ├── ui/                       # primitives aksesibel (button, dialog, badge…)
│   │   ├── public/                   # hero, product-card, category-card, cart…
│   │   └── admin/                    # tabel→card, form produk, transition control…
│   ├── server/
│   │   ├── domain/                   # fungsi murni (lihat §2.1)
│   │   ├── services/                 # use-case transaksional
│   │   ├── db/                       # schema, client, query helpers
│   │   ├── payments/                 # PaymentProvider interface + adapters
│   │   ├── storage/                  # public & private object storage
│   │   ├── auth/
│   │   ├── security/                 # rate limit, token hashing, headers
│   │   └── observability/            # logger, audit writer
│   ├── lib/
│   │   ├── validation/               # Zod schema bersama
│   │   ├── format/                   # Rupiah, tanggal WIB, label status
│   │   └── whatsapp.ts               # pembuat link wa.me
│   └── styles/                       # tokens & Tailwind config
├── drizzle/                          # file migration (dibuat Phase 1)
├── tests/
│   ├── unit/ · integration/ · e2e/ · fixtures/
├── docs/                             # setup, runbook, ADR singkat
└── (PRD.md, PRD-Design.md, FINAL-REQUIREMENT-DECISIONS.md, IMPLEMENTATION-PLAN.md)
```

- **Alasan:** Route publik berbahasa Indonesia sesuai FD-91 dan navigasi FD-92; `server/` memisahkan kode yang tidak boleh terkirim ke browser.
- **Trade-off:** Nama route final dapat disesuaikan; route group `(public)` dan `(protected)` adalah konvensi Next.js.
- **Dampak:** Kode server dipaksa server-only (paket `server-only`) sehingga secret dan business logic tidak bocor ke bundle client (PRD §40).

---

# 5. Frontend Architecture

## 5.1 Rendering

| Halaman | Strategi | Catatan |
|---|---|---|
| Beranda, katalog, detail produk | Server rendered, cache dengan revalidasi saat admin mengubah produk/kategori/settings | SEO (PRD §43), cepat di mobile. |
| Keranjang | Client component (data dari `localStorage`) + validasi server saat dibuka (harga terbaru, Sold Out, nonaktif) | FD-31, FD-32, EC-07, EC-15. |
| Checkout | Server rendered shell + client form; ketersediaan tanggal diambil dari server | Tanggal tidak tersedia + alasan (PRD §7.1). |
| Order sukses, Lacak | Dinamis, tanpa cache | Data privat. |
| Admin | Dinamis, tanpa cache, `noindex` | — |

## 5.2 Prinsip

- **Mobile-first** (PRD §35): komponen didesain dari 360px ke atas.
- **Design tokens** dari PRD-Design §4 sebagai CSS variables; nilai warna final disesuaikan untuk kontras WCAG AA (FD-101, FD-102).
- **Bahasa Indonesia** untuk semua label; badge tetap "Ready Stock", "Pre-Order", "Sold Out" (FD-117). Semua teks UI dikumpulkan dalam satu modul copy untuk konsistensi.
- **Tidak ada search** dan **tidak ada variant** (FD-94, FD-30).
- Tidak ada fungsi penting yang bergantung pada hover (PRD §35.3).

## 5.3 Komponen kunci

| Komponen | Perilaku penting |
|---|---|
| `ProductCard` | Badge tipe + Sold Out (teks, bukan hanya warna), harga coret bila `sale_price`, CTA nonaktif saat Sold Out. |
| `CategoryCards` | Jumlah kartu mengikuti kategori aktif dari database (FD-23). |
| `CartDrawer/Page` | Quantity dibatasi `max_quantity_per_order`; info Pre-Order & "Cash tidak tersedia" bila ada Pre-Order; **tanpa** pemilihan tanggal (FD-33). |
| `PickupDatePicker` | Data ketersediaan dari server; tanggal disabled dengan alasan yang dapat dibaca screen reader & disentuh (bukan tooltip hover). |
| `PaymentMethodSelector` | Cash disabled + alasan bila ada Pre-Order (FD-40); opsi DP hanya untuk QRIS/Transfer. |
| `QrisPanel` | QR, nominal, countdown ke `reservation_expires_at` order untuk pembayaran awal (tidak di-reset — FD-120, DI-08) atau ke `expires_at` transaksi untuk pelunasan DP (TD-09), tombol "Buat QRIS baru" setelah gagal (FD-112), polling status. |
| `TransferPanel` | Instruksi rekening dari settings, upload bukti, state ditolak + re-upload (FD-106). |
| `StatusTimeline` | Order status & payment status terpisah (BR-11), label + ikon + state. |
| `WhatsAppButton` | Link `wa.me` dengan pesan kontekstual tanpa token (FD-77). |
| Admin `TransitionControl` | Hanya menampilkan transition yang diizinkan dari status saat ini (FD-116). |
| Admin `ResponsiveTable` | Tabel di desktop, card list di mobile (PRD §35.2, Design §20). |

---

# 6. Backend / API Architecture

## TD-04 — Server Actions untuk mutasi UI, Route Handlers untuk integrasi

- **Rekomendasi:**
  - Mutasi dari UI (checkout, upload bukti, aksi admin) memakai **Server Actions** yang memanggil services.
  - **Route Handlers** untuk: webhook payment, endpoint cron, streaming file privat, polling status pembayaran, dan verifikasi tracking.
- **Alasan:** Server Actions memiliki proteksi bawaan berupa pemeriksaan Origin terhadap Host (mitigasi CSRF) dan mengurangi boilerplate; webhook dan cron membutuhkan endpoint HTTP eksplisit.
- **Trade-off:** Server Actions terikat pada Next.js; tidak ada REST API publik yang terdokumentasi (tidak dibutuhkan V1).
- **Dampak:** Seluruh validasi dan otorisasi tetap terjadi di service, sehingga jika suatu saat dibutuhkan REST API (mis. aplikasi mobile), service yang sama dapat dipakai ulang.

## 6.1 Endpoint & action utama

| Jenis | Nama | Auth | Fungsi |
|---|---|---|---|
| Action | `validateCart` | publik | Kembalikan harga terbaru, item Sold Out/nonaktif, batas quantity. |
| Query | `getPickupAvailability(cart)` | publik | Daftar tanggal dalam horizon + status & alasan per tanggal. |
| Action | `placeOrder` | publik + rate limit + idempotency key | Checkout lengkap (§11). |
| Action | `createQrisTransaction(orderRef)` | token tracking | Retry QRIS / pelunasan DP. |
| Action | `createTransferTransaction(orderRef)` | token tracking | Pelunasan DP via transfer. |
| Route | `POST /api/uploads/payment-proof` | token tracking | Upload bukti transfer. |
| Route | `POST /api/tracking` | publik + rate limit | Verifikasi nomor order + token → session tracking. |
| Route | `GET /api/payments/status` | session tracking | Polling status untuk QrisPanel. |
| Route | `POST /api/webhooks/payments/[provider]` | signature provider | Konfirmasi pembayaran (§16). |
| Route | `POST /api/cron/expire-reservations` | `CRON_SECRET` | Finalisasi expiry (§13.4). |
| Route | `GET /api/admin/files/[id]` | session ADMIN | Stream bukti pembayaran privat. |
| Actions | admin: produk, kategori, order transition, cancel, manual order, verifikasi bukti, tandai Cash, refund, exception resolution, kapasitas, settings, ganti password, regenerate token | session ADMIN | — |

## 6.2 Kontrak error

Service melempar **domain error bertipe** (mis. `DATE_FULL`, `PREORDER_MIN_NOT_MET`, `CASH_NOT_ALLOWED_FOR_PREORDER`, `PRODUCT_SOLD_OUT`, `RESERVATION_EXPIRED`, `INVALID_TRANSITION`). Presentation memetakan kode ke pesan Bahasa Indonesia yang ramah (PRD §36, §52; Design §30). Detail teknis tidak pernah dikirim ke client.

---

# 7. Database Architecture / Schema

## TD-05 — PostgreSQL, uang integer, waktu UTC + tanggal bisnis WIB

- **Rekomendasi:**
  - Uang: `integer` Rupiah (FD-43). Batas `integer` PostgreSQL ±2,1 miliar — lebih dari cukup per order.
  - Timestamp: `timestamptz` (disimpan UTC).
  - Tanggal bisnis (tanggal pickup, tanggal order efektif): `date` yang dihitung di zona **Asia/Jakarta** oleh modul `clock`.
  - Enum status sebagai PostgreSQL enum atau `text` + `CHECK`.
  - Foreign key + `ON DELETE RESTRICT` untuk data transaksi; produk tidak di-hard delete bila pernah dipesan (PRD §31.1).
- **Alasan:** Menghindari error pembulatan, ambiguitas zona waktu, dan kehilangan histori.
- **Trade-off:** Konversi WIB harus selalu lewat satu modul; developer tidak boleh memakai `new Date()` langsung untuk logika bisnis.
- **Dampak:** Seluruh aturan cutoff, horizon, dan minimum Pre-Order dapat dites deterministik dengan clock palsu.

## 7.1 Tabel (konseptual — migration dibuat di Phase 1 setelah plan disetujui)

Field mengikuti PRD §41; penambahan teknis ditandai **(T)**.

**admins** — id, name, email (unique), password_hash, role (`ADMIN`), is_active **(T)**, created_at, updated_at. Tabel session/account mengikuti library auth (TD-10).

**categories** — id, name, slug **(T)**, description, image_key, sort_order, is_active, timestamps.

**products** — id, category_id → categories, name, slug **(T, unique)**, description, price, sale_price (nullable, `CHECK sale_price < price`), product_type, minimum_preorder_days (`CHECK` wajib ≥1 bila `PRE_ORDER`, null bila `READY_STOCK`), is_featured, availability, is_active, max_quantity_per_order (nullable, `CHECK > 0`), timestamps.

**product_images** — id, product_id, storage_key, alt_text, is_main, sort_order, created_at. Partial unique index: satu `is_main = true` per produk.

**pickup_dates** — date (PK), capacity_override (nullable), is_blocked, block_reason, updated_by, timestamps. Baris dibuat on-demand (upsert) saat dibutuhkan untuk locking atau saat admin mengatur tanggal.

**orders** — id, order_number (unique), tracking_token_hash (unique), source (`WEBSITE`/`MANUAL`), created_by_admin_id (nullable), customer_name, customer_phone (E.164), notes, order_date_effective **(T)**, pickup_date, subtotal, discount_total, grand_total, dp_amount, paid_amount, remaining_amount, payment_method, payment_option, order_status, payment_status, reservation_expires_at (null untuk Cash), cancellation_reason, cancelled_by (admin id / `SYSTEM`), cancelled_at, idempotency_key **(T, unique, nullable)**, timestamps.
Index: `(pickup_date, order_status)`, `(order_status, reservation_expires_at)`.

**order_items** — id, order_id, product_id, product_name_snapshot, product_type_snapshot, minimum_preorder_days_snapshot, unit_price_snapshot, sale_price_snapshot, effective_unit_price **(T)**, quantity (`CHECK > 0`), line_subtotal.

**payment_transactions** — id, order_id, purpose (`DP`/`FULL`/`REMAINING`), method (`QRIS`/`BANK_TRANSFER`/`CASH`), amount, status, provider, provider_reference (unique per provider, nullable), qr_string / qr_payload **(T)**, expires_at, paid_at, verified_by, is_exception, timestamps.

**payment_proofs** — id, payment_transaction_id, order_id, storage_key (private), mime_type, size_bytes, sha256 **(T)**, uploaded_at, verification_status (`PENDING`/`APPROVED`/`REJECTED`), rejection_reason, verified_by, verified_at.

**payment_exceptions** **(T, mewujudkan FD-107/FD-118)** — id, payment_transaction_id, order_id, kind (`LATE_PAYMENT_AFTER_CANCEL`, `AMOUNT_MISMATCH`, `DUPLICATE_PAYMENT`), status (`OPEN`/`RESOLVED`), resolution (`REFUNDED`/`RESOLVED_MANUALLY`), resolution_note, resolved_by, resolved_at, created_at.

**refunds** — id, order_id, payment_transaction_id (nullable), amount, status, reason, refunded_at, recorded_by, created_at.

**order_overrides** **(T, mewujudkan FD-119)** — id, order_id, override_type (`MIN_PREORDER_DAYS`/`BOOKING_HORIZON`/`PICKUP_CUTOFF`/`DAILY_CAPACITY`), value_before (jsonb), value_after (jsonb), reason (not null), admin_id (not null), created_at (not null).

**audit_logs** — id, entity_type, entity_id, event_type, old_value (jsonb), new_value (jsonb), reason, actor_type (`ADMIN`/`SYSTEM`/`CUSTOMER`), actor_admin_id, request_id **(T)**, created_at. Append-only.

**payment_webhook_events** — id, provider, provider_event_key (unique per provider), payload_hash, signature_valid, processing_result, received_at, processed_at.

**settings** — key (PK), value (jsonb), updated_by, updated_at. Divalidasi dengan schema Zod per key (§27).

**idempotency / rate limit** **(T)** — lihat §32 (idempotency) dan §30 (rate limit).

## 7.2 Integritas yang dijaga database

- Unique: `order_number`, `tracking_token_hash`, `(provider, provider_reference)`, `(provider, provider_event_key)`, `idempotency_key`.
- `CHECK` untuk nilai uang ≥ 0, quantity > 0, aturan `sale_price` dan `minimum_preorder_days`.
- Transisi status **tidak** dijaga trigger database; dijaga satu fungsi service + test (lebih mudah dibaca dan dites). Lihat TD-14.

---

# 8. Authentication & Admin Authorization

## TD-10 — Library auth

- **Rekomendasi:** **Better Auth** dengan email + password, session tersimpan di PostgreSQL, cookie `HttpOnly`, `Secure`, `SameSite=Lax`. Pendaftaran publik **dinonaktifkan**; akun admin dibuat oleh admin lain dari dashboard atau lewat perintah seed/CLI saat setup.
- **Alasan:** Session server-side mudah dicabut (logout, nonaktifkan admin), tanpa ketergantungan layanan eksternal; mendukung ganti password (FD-84).
- **Trade-off:** Menambah dependency auth; alternatif: modul session kecil buatan sendiri (lebih sedikit dependency, tetapi lebih banyak kode keamanan yang harus dirawat) atau Auth.js (credentials provider kurang dianjurkan untuk session database).
- **Dampak:** Semua route `/admin/(protected)` dan admin actions memeriksa session di server (PRD §29). Tidak ada RBAC selain `ADMIN` (FD-81).

## 8.1 Aturan

- Hash password **Argon2id**; panjang minimum password ditetapkan saat implementasi (rekomendasi ≥ 12 karakter).
- Rate limit login per IP + per email; pesan error generik.
- Session idle timeout dan absolute timeout (rekomendasi 8 jam / 7 hari, dapat disesuaikan).
- Ganti password membatalkan session lain milik admin tersebut.
- **Forgot password publik tidak dibuat** (FD-85). Pemulihan: admin lain me-reset password, atau perintah CLI di server.
- Setiap admin action menulis `audit_logs` dengan `actor_admin_id`.

---

# 9. Product Architecture

- Produk & kategori dikelola admin (PRD §31). Slug dibuat otomatis dari nama, unik, dapat diedit.
- **Visibilitas** (FD-27): query publik hanya `is_active = true` (produk) dan kategori aktif. Produk `SOLD_OUT` tetap tampil dengan CTA nonaktif.
- **Harga efektif** = `sale_price ?? price`; persentase diskon dihitung untuk tampilan saja (FD-25).
- **Featured** (FD-24): `is_featured = true` → section Featured Products homepage.
- **Hapus produk**: bila pernah dipesan → tidak boleh hard delete; UI menawarkan nonaktifkan (PRD §31.1).
- **Cache invalidation**: setiap perubahan produk/kategori/gambar memicu revalidasi halaman publik terkait.

---

# 10. Cart Architecture

- Cart disimpan di `localStorage` melalui Zustand persist (FD-31). Isi: `productId`, `quantity`, dan snapshot tampilan (nama, harga, gambar) yang **hanya untuk render cepat**.
- Saat halaman cart/checkout dibuka, client memanggil `validateCart`; server mengembalikan harga terbaru, status Sold Out/nonaktif, dan batas quantity. UI memperbarui tampilan dan memberi peringatan (EC-07, EC-08, EC-15).
- Total di cart adalah **estimasi**; total final selalu dihitung server saat `placeOrder` (FD-32, PRD §37).
- Cart **tidak** dikosongkan sebelum order berhasil dibuat (PRD §36: tidak menghapus cart secara tidak sengaja). Setelah sukses, cart dikosongkan.
- Akses `localStorage` dibungkus try/catch; jika tidak tersedia (mode privat tertentu), cart tetap berfungsi di memori.

---

# 11. Checkout Architecture

## 11.1 Alur `placeOrder`

```text
Client (form tervalidasi Zod)  ──► placeOrder(input, idempotencyKey)
  1. Rate limit + validasi Zod di server
  2. Normalisasi nomor WhatsApp (E.164)
  3. Muat produk dari DB → cek aktif, AVAILABLE, max_quantity_per_order
  4. Hitung harga, diskon, total (domain/pricing)
  5. Tentukan isi order: ada Pre-Order? → aturan metode (FD-40/41), DP (FD-42, FD-39)
  6. Hitung tanggal order efektif & tanggal paling awal (domain/pickupDate, FD-108)
  7. BEGIN TRANSACTION
       a. upsert + SELECT … FOR UPDATE baris pickup_dates[tanggal]   ← kunci per tanggal
       b. tolak bila is_blocked, di luar horizon, < tanggal paling awal
       c. hitung slot terpakai (order aktif, lihat §13.2) vs kapasitas efektif
       d. buat order (order_number unik, tracking token → simpan hash)
       e. buat order_items (snapshot)
       f. QRIS/Transfer: set reservation_expires_at; buat payment_transaction (DP/FULL)
          Cash: reservation_expires_at = null, payment_status UNPAID
       g. audit_logs: "Pesanan Baru oleh System"
     COMMIT
  8. Di luar transaksi DB: QRIS → minta QR ke provider (§16). Jika provider gagal:
       transaksi = FAILED, customer dapat "Buat QRIS baru" selama reservasi valid (FD-112),
       pesan error jelas (EC-13).
  9. Kembalikan: order_number + token plaintext (sekali) → halaman sukses
```

## 11.2 Catatan

- Langkah 7 memastikan dua customer tidak mendapat slot terakhir bersamaan (EC-01) — detail di §13.
- Token tracking plaintext **hanya** dikembalikan sekali ke halaman sukses; server hanya menyimpan hash (FD-67, FD-68).
- `idempotencyKey` (UUID yang dibuat client per sesi checkout) mencegah double submission membuat dua order (PRD §36). Request kedua dengan key yang sama mengembalikan hasil order pertama — namun **tanpa** token plaintext (karena tidak disimpan), sehingga client menyimpan respons pertama di memori; lihat TD-15.
- Halaman sukses menampilkan nomor order, kode akses, tombol copy, link tracking, tombol WhatsApp, dan langkah pembayaran (FD-71).

---

# 12. Ready Stock & Pre-Order Logic

Diimplementasikan sebagai fungsi murni di `domain/pickupDate` dengan input `now` (dari clock), konfigurasi, dan item cart.

```text
cutoff            = settings.pickup_cutoff            (default 15:00 WIB)
nowWIB            = clock.now() di Asia/Jakarta
effectiveDate     = nowWIB.time < cutoff ? nowWIB.date : nowWIB.date + 1 hari     (FD-108)
maxPreorderDays   = max(minimum_preorder_days item Pre-Order)  atau 0              (FD-18)
earliestDate      = effectiveDate + maxPreorderDays                                 (FD-17, FD-19, FD-21)
latestDate        = nowWIB.date + booking_horizon_days  (default 60)                (FD-08)
```

Untuk setiap tanggal `d` dalam `[nowWIB.date, latestDate]`, status:

| Urutan cek | Kondisi | Alasan yang ditampilkan |
|---|---|---|
| 1 | `d < earliestDate` & cart ada Pre-Order | "Belum memenuhi minimum Pre-Order (N hari)" |
| 2 | `d < earliestDate` & Ready Stock-only (cutoff lewat) | "Batas pemesanan hari ini sudah lewat" |
| 3 | `is_blocked` | "Tutup" |
| 4 | slot terpakai ≥ kapasitas efektif | "Penuh — kapasitas sudah tercapai" |
| 5 | lainnya | tersedia (+ sisa slot opsional) |

- Fungsi yang sama dipakai untuk **menampilkan** ketersediaan dan untuk **memvalidasi ulang** di dalam transaksi `placeOrder` (EC-17: waktu server yang dipakai, bukan waktu browser).
- Indonesia/WIB tidak memakai daylight saving, sehingga offset tetap UTC+7; tetap memakai library zona waktu agar eksplisit.
- Unit test wajib mencakup: tepat di batas cutoff (14:59:59 vs 15:00:00), pergantian bulan/tahun, cart campuran, horizon hari ke-60/61.

---

# 13. Pickup Capacity & Reservation Logic

## TD-06 — Kunci baris per tanggal + hitung order aktif (lazy expiry)

- **Rekomendasi:**
  1. Setiap pembuatan order (website atau manual) mengunci baris `pickup_dates` untuk tanggal tersebut dengan `SELECT … FOR UPDATE` di dalam transaksi.
  2. Slot terpakai **dihitung** saat itu dari tabel `orders`, bukan disimpan sebagai counter.
  3. Order dihitung "aktif" bila `order_status ≠ Dibatalkan` **dan** bukan reservasi yang sudah lewat waktu (lihat 13.2). Dengan begitu slot dari reservasi kedaluwarsa langsung tersedia meskipun job finalisasi belum berjalan.
- **Alasan:** Locking per tanggal men-serialisasi hanya order untuk tanggal yang sama (kontensi sangat rendah pada skala ≤ belasan order per tanggal). Menghitung ulang menghindari counter yang tidak sinkron. Lazy expiry membuat kebenaran kapasitas **tidak bergantung** pada ketepatan waktu cron.
- **Trade-off:** Query hitung per checkout (murah dengan index `(pickup_date, order_status)`). Alternatif: counter `reserved_count` yang di-increment/decrement — lebih cepat tetapi rawan drift saat expiry/cancel gagal di tengah jalan; alternatif lain: isolation level `SERIALIZABLE` dengan retry — benar tetapi lebih sulit dioperasikan.
- **Dampak:** EC-01 terpenuhi; perubahan kapasitas/blokir tidak membatalkan order yang ada (EC-14) karena hanya memengaruhi order baru.

## 13.1 Kapasitas efektif

`capacity_override ?? settings.default_capacity` (default 10; FD-02, FD-07).

## 13.2 Definisi order aktif (menggunakan slot)

Order menggunakan slot bila **tidak** Dibatalkan dan salah satu:
- `payment_method = CASH` (tidak pernah expired karena payment — FD-15, FD-113); atau
- sudah memiliki pembayaran terkonfirmasi (DP/penuh); atau
- payment `WAITING_VERIFICATION` (bukti diunggah sebelum batas waktu — FD-120); atau
- `reservation_expires_at > now()` (masih dalam masa reservasi).

Order yang `WAITING_PAYMENT` dengan `reservation_expires_at ≤ now()` **tidak** dihitung (secara logis sudah expired), lalu difinalisasi oleh mekanisme 13.4.

## 13.3 Masa reservasi

- `reservation_expires_at = created_at + durasi` (QRIS default 30 menit — FD-12; Transfer default 2 jam — FD-13). Disimpan per order dan **tidak pernah di-reset** (FD-120).
- Retry QRIS tidak mengubah `reservation_expires_at` (DI-08).
- QR yang diminta dari provider diberi masa berlaku yang **berakhir sebelum** `reservation_expires_at` (lihat TD-08) agar customer tidak dapat membayar setelah slot dilepas.

## 13.4 Finalisasi expiry

## TD-07 — Lazy check + sweeper terjadwal

- **Rekomendasi:** Fungsi `expireIfDue(orderId)` (idempotent, dalam transaksi dengan lock baris order) dipanggil:
  - saat halaman tracking/pembayaran dibuka,
  - saat webhook atau upload bukti diterima,
  - saat admin membuka order,
  - oleh **sweeper** terjadwal (rekomendasi tiap 1–5 menit) via `POST /api/cron/expire-reservations` yang dilindungi `CRON_SECRET`.
  Finalisasi: payment transaction `EXPIRED`, order **Dibatalkan**, `cancellation_reason = PAYMENT_EXPIRED`, `cancelled_by = SYSTEM`, audit log (FD-14, FD-56).
- **Alasan:** Kapasitas sudah benar lewat lazy expiry (13.2); sweeper hanya merapikan status agar terlihat benar di dashboard.
- **Trade-off:** Ada jeda singkat di mana status order di database masih "Pesanan Baru" padahal logis sudah expired; semua tampilan memakai fungsi status yang sama sehingga customer/admin tetap melihat status yang benar.
- **Dampak:** Platform hosting tidak harus mendukung cron per menit untuk menjaga kebenaran; cukup untuk kerapian.

Sweeper yang sama juga memanggil `expirePaymentTransactionIfDue` untuk transaksi **pelunasan DP** yang lewat `expires_at`-nya. Jalur ini terpisah dari `expireIfDue` order: hanya status transaksi yang berubah, order tetap aktif (TD-09, DI-01).

## 13.5 Override kapasitas Manual Order

Override `DAILY_CAPACITY` (FD-119) melewati langkah cek 4 di dalam transaksi yang **sama** (lock tetap diambil), lalu mencatat `order_overrides` dengan nilai sebelum (mis. `{capacity:10, used:10}`) dan sesudah (`{used:11}`). Tanggal tersebut tetap tampil penuh untuk order website.

---

# 14. Payment Architecture

## TD-08 — Adapter provider + rekomendasi gateway

- **Rekomendasi arsitektur (FD-49):** Interface `PaymentProvider`:

```text
createQris({ transactionId, amount, expiresAt }) → { providerReference, qrString, expiresAt }
parseAndVerifyWebhook(request) → { providerEventKey, providerReference, status, amount, paidAt } | invalid
getTransactionStatus(providerReference) → { status, amount, paidAt }
```

  Implementasi: `MockProvider` (development & test, dapat mensimulasikan webhook), lalu satu provider production. Business logic hanya bergantung pada interface.

- **Rekomendasi provider (FD-48):** Kandidat utama **Midtrans** (Core API, `payment_type: qris`), alternatif setara **Xendit** (QR Codes API). Keduanya mendukung QRIS dinamis, sandbox, dan notifikasi HTTP dengan mekanisme verifikasi:
  - Midtrans: `signature_key` = SHA-512 dari `order_id + status_code + gross_amount + server key`, ditambah pengecekan status lewat API status.
  - Xendit: header `x-callback-token` yang dicocokkan dengan token di dashboard.

| Kriteria (PRD §16) | Midtrans | Xendit |
|---|---|---|
| QRIS dinamis | Ya | Ya |
| Sandbox | Ya | Ya (test mode) |
| Webhook + verifikasi | Signature SHA-512 + status API | Callback token + status API |
| Beberapa transaksi per order (DP + pelunasan) | Ya (order_id unik per transaksi) | Ya (reference unik per QR) |
| Biaya | Mengikuti MDR QRIS + kebijakan provider | Mengikuti MDR QRIS + kebijakan provider |
| Onboarding | KYC merchant | KYC merchant |

- **Alasan:** Keduanya provider Indonesia yang mapan dengan dokumentasi publik; adapter membuat pergantian provider hanya menyentuh satu modul.
- **Trade-off:** Biaya, persyaratan dokumen merchant (perorangan vs badan usaha), dan waktu aktivasi production **harus diverifikasi langsung** ke provider pada saat onboarding — angka biaya tidak dicantumkan di sini karena dapat berubah. Pilihan final sebaiknya diambil setelah klien mengecek kelayakan onboarding di kedua provider.
- **Dampak:** Development & test dapat berjalan penuh dengan `MockProvider` sebelum merchant account tersedia (GL-10 bukan blocker).

**QR expiry buffer:** Untuk pembayaran awal (DP/FULL), QR dibuat dengan masa berlaku `min(provider_max, reservation_expires_at − buffer)`; rekomendasi buffer **2 menit**, dapat dikonfigurasi. Tujuannya mengurangi kasus pembayaran sukses yang webhook-nya baru tiba setelah slot dilepas. Untuk **pelunasan DP**, QR mengikuti `expires_at` transaksi pelunasan itu sendiri (TD-09), karena tidak ada slot yang dipertaruhkan.

## 14.1 Model data pembayaran

- Satu order → banyak `payment_transactions` (DP, FULL, REMAINING; retry QRIS membuat transaksi baru).
- `paid_amount` order = jumlah transaksi berstatus sukses yang **bukan** exception (FD-112).
- `payment_status` order **diturunkan** dari transaksi + refund oleh satu fungsi domain dan disimpan (denormalisasi) di transaksi DB yang sama dengan perubahan transaksi (§20.2).
- Biaya gateway tidak ditambahkan ke tagihan customer (FD-47).

---

# 15. DP / Full Payment Flow

- `dp_amount = ceil(grand_total × 0.5)`; `remaining = grand_total − dp_amount` — integer, dihitung domain (FD-44). Contoh tes: 125.555 → 62.778 / 62.777.
- **DP** (QRIS/Transfer saja — FD-42): transaksi pertama `purpose = DP`. Setelah sukses → payment `PARTIALLY_PAID`, order **Dikonfirmasi** (QRIS otomatis; Transfer setelah admin approve).
- **Pelunasan** (FD-46, FD-109): dari halaman tracking, customer memilih QRIS atau Transfer → transaksi `purpose = REMAINING` sebesar sisa. **Cash tidak ditawarkan** untuk pelunasan.
  - Masa berlaku transaksi pelunasan adalah **parameter tersendiri** (TD-09), terpisah dari reservasi awal. `expires_at` transaksi pelunasan = waktu dibuat + durasi pelunasan metode terkait; tidak memakai dan tidak mengubah `reservation_expires_at` order.
  - Transaksi pelunasan yang kedaluwarsa hanya membuat transaksi itu `EXPIRED`; order **tetap aktif** dan tidak dibatalkan (DI-01). Customer dapat membuat transaksi pelunasan baru.
  - Kedaluwarsa transaksi pelunasan difinalisasi oleh fungsi terpisah `expirePaymentTransactionIfDue(transactionId)` (lazy + sweeper yang sama dengan §13.4), yang **tidak pernah** menyentuh order status maupun kapasitas.
- **Penuh**: transaksi `purpose = FULL`; sukses → `PAID`.
- **Guard Selesai** (DI-09): transition Siap Diambil → Selesai ditolak bila payment ≠ `PAID` (EC-23).

## TD-09 — Masa berlaku transaksi pelunasan DP *(FINAL setelah technical review)*

> Masa berlaku transaksi pelunasan DP merupakan **parameter yang terpisah dari reservation awal**. Jika transaksi pelunasan expired, **hanya transaksi pembayaran tersebut** yang berstatus `EXPIRED` dan **order tetap aktif**. Durasi default transaksi pelunasan dapat menggunakan nilai yang sama dengan reservation untuk V1, tetapi implementasi harus memungkinkan **konfigurasi terpisah** di masa depan tanpa mengubah business rule order.

- **Rekomendasi implementasi:**
  - Dua key konfigurasi tersendiri: `qris_remaining_payment_minutes` dan `transfer_remaining_payment_minutes` (§27), **terpisah** dari `qris_reservation_minutes` / `transfer_reservation_minutes`.
  - Default V1 bernilai sama dengan reservation (QRIS 30 menit, Transfer 120 menit).
  - Kode pelunasan hanya membaca key pelunasan; kode reservasi hanya membaca key reservasi. Tidak ada fungsi yang memakai satu nilai untuk keduanya.
  - Expiry pelunasan hanya mengubah status transaksi (`EXPIRED`); tidak memicu pembatalan order, tidak melepas slot, tidak mengubah `reservation_expires_at`.
- **Alasan:** Reservasi awal melindungi slot kapasitas (FD-12, FD-13, FD-14), sedangkan pelunasan terjadi setelah slot aman (DI-01). Memisahkan parameter mencegah perubahan salah satu aturan ikut mengubah yang lain.
- **Trade-off:** Ada dua pasang konfigurasi yang nilainya sama di V1; sedikit lebih banyak konfigurasi untuk dirawat. Customer yang terlambat harus membuat transaksi pelunasan baru (tanpa batas jumlah percobaan).
- **Dampak:** Tidak ada perubahan business rule order. Durasi pelunasan dapat diubah di masa depan cukup dengan mengganti nilai konfigurasi, tanpa menyentuh logika reservasi, kapasitas, atau state machine order.

---

# 16. QRIS Webhook Flow

```text
Provider ──POST──► /api/webhooks/payments/[provider]
  1. Baca raw body; verifikasi signature/token (gagal → 401, catat event signature_valid=false)
  2. Defense in depth: panggil getTransactionStatus(providerReference) ke API provider
  3. INSERT payment_webhook_events (provider, provider_event_key) — unique
       → konflik = event duplikat → 200 OK tanpa proses ulang (EC-05)
  4. BEGIN TRANSACTION; lock payment_transaction, lalu order (urutan lock tetap)
  5. Cocokkan amount dengan transaksi (EC-06) → beda: tandai exception AMOUNT_MISMATCH
  6. Jalankan expireIfDue(order)
  7. Jika order Dibatalkan/expired:
        transaksi = sukses + is_exception = true
        payment_exceptions (LATE_PAYMENT_AFTER_CANCEL, OPEN)        ← FD-107, FD-118
        order TIDAK diubah (tidak ada reinstate)
     Jika transaksi sudah sukses sebelumnya: no-op (idempotent)
     Jika transaksi pending & order aktif:
        transaksi = sukses, paid_at
        hitung ulang paid/remaining/payment_status
        jika order Pesanan Baru → Dikonfirmasi oleh SYSTEM (FD-111, DI-04)
     Jika status provider = gagal/expired: transaksi FAILED/EXPIRED (order tetap; retry FD-112)
  8. audit_logs; COMMIT; tandai event processed
  9. Response 200 (provider retry hanya untuk non-2xx)
```

- Konfirmasi QRIS **hanya** lewat jalur ini; tidak ada tombol konfirmasi QRIS manual di admin (FD-111).
- Browser yang tertutup tidak memengaruhi apa pun (EC-04).
- Respons cepat; pekerjaan berat tidak diperlukan sehingga tidak perlu antrean pada skala ini.

---

# 17. Bank Transfer Proof Flow

```text
Checkout (Transfer) → transaksi WAITING_PAYMENT, expires_at = reservation_expires_at
   │
   ├─ Customer upload bukti (dari halaman sukses/tracking; perlu token)
   │     server: expireIfDue → jika sudah lewat: tolak upload, tampilkan "Batas waktu habis"
   │     validasi file (§24) → simpan privat → payment_proofs PENDING
   │     transaksi → WAITING_VERIFICATION  (order tidak auto-cancel selama ini — FD-120)
   │
   ├─ Admin APPROVE → transaksi sukses, verified_by; payment PARTIALLY_PAID/PAID;
   │                  order Pesanan Baru → Dikonfirmasi (admin)
   │
   └─ Admin REJECT (alasan wajib) → proof REJECTED; transaksi → WAITING_PAYMENT (FD-106)
         timer TIDAK di-reset (FD-120):
           now < reservation_expires_at → customer dapat upload bukti baru
           now ≥ reservation_expires_at → langsung expire: EXPIRED + Dibatalkan + slot lepas
```

- Untuk pelunasan via transfer, alurnya sama, dengan perbedaan:
  - batas waktu yang dipakai adalah `expires_at` transaksi pelunasan (durasi pelunasan, TD-09), **bukan** `reservation_expires_at`;
  - penolakan bukti mengembalikan transaksi ke `WAITING_PAYMENT` tanpa mereset `expires_at` transaksi (FD-106);
  - bila `expires_at` lewat, **hanya** transaksi pelunasan yang `EXPIRED`; order tetap aktif, tidak Dibatalkan, slot tidak dilepas (DI-01).
- Order dari WhatsApp (bukti dikirim via WA): admin mengunggah bukti atas nama order dari dashboard lalu memverifikasi (PRD §18).

---

# 18. Cash Flow

- Hanya tersedia bila seluruh item Ready Stock (FD-40, FD-41); divalidasi di server walau UI sudah menonaktifkan (EC-16).
- Order dibuat `UNPAID`, tanpa `reservation_expires_at`, tidak pernah expired karena payment (FD-15, FD-113).
- Admin menerima → Dikonfirmasi → Diproses → Siap Diambil.
- Saat pickup: admin "Tandai Lunas (Cash)" → transaksi `CASH`/`FULL` sukses sebesar total, `verified_by`, audit (PRD §20). Lalu Selesai.
- No-show: admin membatalkan manual dengan alasan (FD-113).
- Cash tidak tersedia untuk pelunasan DP (FD-109) — dan order Cash memang tidak pernah DP (FD-39).

---

# 19. Order State Machine

## TD-14 — State machine sebagai tabel data + satu fungsi transisi

- **Rekomendasi:** Transisi didefinisikan sebagai tabel konstanta di `domain/orderStateMachine` persis seperti PRD §22.4. Satu fungsi `transitionOrder(order, to, actor, context)` memvalidasi `(from, to, actor, guard)`; tidak ada kode lain yang boleh mengubah `order_status` langsung.
- **Alasan:** FD-116 melarang transisi mundur/lompat bebas; satu titik masuk membuatnya mudah diaudit dan dites secara exhaustive.
- **Trade-off:** Tidak memakai library state machine (tidak dibutuhkan untuk 6 status).
- **Dampak:** UI admin menampilkan hanya transisi yang dikembalikan oleh `allowedTransitions(order, actor)`.

| Dari | Ke | Aktor | Guard |
|---|---|---|---|
| Pesanan Baru | Dikonfirmasi | SYSTEM | QRIS sukses terverifikasi webhook |
| Pesanan Baru | Dikonfirmasi | ADMIN | Transfer: bukti di-approve (otomatis bagian dari aksi approve) |
| Pesanan Baru | Dikonfirmasi | ADMIN | Cash: admin menerima |
| Pesanan Baru | Dibatalkan | SYSTEM | Expired (QRIS/Transfer, bukan Cash) |
| Pesanan Baru, Dikonfirmasi, Pesanan Diproses, Siap Diambil | Dibatalkan | ADMIN | Alasan wajib |
| Dikonfirmasi | Pesanan Diproses | ADMIN | — |
| Pesanan Diproses | Siap Diambil | ADMIN | — |
| Siap Diambil | Selesai | ADMIN | payment = `PAID` |
| Selesai, Dibatalkan | — | — | Terminal (FD-116, FD-118) |

Efek samping transisi ke Dibatalkan: slot dilepas (otomatis lewat definisi order aktif), audit, dan bila ada pembayaran → order muncul di daftar "perlu pencatatan refund" (refund tetap manual — FD-63).

Test: setiap pasangan `(from, to, actor)` yang tidak ada di tabel harus ditolak (EC-24).

---

# 20. Payment State Machine

## 20.1 Level transaksi

```text
WAITING_PAYMENT ──(QRIS webhook sukses / admin approve)──► PAID(sukses)
WAITING_PAYMENT ──(upload bukti)────────────────────────► WAITING_VERIFICATION
WAITING_VERIFICATION ──(approve)─► PAID(sukses)
WAITING_VERIFICATION ──(reject)──► WAITING_PAYMENT   (timer tidak di-reset)
WAITING_PAYMENT ──(provider gagal)─► FAILED          (boleh buat transaksi baru — FD-112)
WAITING_PAYMENT ──(lewat expires_at)─► EXPIRED
PAID(sukses) + order sudah Dibatalkan ─► is_exception = true
```

Cash membuat transaksi langsung sukses saat admin menandai lunas.

## 20.2 Level order (diturunkan, FD-52)

Urutan evaluasi fungsi `derivePaymentStatus`:

1. Ada refund: total refund = total dibayar → `REFUNDED`; sebagian → `PARTIALLY_REFUNDED`.
2. `paid_amount ≥ grand_total` → `PAID`.
3. `paid_amount > 0` → `PARTIALLY_PAID` (sisa ditampilkan; transaksi pelunasan punya status sendiri).
4. Ada transaksi `WAITING_VERIFICATION` → `WAITING_VERIFICATION`.
5. Ada transaksi `WAITING_PAYMENT` yang masih berlaku → `WAITING_PAYMENT`.
6. Order expired → `EXPIRED`.
7. Transaksi terakhir `FAILED` (dan reservasi masih berlaku) → `FAILED` (UI tetap menawarkan "Buat QRIS baru").
8. Cash tanpa transaksi → `UNPAID`.

Label UI mengikuti tabel Bahasa Indonesia di PRD §14.

---

# 21. Order Tracking & Security Token

## TD-11 — Token, penyimpanan, dan sesi tracking

- **Rekomendasi:**
  - Token: 32 byte acak dari CSPRNG (256 bit), di-encode base64url (43 karakter). Untuk input manual, tampilkan juga dalam kelompok karakter agar mudah disalin.
  - Simpan **SHA-256(token)** di `orders.tracking_token_hash` (FD-68). Hash cepat cukup karena token berentropi tinggi (bukan password); perbandingan constant-time.
  - Link tracking langsung memakai **URL fragment**: `/lacak#o=ENC-…&t=<token>`. Fragment tidak dikirim ke server dan tidak masuk log/Referer; JavaScript halaman membacanya lalu `POST /api/tracking`.
  - Setelah verifikasi, server membuat **cookie sesi tracking** `HttpOnly` yang terikat ke satu order, berumur pendek (mis. 2 jam), lalu fragment dihapus dari address bar.
  - Rate limit verifikasi per IP dan per nomor order; respons gagal generik ("Nomor pesanan atau kode akses tidak cocok").
  - Regenerate token oleh admin (FD-72, DI-05): token baru ditampilkan **sekali** ke admin, hash lama diganti, sesi tracking lama tidak berlaku, audit.
  - Manual Order juga mendapat token (FD-115).
- **Alasan:** Memenuhi FD-66–FD-69 dan BR-17/EC-11; fragment + cookie mengurangi kebocoran token lewat log, riwayat server, dan Referer.
- **Trade-off:** Link berisi token masih tersimpan di riwayat browser customer; ini diterima karena customer memang pemilik token. Token tidak dapat ditampilkan ulang (hanya regenerate).
- **Dampak:** Nomor order saja tidak pernah membuka data privat (FD-69).

## TD-12 — Format nomor order

- **Rekomendasi:** `ENC-YYYYMMDD-XXXX`, tanggal = tanggal order dibuat dalam WIB (FD-70); `XXXX` = 4 karakter acak dari alfabet Crockford Base32 tanpa karakter ambigu (tanpa I, L, O, U); unique constraint + retry bila bentrok.
- **Alasan:** Tidak membocorkan jumlah order harian (berbeda dengan nomor urut) dan tetap mudah dibaca/diucapkan via WhatsApp.
- **Trade-off:** Tidak berurutan; admin mengurutkan berdasarkan waktu dibuat, bukan nomor.
- **Dampak:** Format mengikuti FD-70; nomor bukan autentikasi.

---

# 22. Manual Order, Override & Audit

- Admin membuka form Manual Order: data customer, item, tanggal pickup, metode pembayaran.
- Memanggil **service yang sama** dengan checkout (`placeOrder` core) dengan `source = MANUAL`, `actor = admin`, dan daftar `overrides` opsional (FD-110).
- **Override yang diizinkan hanya** (FD-119): `MIN_PREORDER_DAYS`, `BOOKING_HORIZON`, `PICKUP_CUTOFF`, `DAILY_CAPACITY`. Tipe override lain ditolak di level schema (enum) dan di service.
- Alur UI: validasi normal dijalankan dulu; bila gagal karena salah satu dari empat aturan di atas, UI menampilkan error **dan** opsi "Override" untuk aturan tersebut saja; aturan lain (tanggal diblokir, Sold Out/nonaktif, max quantity, larangan Cash untuk Pre-Order, aturan pembayaran) hanya menampilkan error.
- Setiap override menulis `order_overrides` (wajib: tipe, nilai sebelum, nilai sesudah, alasan, admin, timestamp) **dan** `audit_logs`, dalam transaksi yang sama dengan pembuatan order.

| Override | Nilai sebelum (contoh) | Nilai sesudah (contoh) |
|---|---|---|
| MIN_PREORDER_DAYS | `{earliestDate:"2026-10-06", minDays:3}` | `{pickupDate:"2026-10-04"}` |
| BOOKING_HORIZON | `{latestDate:"2026-12-01"}` | `{pickupDate:"2026-12-10"}` |
| PICKUP_CUTOFF | `{cutoff:"15:00", earliestDate:"2026-10-03"}` | `{pickupDate:"2026-10-02"}` |
| DAILY_CAPACITY | `{capacity:10, used:10}` | `{used:11}` |

- **Tidak dapat di-bypass** (FD-119): metode/DP/Cash rules, verifikasi QRIS (Manual Order QRIS tetap dibayar lewat QR yang dikonfirmasi webhook — customer dapat membuka link tracking), penerbitan token, state transition, dan masa reservasi QRIS/Transfer.
- Setelah tersimpan: tampilkan nomor order + kode akses + tombol copy untuk dikirim admin secara manual (FD-115); tidak ada pengiriman otomatis.

---

# 23. Payment Exception Handling

- Dibuat otomatis oleh webhook untuk:
  - `LATE_PAYMENT_AFTER_CANCEL` — pembayaran QRIS valid setelah order expired/Dibatalkan (FD-107, FD-118);
  - `AMOUNT_MISMATCH` — nominal berbeda dari transaksi (EC-06) — **rekomendasi teknis TD-13**;
  - `DUPLICATE_PAYMENT` — pembayaran sukses kedua untuk transaksi yang sama/lebih dari total — **rekomendasi teknis TD-13**.
- Transaksi exception **tidak** dihitung ke `paid_amount`.
- Dashboard menampilkan exception `OPEN` di "Perlu Perhatian".
- Resolusi admin: **catat refund** (mengisi tabel `refunds`) atau **tandai selesai manual** dengan catatan (mis. "customer membuat order baru ENC-…"). **Tidak ada aksi reinstate**; order Dibatalkan tetap terminal (FD-118).

## TD-13 — Kategori exception tambahan

- **Rekomendasi:** Selain kasus FD-107, pembayaran dengan nominal tidak cocok atau ganda juga dicatat sebagai Payment Exception, tidak dihitung otomatis.
- **Alasan:** EC-06 meminta deteksi ketidaksesuaian; memakai mekanisme review yang sama lebih sederhana daripada aturan otomatis.
- **Trade-off:** Admin perlu menangani kasus langka ini secara manual.
- **Dampak:** Tidak ada business rule baru untuk customer; hanya jalur penanganan internal.

---

# 24. Image / File Upload Strategy

## TD-16 — Object storage S3-compatible, dua bucket

- **Rekomendasi:**
  - **Bucket publik** untuk gambar produk & kategori (disajikan lewat `next/image`/CDN).
  - **Bucket privat** untuk bukti pembayaran; tidak ada URL publik. Diakses hanya lewat `GET /api/admin/files/[id]` (session ADMIN) atau oleh pemilik order yang tervalidasi token untuk melihat bukti miliknya, dengan header `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, dan `Content-Type` yang sudah diverifikasi (FD-51).
- **Validasi bukti bayar (FD-50):** ukuran ≤ 5 MB (dicek sebelum dan sesudah upload), deteksi tipe dari **magic bytes** (bukan dari ekstensi/header client), hanya JPEG/PNG/PDF; nama file diganti UUID; simpan `sha256`; tidak pernah dieksekusi atau di-render inline sebagai HTML.
- **Gambar produk:** JPEG/PNG/WebP; resize & kompres saat upload dengan sharp ke beberapa ukuran; alt text wajib (PRD §44).
- **Alasan:** Memisahkan data publik dan privat secara fisik; storage terkelola lebih aman dan murah daripada menyimpan file di server aplikasi.
- **Trade-off:** Menambah satu layanan eksternal; file privat dialirkan lewat server aplikasi (sedikit lebih lambat, tetapi volume kecil).
- **Dampak:** Provider storage dipilih bersama hosting (TD-17).

---

# 25. WhatsApp Integration

- Fungsi `buildWhatsAppLink(context, data)` menghasilkan `https://wa.me/<nomor>?text=<pesan ter-encode>`; nomor dari Website Settings dinormalisasi ke format internasional tanpa `+`.
- Konteks (FD-75): floating contact, footer, order sukses, tracking, permintaan pembatalan, inquiry Custom Cake.
- Pesan boleh berisi nomor order (FD-76), **tidak pernah** token (FD-77) — dijaga oleh test unit yang memastikan token tidak muncul di output fungsi.
- Template pesan disimpan di modul copy; wording final mengikuti klien.
- Tidak ada WhatsApp API (FD-74); arsitektur notifikasi masa depan cukup dengan titik ekstensi "event order status changed" di service (PRD §27).

---

# 26. Admin Dashboard Architecture

| Modul | Fitur kunci |
|---|---|
| Dashboard | Order per status, pembayaran menunggu verifikasi, Payment Exception OPEN, pickup hari ini & mendatang + kapasitas, ringkasan pendapatan sederhana (total diterima, total sisa) (FD-90). |
| Pesanan | List dengan filter status/tanggal pickup/metode; detail lengkap (PRD §24); `TransitionControl`; batal + alasan; regenerate kode akses; riwayat audit. |
| Manual Order | Form + override (§22). |
| Pembayaran | Antrian verifikasi bukti (preview privat, approve/reject + alasan); tandai Cash lunas; catat refund; daftar exception + resolusi. Tidak ada tombol konfirmasi QRIS. |
| Kapasitas | Kalender/tabel per tanggal: kapasitas, terisi, sisa, status; blokir/buka; override kapasitas. |
| Produk & Kategori | CRUD, upload gambar, featured, availability, aktif/nonaktif. |
| Pengaturan | Website Settings (§28). |
| Akun | Ganti password; kelola akun admin. |

Mobile: tabel menjadi card list; aksi penting (lihat order, ubah status, cek pembayaran) dapat dilakukan di HP (PRD §35.4).

---

# 27. Website Settings

Disimpan di tabel `settings` (key → JSON) dengan schema Zod dan nilai default development yang jelas ditandai placeholder (FD-88, FD-99).

| Grup | Key | Default development |
|---|---|---|
| Bisnis | business_name, business_description, address, whatsapp_number, social_links, operating_hours | Placeholder bertanda "[ISI DARI KLIEN]" |
| Pickup | pickup_hours (info), pickup_instructions, pickup_cutoff | cutoff `15:00` |
| Kapasitas | default_capacity, booking_horizon_days | `10`, `60` |
| Pembayaran | bank_accounts, payment_instructions | Placeholder |
| Reservasi awal | qris_reservation_minutes, transfer_reservation_minutes, qr_expiry_buffer_minutes | `30`, `120`, `2` |
| Pelunasan DP (TD-09) | qris_remaining_payment_minutes, transfer_remaining_payment_minutes | `30`, `120` (sama dengan reservasi untuk V1, tetapi key terpisah) |

## TD-18 — Lokasi pengaturan durasi reservasi (DI-06)

- **Rekomendasi:** Durasi reservasi disimpan di tabel `settings` dan dapat diubah admin di bagian "Pengaturan Operasional", dengan batas aman (rekomendasi QRIS 10–120 menit, Transfer 30–1.440 menit). Perubahan hanya berlaku untuk order baru.
- **Alasan:** Klien dapat menyesuaikan tanpa deploy ulang; batas mencegah salah ketik ekstrem.
- **Trade-off:** Admin dapat mengubah perilaku sistem penting; dimitigasi dengan audit log dan batas.
- **Dampak:** Order yang sudah ada tidak terpengaruh (timer tidak pernah di-reset — FD-120).

Key durasi pelunasan DP (TD-09) disimpan terpisah di tabel yang sama. Untuk V1 key tersebut tidak wajib tampil di UI admin; arsitekturnya sudah memungkinkan ditampilkan dan diubah terpisah di masa depan tanpa mengubah logika order.

Perubahan settings memicu revalidasi cache halaman publik dan dicatat di audit log.

---

# 28. Validation Strategy

- **Satu sumber schema** Zod di `lib/validation`, dipakai form client (feedback cepat) dan server (otoritatif) — PRD §37.
- Server **selalu** menghitung ulang: harga, diskon, total, DP, ketersediaan produk, aturan Pre-Order, cutoff, horizon, kapasitas, metode pembayaran.
- Nomor WhatsApp: libphonenumber-js region `ID`, normalisasi E.164, tolak nomor non-mobile bila dapat dideteksi.
- Nama & catatan: trim, batas panjang (rekomendasi nama ≤ 100, catatan ≤ 500 karakter), escape saat render (React default).
- Quantity: bilangan bulat ≥ 1 dan ≤ `max_quantity_per_order` bila produk mengaturnya. **Tidak ada** batas quantity global (FD-28) — **TD-19**: satu-satunya pemeriksaan tambahan adalah bahwa hasil `harga × quantity` dan total order tetap muat dalam tipe integer database (pencegahan overflow teknis, bukan aturan bisnis).
- File: §24.
- Webhook: signature + status API (§16).

---

# 29. Error Handling

- Domain error bertipe → pesan Bahasa Indonesia yang jelas, tidak menyalahkan, dengan langkah berikutnya (Design §30), mis.:
  - `DATE_FULL` → "Tanggal ini sudah penuh. Silakan pilih tanggal lain."
  - `RESERVATION_EXPIRED` → "Batas waktu pembayaran telah habis dan pesanan dibatalkan. Silakan buat pesanan baru."
  - `PAYMENT_PROVIDER_UNAVAILABLE` → "Layanan pembayaran sedang bermasalah. Silakan coba lagi." (EC-13; status pembayaran tidak pernah ditandai berhasil)
- Error tak terduga: halaman/komponen error boundary dengan pesan umum "Terjadi masalah. Silakan coba lagi." + `request_id` untuk dukungan; detail hanya di log server/Sentry.
- Form: error per field + ringkasan di atas form; fokus dipindahkan ke error pertama (aksesibilitas).
- Loading: skeleton per bagian, bukan spinner layar penuh (Design §29).
- Tombol submit dinonaktifkan saat proses + idempotency key (PRD §36).

---

# 30. Security

| Area | Langkah | Referensi requirement |
|---|---|---|
| Secrets | Hanya di environment variables server; tidak ada secret di bundle client atau repo; `.env.example` tanpa nilai | PRD §40, §58 |
| Auth admin | Argon2id, session DB, cookie HttpOnly/Secure/SameSite, rate limit login | PRD §29 |
| Authorization | Cek session ADMIN di setiap admin action/route di server, bukan hanya di layout | PRD §29 |
| CSRF | Server Actions (cek Origin), route mutasi lain memeriksa Origin + SameSite cookie | PRD §40 |
| XSS | Render React (auto-escape), tidak ada `dangerouslySetInnerHTML` untuk input user, Content-Security-Policy | PRD §40 |
| Injection | Query parametris lewat ORM; raw SQL hanya dengan parameter | PRD §40 |
| Upload | Magic-bytes, ukuran, bucket privat, `nosniff`, `attachment` | FD-50, FD-51 |
| Tracking | Token 256-bit, hash, fragment URL, rate limit, respons generik | FD-66–69 |
| Webhook | Signature + status API + idempotency | FD-37, BR-15 |
| Headers | HSTS, CSP, `X-Frame-Options: DENY`/`frame-ancestors`, `Referrer-Policy: strict-origin-when-cross-origin` | — |
| Data pribadi | Minimisasi data (nama + WA saja, FD-35), log tanpa data pribadi penuh (nomor WA di-mask), akses admin ter-audit | UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi |
| Admin area | `noindex`, tidak ditautkan dari navigasi publik | — |

Catatan kepatuhan: UU PDP (UU 27/2022) berlaku untuk pemrosesan data pribadi customer (nama, nomor WhatsApp). Kebijakan privasi (GL-11) dan kebijakan retensi data perlu disiapkan bersama klien; kewajiban pendaftaran Penyelenggara Sistem Elektronik (PSE) lingkup privat juga perlu dicek klien/penasihat hukum. Dokumen ini tidak memberikan nasihat hukum.

---

# 31. Concurrency / Race-Condition Handling

| Skenario | Penanganan |
|---|---|
| Dua checkout untuk slot terakhir (EC-01) | Lock baris `pickup_dates` per tanggal (§13) |
| Manual Order vs order website di tanggal sama (EC-19) | Lock yang sama |
| Webhook bersamaan dengan sweeper expiry | Keduanya mengunci baris order; urutan lock tetap (transaksi → order); yang kedua melihat state terbaru |
| Admin approve bukti bersamaan dengan expiry | Upload bukti sebelum expiry membuat `WAITING_VERIFICATION` (dikecualikan dari expiry); approve mengunci order |
| Dua admin mengubah status order yang sama | Lock baris order + validasi `from` status saat ini (optimistic check); yang kalah mendapat pesan "Status sudah berubah, muat ulang" |
| Double submit checkout | Idempotency key unik (§33) |
| Retry QRIS ganda | Lock order; hanya satu transaksi QRIS pending aktif per order — transaksi pending lama ditandai dibatalkan/diabaikan sebelum membuat yang baru (TD-20) |

## TD-20 — Satu transaksi QRIS pending per order

- **Rekomendasi:** Saat customer membuat QRIS baru, transaksi QRIS pending sebelumnya ditandai tidak berlaku (dan, bila provider mendukung, dibatalkan di provider).
- **Alasan:** Mengurangi kemungkinan customer membayar dua QR berbeda.
- **Trade-off:** Jika customer tetap membayar QR lama dan webhook masuk, pembayaran itu ditangani sebagai Payment Exception (`DUPLICATE_PAYMENT`) bila order sudah lunas, atau diterima normal bila order belum lunas.
- **Dampak:** Konsisten dengan FD-112 (hanya transaksi sukses yang dihitung).

Testing konkuren wajib (Phase 7): N request paralel untuk 1 slot tersisa → tepat 1 sukses.

---

# 32. Idempotency

| Titik | Mekanisme |
|---|---|
| Webhook | Unique `(provider, provider_event_key)` di `payment_webhook_events`; status transaksi yang sudah final tidak diproses ulang (EC-05) |
| Checkout | Unique `orders.idempotency_key` |
| Admin aksi pembayaran (approve, tandai Cash, refund) | Validasi state saat ini dalam transaksi (approve hanya dari `WAITING_VERIFICATION`, dst.) |
| Sweeper expiry | `expireIfDue` hanya bertindak bila masih memenuhi syarat |
| Transisi status | Fungsi transisi menolak `from` yang tidak cocok |

## TD-15 — Respons checkout ganda

- **Rekomendasi:** Bila request dengan idempotency key yang sama datang lagi, server mengembalikan nomor order yang sama tanpa token plaintext; client menyimpan respons pertama di memori sampai halaman sukses tampil.
- **Alasan:** Token plaintext tidak disimpan di server (FD-68).
- **Trade-off:** Jika jaringan putus tepat setelah order dibuat dan respons hilang, customer tidak menerima token; pemulihan lewat admin/WhatsApp (FD-72) dengan regenerate token.
- **Dampak:** Tidak ada order ganda; kasus langka ditangani prosedur yang sudah ada.

---

# 33. Responsive Implementation Strategy

- Breakpoint sesuai PRD-Design §23: `<640` mobile, `640–1023` tablet, `≥1024` desktop, `≥1280` large.
- Mobile-first: style dasar untuk 360px; tambahkan layout di breakpoint lebih besar.
- Pola per komponen:

| Komponen | Mobile | Tablet | Desktop |
|---|---|---|---|
| Navbar | Logo + cart + hamburger drawer | Drawer atau navbar ringkas | Navbar penuh + CTA |
| Grid produk | 2 kolom (atau 1 untuk layar sangat kecil) | 3 kolom | 4 kolom |
| Category cards | Scroll horizontal yang disengaja atau stack | 2–3 kolom | Sesuai jumlah kategori |
| Detail produk | Gambar di atas, sticky CTA bawah | Split proporsional | Split gallery/info |
| Checkout | Satu kolom, ringkasan collapsible | Satu/dua kolom | Dua kolom (form + ringkasan) |
| Tabel admin | Card list | Tabel dengan kolom prioritas | Tabel penuh |
| Dialog | Full-height sheet | Dialog terpusat | Dialog terpusat |

- Gambar dengan `aspect-ratio` tetap dan `sizes` responsif agar perangkat kecil tidak mengunduh aset besar (PRD §42).
- Floating WhatsApp tidak menutupi sticky CTA (Design §7).
- Matrix pengujian viewport (Phase 7): 320×568, 360×800, 390×844, 844×390 (HP landscape), 768×1024, 1024×768, 1366×768, 1920×1080.

---

# 34. Accessibility

- Target **WCAG 2.1 AA** (Design §4.1, §25).
- Token warna diuji rasio kontras secara otomatis (skrip pengecekan token di CI) — teks normal ≥ 4.5:1, teks besar & komponen UI ≥ 3:1. Catatan dari analisis: teks cream di atas mauve referensi `#B79A98` ≈ 2.25:1 sehingga wajib disesuaikan.
- Semantik HTML (landmark, heading berurutan), label form, `aria-live` untuk update cart & status pembayaran, fokus terlihat (`:focus-visible`), target sentuh ≥ 44×44 px.
- Tanggal disabled: alasan disampaikan sebagai teks yang dapat diakses (bukan tooltip hover).
- Status & badge: teks + ikon, bukan warna saja (Design §19).
- `prefers-reduced-motion`: animasi dikurangi/dimatikan.
- Pengujian: axe-core otomatis di Playwright + uji keyboard manual + uji screen reader dasar (VoiceOver/TalkBack) pada alur checkout dan tracking.

---

# 35. Testing Strategy

| Level | Tools | Cakupan wajib |
|---|---|---|
| Unit (domain) | Vitest | Harga & sale price; DP ceil (contoh ganjil); tanggal efektif & cutoff (batas detik); minimum Pre-Order campuran; horizon; status ketersediaan tanggal; state machine exhaustive (semua pasangan); `derivePaymentStatus`; WhatsApp link tanpa token; format nomor order; validasi Zod |
| Integration | Vitest + Testcontainers (PostgreSQL asli) | `placeOrder` lengkap; **race 20 request paralel untuk 1 slot → 1 sukses**; expiry lazy vs sweeper; webhook idempotent (event sama 2×); webhook terlambat → exception, order tetap Dibatalkan; reject bukti sebelum/sesudah expiry (FD-120); transaksi pelunasan DP expired → hanya transaksi `EXPIRED`, order tetap aktif & slot tidak dilepas, durasi dibaca dari key pelunasan terpisah (TD-09); Manual Order override hanya 4 tipe + audit lengkap; Cash dilarang untuk Pre-Order; Selesai butuh PAID |
| E2E | Playwright | Customer: katalog → cart → checkout (QRIS mock, Transfer, Cash) → sukses → tracking → pelunasan DP. Admin: login, verifikasi bukti, transisi status, batal, Manual Order + override, kapasitas, settings |
| Responsive | Playwright (matrix §33) | Tidak ada horizontal overflow (cek `scrollWidth`), CTA terlihat, screenshot review |
| Accessibility | @axe-core/playwright + manual | Tanpa pelanggaran serius/kritis pada halaman utama & admin inti |
| Payment sandbox | Sandbox provider terpilih | Alur QRIS sukses, gagal, expired, webhook ganda (Definition of Done PRD §60) |
| Security | Checklist OWASP ASVS dasar + uji manual | Akses order tanpa token (EC-11), akses admin tanpa login, upload file berbahaya (polyglot, ekstensi palsu, > 5 MB), brute force tracking/login (rate limit) |

Semua tes yang bergantung waktu memakai **clock palsu** yang dapat diatur ke WIB tertentu.

---

# 36. Deployment Architecture

## TD-17 — Hosting

- **Rekomendasi (Opsi A, managed):**
  - Aplikasi: **Vercel** (paket berbayar Pro, karena paket Hobby ditujukan untuk penggunaan non-komersial dan jadwal cron-nya terbatas), region Singapura.
  - Database + storage: **Supabase** (PostgreSQL terkelola + Storage dengan bucket publik/privat), region Singapura, dengan backup terkelola.
  - Sweeper: Vercel Cron memanggil endpoint expiry.
- **Opsi B (self-managed):** Satu VPS (region Jakarta/Singapura) dengan Docker: aplikasi Next.js (standalone) + PostgreSQL + object storage S3-compatible (mis. Cloudflare R2), reverse proxy dengan TLS, cron sistem untuk sweeper.
- **Alasan Opsi A:** Operasional minimal (patch OS, backup, TLS ditangani penyedia), cocok untuk klien UMKM tanpa tim DevOps.
- **Trade-off:** Opsi A berbiaya bulanan beberapa layanan dan ada ketergantungan vendor; Opsi B lebih murah dan lebih terkendali, tetapi membutuhkan perawatan server, backup, dan monitoring sendiri. Biaya aktual harus dicek di halaman harga masing-masing saat keputusan diambil.
- **Dampak:** Kode tidak bergantung pada fitur khusus vendor (storage lewat API S3-compatible, database PostgreSQL standar, cron lewat endpoint HTTP), sehingga perpindahan A ↔ B tetap memungkinkan.

## 36.1 Environment

| Environment | Database | Payment | Tujuan |
|---|---|---|---|
| Local | PostgreSQL lokal (Docker) | MockProvider | Development |
| Preview/Staging | Database staging terpisah | Sandbox provider | Uji fitur & UAT klien |
| Production | Database production | Provider production | Live |

Migration database dijalankan sebagai langkah terpisah di pipeline sebelum aplikasi baru aktif; migration bersifat forward-only dan diuji di staging.

## 36.2 CI

Setiap push/PR: typecheck, lint, unit test, integration test (Testcontainers), build. E2E + aksesibilitas di staging sebelum rilis.

---

# 37. Environment Variables & Secrets

| Variable | Keterangan | Sensitif |
|---|---|---|
| `APP_URL` | Base URL publik | Tidak |
| `DATABASE_URL` | Koneksi PostgreSQL | **Ya** |
| `AUTH_SECRET` | Secret penandatanganan session auth | **Ya** |
| `PAYMENT_PROVIDER` | `mock` / `midtrans` / `xendit` | Tidak |
| `PAYMENT_ENV` | `sandbox` / `production` | Tidak |
| `MIDTRANS_SERVER_KEY` *(atau padanan Xendit: `XENDIT_SECRET_KEY`, `XENDIT_CALLBACK_TOKEN`)* | Kredensial provider | **Ya** |
| `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` | Object storage | **Ya** (key) |
| `STORAGE_PUBLIC_BUCKET`, `STORAGE_PRIVATE_BUCKET` | Nama bucket | Tidak |
| `CRON_SECRET` | Proteksi endpoint sweeper | **Ya** |
| `SENTRY_DSN` | Error monitoring (opsional) | Rendah |
| `LOG_LEVEL` | Level log | Tidak |

Aturan: tidak ada variabel sensitif dengan prefix `NEXT_PUBLIC_`; `.env*` di `.gitignore`; secret production hanya di dashboard hosting; rotasi secret didokumentasikan di runbook. Nilai bisnis (cutoff, kapasitas, rekening, dsb.) **bukan** environment variable — disimpan di Website Settings.

---

# 38. Backup & Recovery

- **Database:** backup harian otomatis + point-in-time recovery bila tersedia di penyedia; retensi rekomendasi ≥ 7 hari (production). Uji restore ke staging minimal sebelum go-live dan berkala (mis. per kuartal).
- **Object storage:** versioning atau backup berkala untuk bucket privat (bukti pembayaran) dan bucket gambar.
- **Rekonsiliasi pembayaran:** karena provider adalah sumber kebenaran transaksi QRIS, runbook mencakup prosedur mencocokkan transaksi provider dengan database setelah insiden (menggunakan `getTransactionStatus`).
- **Recovery objectives (usulan):** RPO ≤ 24 jam (backup harian) atau beberapa menit dengan PITR; RTO ≤ 4 jam. Angka final menyesuaikan paket hosting yang dipilih.
- Runbook di `docs/` mencakup: restore database, rotasi secret, provider gateway down, webhook gagal massal.

---

# 39. Logging & Audit

- **Application log** (pino, JSON): request id, route, durasi, hasil; data pribadi di-mask (nomor WA sebagian, tanpa token, tanpa isi bukti). Disimpan sesuai fasilitas hosting.
- **Audit log** (`audit_logs`, append-only, di database): semua perubahan order status, payment status, verifikasi/penolakan bukti, tandai Cash, pembatalan + alasan, refund, Manual Order, override (juga di `order_overrides`), resolusi Payment Exception, regenerate token, perubahan settings/produk/kapasitas, login admin (sukses/gagal). Aktor: admin id atau `SYSTEM`.
- **Webhook log** (`payment_webhook_events`): setiap event diterima, hasil verifikasi, hasil proses.
- Audit ditampilkan di detail order sebagai timeline (PRD §25) dan dapat difilter di admin.

---

# 40. Development Phases

Mengikuti PRD §59, dengan exit criteria. Setiap phase diakhiri review user sebelum lanjut.

| Phase | Isi | Exit criteria |
|---|---|---|
| **1 — Foundation** | Setup repo & tooling, CI, schema + migration awal, auth admin (login/logout/ganti password, seed admin), layout dasar, design tokens + uji kontras, modul clock WIB, MockProvider, storage adapter | Admin bisa login; CI hijau; token warna lolos AA |
| **2 — Public Website** | Beranda (hero, featured, kategori, about, cara pesan, kontak), katalog + filter kategori, detail produk, footer, floating WA, SEO dasar, responsive | Halaman publik lolos matrix responsive & axe |
| **3 — Shopping** | Cart (persist + validasi server), domain pickupDate, ketersediaan tanggal, kapasitas & locking, checkout, aturan metode/DP | Test race 1 slot lulus; semua aturan tanggal teruji |
| **4 — Orders** | `placeOrder`, halaman sukses, token & tracking, state machine, expiry lazy + sweeper, detail order admin, audit | Tracking aman (tes EC-11), transisi exhaustive teruji |
| **5 — Payment** | Adapter provider terpilih (sandbox), QRIS + webhook + idempotency + retry, Transfer + upload + verifikasi + reject, Cash, DP & pelunasan, Payment Exception, refund record | Sandbox flow lulus (PRD §60) |
| **6 — Admin** | Produk & kategori, Manual Order + override, kapasitas, settings, dashboard, manajemen admin | Semua modul usable di mobile |
| **7 — Testing & Hardening** | E2E lengkap, responsive matrix, aksesibilitas, security checklist, concurrency, edge case EC-01…EC-24, UAT klien di staging | Tidak ada bug kritis/tinggi terbuka |
| **8 — Production** | Data klien (GL-01…GL-12), merchant production, domain, hosting production, monitoring, backup + uji restore, go-live checklist | Go-live disetujui klien |

Phase 1–4 dapat dikerjakan sebelum merchant account dan data klien tersedia (memakai MockProvider dan placeholder).

---

# 41. Daftar Keputusan Teknis (Menunggu Persetujuan)

| ID | Keputusan | Bagian |
|---|---|---|
| TD-01 | Modular monolith full-stack | §2 |
| TD-02 | Stack: TypeScript, Next.js App Router, PostgreSQL, Drizzle, Zod, Tailwind, Radix, Zustand, Better Auth, Argon2id | §3 |
| TD-03 | Struktur folder & route berbahasa Indonesia | §4 |
| TD-04 | Server Actions + Route Handlers | §6 |
| TD-05 | Uang integer, timestamptz UTC, tanggal bisnis WIB | §7 |
| TD-06 | Lock per tanggal + hitung order aktif | §13 |
| TD-07 | Lazy expiry + sweeper terjadwal | §13.4 |
| TD-08 | Adapter provider; Midtrans kandidat utama, Xendit alternatif; QR expiry buffer 2 menit | §14 |
| TD-09 | Masa berlaku pelunasan DP = parameter terpisah dari reservasi awal; default V1 sama nilainya; expiry hanya memengaruhi transaksi (**FINAL**) | §15 |
| TD-10 | Better Auth, tanpa forgot-password publik | §8 |
| TD-11 | Token 256-bit, SHA-256 hash, URL fragment, cookie sesi tracking | §21 |
| TD-12 | Suffix nomor order acak Crockford Base32 | §21 |
| TD-13 | Exception tambahan: AMOUNT_MISMATCH, DUPLICATE_PAYMENT | §23 |
| TD-14 | State machine sebagai tabel + satu fungsi transisi | §19 |
| TD-15 | Perilaku idempotency checkout tanpa token ulang | §32 |
| TD-16 | Object storage S3-compatible, bucket publik & privat | §24 |
| TD-17 | Hosting Opsi A (Vercel Pro + Supabase) vs Opsi B (VPS) | §36 |
| TD-18 | Durasi reservasi di Website Settings dengan batas aman | §27 |
| TD-19 | Tanpa batas quantity global; hanya pencegahan overflow integer | §28 |
| TD-20 | Satu transaksi QRIS pending aktif per order | §31 |

---

# 42. Risiko Teknis

| # | Risiko | Dampak | Mitigasi |
|---|---|---|---|
| R1 | Onboarding merchant QRIS production memerlukan dokumen & waktu verifikasi | Go-live tertunda | Mulai pengecekan onboarding paralel dengan Phase 1; MockProvider + sandbox agar development tidak tertahan |
| R2 | Webhook tiba setelah reservasi habis meski customer membayar tepat waktu | Customer kecewa; Payment Exception | QR expiry buffer (TD-08); dashboard exception; resolusi manual/refund (FD-118) |
| R3 | Kesalahan zona waktu/cutoff | Tanggal salah ditawarkan | Satu modul clock, clock palsu di test, tes batas detik |
| R4 | Race condition kapasitas | Overbooking | Lock per tanggal + tes konkuren wajib |
| R5 | Kehilangan token tracking | Beban admin | Halaman sukses menonjolkan token + copy; regenerate oleh admin |
| R6 | Override kapasitas berlebihan oleh admin | Beban produksi | Audit lengkap (FD-119); tampilkan peringatan overbooked di kalender |
| R7 | Upload file berbahaya | Keamanan | Magic bytes, bucket privat, `attachment` + `nosniff` |
| R8 | Kontras palet referensi tidak memenuhi AA | Aksesibilitas | Token disesuaikan & diuji otomatis (FD-102) |
| R9 | Biaya hosting & gateway | Biaya operasional klien | Bandingkan Opsi A/B; biaya gateway ditanggung merchant (FD-47) perlu disadari klien |
| R10 | Kepatuhan data pribadi (UU PDP) & kemungkinan kewajiban PSE | Risiko hukum | Minimisasi data, privacy policy, cek oleh klien/penasihat hukum |
| R11 | Data klien (foto, rekening, kebijakan) terlambat | Go-live tertunda | Placeholder bertanda; checklist GL di Phase 8 |
| R12 | Pembaruan versi framework yang cepat | Maintenance | Kunci versi, update terjadwal, test suite sebagai pengaman |

---

# 43. Definition of Done

Mengikuti PRD §60, ditambah kriteria teknis plan ini. Sebuah fitur selesai bila:

- Requirement terkait (FD/BR/EC) terimplementasi dan dirujuk di PR.
- Happy path, error state, loading state, empty state, dan success state tersedia.
- Validasi client **dan** server (server otoritatif).
- Unit test domain + integration test service untuk logika baru; tidak ada penurunan cakupan pada `server/domain`.
- Responsive pada matrix viewport §33 tanpa horizontal overflow; tidak ada fungsi yang hanya bekerja di desktop atau via hover.
- Lolos axe tanpa pelanggaran serius/kritis; keyboard dapat dipakai; fokus terlihat.
- Otorisasi diterapkan di server; tidak ada secret di source code atau bundle client.
- Data tersimpan sesuai schema; perubahan penting tercatat di audit log.
- Edge case terkait diuji.
- Untuk fitur pembayaran: alur sandbox lulus (sukses, gagal, expired, webhook ganda).
- Dokumentasi setup/runbook diperbarui.
- Tidak merusak fitur yang sudah ada (CI hijau).

---

# 44. Referensi

- OWASP Password Storage Cheat Sheet (Argon2id) — https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP File Upload Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- OWASP Application Security Verification Standard (ASVS) — https://owasp.org/www-project-application-security-verification-standard/
- W3C WCAG 2.1 (SC 1.4.3, 1.4.11) — https://www.w3.org/TR/WCAG21/
- PostgreSQL documentation, Explicit Locking / `SELECT … FOR UPDATE` — https://www.postgresql.org/docs/current/explicit-locking.html
- Next.js documentation, Server Actions security — https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations
- Midtrans documentation (Core API QRIS, HTTP notification & signature) — https://docs.midtrans.com/
- Xendit documentation (QR Codes API, callback verification) — https://docs.xendit.co/
- Undang-Undang Republik Indonesia Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi.

Detail API provider (field, batas masa berlaku QR, format signature) harus diverifikasi ulang terhadap dokumentasi resmi terbaru saat Phase 5, karena dapat berubah.
