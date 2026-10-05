# Deployment — Enjua Cake's

Panduan teknis untuk staging dan production (IMPLEMENTATION-PLAN §36–§38).

**Keputusan hosting (TD-17) — final:**

- Target hosting: **Vercel** (Opsi A).
- Production: **Vercel Production deployment**.
- Staging: **Vercel Preview deployment** pada project yang sama.
- Database production: **Supabase PostgreSQL**.
- Storage production: **S3-compatible storage** (`STORAGE_DRIVER=s3`).
- Payment production: **Midtrans Production** (`PAYMENT_PROVIDER=midtrans`, `PAYMENT_ENV=production`).

Aturan env per environment: lihat §1 "Aturan per environment". Tabel di bawah tetap
dipertahankan sebagai referensi; repositori masih mendukung kedua opsi tanpa mengunci pilihan:

| | Opsi A — managed (rekomendasi plan) | Opsi B — self-managed |
|---|---|---|
| Aplikasi | Vercel Pro (region Singapura) | 1 VPS + Docker (`Dockerfile` target `runner`, output standalone) |
| Database | Supabase PostgreSQL (backup terkelola) | PostgreSQL 16 (container/VM) + backup sendiri |
| Storage | Supabase Storage (API S3) | S3-compatible (mis. Cloudflare R2) atau disk + backup |
| Sweeper | Vercel Cron (`vercel.json`, 1×/hari — batas Hobby; lihat §4) | cron host memanggil endpoint (lihat bawah) |
| TLS | otomatis | reverse proxy (Caddy/Nginx) |

Kode hanya bergantung pada PostgreSQL standar, API S3, dan endpoint HTTP, sehingga
pindah A ↔ B tidak mengubah aplikasi.

Region function Vercel dikunci ke `sin1` di `vercel.json` (`regions`), satu region yang sama dengan
Supabase `ap-southeast-1`. Default Vercel (`iad1`) menambah ±250 ms per round trip ke database
dan Storage (terukur di staging); Hobby hanya mengizinkan satu region.

## 1. Environment

Template: `.env.production.example` (placeholder saja). Nilai asli **hanya** di
pengaturan secret hosting. Validasi sebelum deploy (tidak mencetak nilai):

```bash
npm run preflight -- --target=staging      # atau --target=production
```

Wajib: `APP_URL` (https), `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`,
`PAYMENT_PROVIDER`, `PAYMENT_ENV`, `MIDTRANS_SERVER_KEY`, `STORAGE_DRIVER` dan, untuk
`s3`, `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY_ID`,
`STORAGE_SECRET_ACCESS_KEY`, `STORAGE_PUBLIC_BUCKET`, `STORAGE_PRIVATE_BUCKET`.
Opsional: `DATABASE_POOL_MAX`, `LOG_LEVEL`. Khusus staging dengan MockProvider:
`ALLOW_MOCK_PAYMENTS=true` + `MOCK_PAYMENT_WEBHOOK_SECRET` (dilarang di production).

Nilai bisnis (cutoff, kapasitas, rekening, WhatsApp, alamat, dll.) **bukan** env —
diisi admin di **/admin/pengaturan**.

### Aturan per environment (target: Vercel + Supabase PostgreSQL + S3-compatible + Midtrans)

`NODE_ENV=production` saja **tidak** menandakan production sungguhan: setiap build
Vercel (Production maupun Preview) dan `next start` di E2E/CI juga `NODE_ENV=production`.
Penanda situs live adalah **`VERCEL_ENV=production`**, yang diisi otomatis oleh Vercel
hanya pada Production deployment — tidak perlu (dan jangan) diset manual.

| | Production | Staging | E2E / CI |
|---|---|---|---|
| Deployment | Vercel **Production** deployment | Vercel **Preview** deployment, project yang sama | `next start` lokal/CI (`playwright.config.ts`) |
| `VERCEL_ENV` | `production` (otomatis) | `preview` (otomatis) | tidak ada |
| `PAYMENT_PROVIDER` / `PAYMENT_ENV` | `midtrans` / `production` | `midtrans` / `sandbox` (atau mock untuk UAT) | `mock` (+ `ALLOW_MOCK_PAYMENTS=true`) |
| `STORAGE_DRIVER` | `s3` | `s3` dengan bucket staging terpisah (lihat catatan) | `local` |
| `APP_URL` | `https://<domain>` | `https://` URL Preview/staging | `http://localhost:<port>` |

**Production** — saat `NODE_ENV=production` **dan** `VERCEL_ENV=production`, aplikasi
menolak start (`src/server/env.ts`) bila `PAYMENT_PROVIDER` bukan `midtrans` dengan
`PAYMENT_ENV=production`, `STORAGE_DRIVER` bukan `s3`, atau `APP_URL` bukan https.
Jadi production **tidak boleh** memakai Midtrans sandbox, MockProvider (walau
`ALLOW_MOCK_PAYMENTS=true`), atau local storage. Aturan ini sama dengan
`npm run preflight -- --target=production`; preflight tetap wajib dijalankan sebelum deploy.

**Staging** — pakai **Preview deployment pada project Vercel yang sama**, dengan env
var yang di-scope ke *Preview* di pengaturan project (key sandbox Midtrans, database dan
bucket staging). **Jangan** memakai Production deployment (termasuk project Vercel
terpisah yang di-deploy sebagai Production) untuk staging: di sana `VERCEL_ENV=production`,
sehingga Midtrans sandbox akan ditolak.
Catatan storage: guard mengizinkan `STORAGE_DRIVER=local` di Preview, tetapi filesystem
fungsi Vercel tidak persisten (dan di luar `/tmp` hanya-baca), sehingga upload foto produk
dan bukti transfer di staging Vercel akan gagal atau hilang. `local` cocok untuk E2E/CI dan
development; staging yang menguji upload memakai `s3` dengan bucket staging terpisah.

**E2E / CI** — `next start` menjalankan production build sehingga `NODE_ENV=production`,
tetapi tanpa `VERCEL_ENV=production`, jadi tidak dianggap production sungguhan dan
guard di atas tidak berlaku. Konfigurasi E2E (`playwright.config.ts`: mock + `local` +
`http://localhost`) sudah lulus dan **jangan diubah** untuk menyesuaikan guard.

## 2. Database & migrasi

- Migrasi forward-only, dicek oleh `npm run db:check-migrations` (CI) — statement
  destruktif ditolak kecuali ada penanda review `-- allow-destructive: <alasan>`.
- Jalankan sebagai langkah terpisah **sebelum** versi baru menerima trafik:
  `DATABASE_URL=<koneksi langsung, bukan pooler transaksi> npm run db:migrate`
  (advisory lock mencegah dua migrasi berjalan bersamaan).
- Aplikasi memakai `prepare: false`, aman untuk pooler mode transaksi (Supabase/PgBouncer).
- Aplikasi juga mematikan pipelining postgres.js (`max_pipeline: 0`, `src/server/db/client.ts`): Supavisor mode transaksi hanya menjawab query pertama dari beberapa query yang dikirim berurutan di satu koneksi, sisanya menggantung sampai function timeout. Nilai `0` butuh `patches/postgres+3.4.9.patch` (diterapkan otomatis oleh `postinstall`); saat menaikkan versi `postgres`, perbarui patch itu atau hapus bila upstream sudah memperbaikinya — `tests/integration/db-pipelining.test.ts` akan gagal bila patch hilang.
- Uji migrasi + restore di staging dulu (§38).

## 3. Admin pertama & pemulihan

Pendaftaran publik dinonaktifkan (TD-10). Di server/CI dengan akses DB production:

```bash
npm run admin -- create --email=<email-pemilik> --name="<nama>"     # password diminta tersembunyi
npm run admin -- reset-password --email=<email>                     # pemulihan bila semua admin terkunci
```

`db:seed-admin` dan `db:seed-sample` menolak berjalan di production. Jangan memuat
data contoh ke database production.

## 4. Cron (sweeper reservasi, TD-07)

Endpoint: `GET|POST /api/cron/expire-reservations` dengan header
`Authorization: Bearer $CRON_SECRET`. Kebenaran kapasitas dan pembayaran **tidak**
bergantung pada cron; cron hanya merapikan status order yang tidak pernah dibuka lagi:

- kapasitas tidak menghitung reservasi yang `reservationExpiresAt`-nya lewat;
- order kedaluwarsa dibatalkan secara lazy saat dibuka di Lacak Pesanan, saat customer
  meminta QRIS/mengunggah bukti, saat admin membuka detail order, dan daftar order
  admin serta dashboard menyapu semua yang jatuh tempo sebelum tampil;
- webhook pembayaran mengunci order dan menjalankan expiry dulu, sehingga pembayaran
  yang datang setelah batas waktu menjadi exception, tidak menghidupkan order lagi.

**Vercel Hobby:** Vercel Cron di paket Hobby hanya boleh berjalan maksimal sekali per hari
(waktu eksekusi tidak presisi dalam jam tersebut); ekspresi yang lebih sering, seperti
`*/5 * * * *`, membuat deployment ditolak — termasuk Preview. Karena itu `vercel.json`
memakai `0 20 * * *` (20.00 UTC = 03.00 WIB). Test `tests/unit/production-ops.test.ts`
menjaga agar jadwal tetap ≤ 1×/hari.

**Implikasi production (Hobby, 1×/hari):** tidak ada dampak ke kapasitas, pembayaran, atau
apa yang dilihat customer/admin (semua jalur di atas memakai lazy expiry). Yang berubah
hanya baris order di database: order kedaluwarsa yang tidak dibuka siapa pun bisa tetap
berstatus `NEW` hingga sapuan harian, dashboard admin, atau daftar order berikutnya.
Bila status DB perlu rapi lebih sering (mis. untuk laporan langsung dari database):
upgrade ke Vercel Pro dan kembalikan jadwal ke `*/5 * * * *` (ubah juga test di atas), atau
pakai penjadwal eksternal yang memanggil endpoint tiap 5 menit dengan `CRON_SECRET`.

- Opsi A: `vercel.json` berisi jadwal harian; Vercel mengirim `CRON_SECRET` otomatis.
  Vercel Cron dipakai untuk **Production** (cron Vercel hanya memanggil Production
  deployment). Staging di Preview **tidak** bergantung pada Vercel Cron untuk kebenaran
  kapasitas: reservasi kedaluwarsa tidak dihitung saat menghitung kapasitas, dan status
  order dirapikan secara lazy saat order dibuka. Bila staging perlu status yang rapi
  tanpa membuka order, panggil endpoint di atas secara manual dengan `CRON_SECRET` staging.
- Opsi B (crontab host; secret dibaca dari file env, tidak tertulis di crontab):

```cron
*/5 * * * * . /etc/enjua/cron.env && curl -fsS -m 30 -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/expire-reservations > /dev/null
```

## 5. Webhook pembayaran (Midtrans)

- Notification URL di dashboard Midtrans: `https://<domain>/api/webhooks/payments/midtrans`.
- Verifikasi: signature SHA-512 → status API Midtrans (sumber kebenaran) → idempotensi
  per event. Gagal verifikasi = 401; provider down = 503 (Midtrans akan retry).
- QRIS hanya dikonfirmasi lewat jalur ini (FD-111).

### Validasi sandbox (PRD §60) — **BLOCKED: menunggu server key sandbox**

1. Masukkan key sandbox (SB-…) ke secret staging, `PAYMENT_PROVIDER=midtrans`, `PAYMENT_ENV=sandbox`.
2. `npm run midtrans:smoke` dari mesin yang memegang key (charge QRIS kecil, cek status,
   cek signature, cancel). Tidak pernah dijalankan di CI.
3. Di staging publik: buat pesanan QRIS → bayar via simulator sandbox Midtrans →
   pastikan webhook masuk dan pesanan Dikonfirmasi; ulangi untuk gagal, expired, dan
   webhook ganda (kirim ulang notifikasi dari dashboard).
4. `npm run payments:reconcile` harus melaporkan 0 mismatch.

MockProvider **bukan** pengganti langkah di atas.

## 6. Storage

`STORAGE_DRIVER=s3` + dua bucket berbeda: publik (foto produk/kategori) dan privat
(bukti pembayaran, tidak pernah publik). Gambar publik tetap dilayani lewat
`/storage/<key>` (same-origin, CSP `img-src 'self'`); bukti hanya lewat
`/api/admin/files/<id>` untuk admin. Aktifkan versioning/backup bucket privat (§38).
`local` hanya untuk development atau satu server dengan volume persisten yang di-backup.

## 7. Urutan rilis

1. CI hijau di commit yang dirilis.
2. `npm run preflight -- --target=<env>` di environment target.
3. `npm run db:migrate` (koneksi langsung).
4. Deploy aplikasi; cek `GET /api/health` → `{"ok":true,"database":"ok"}`.
5. Smoke manual: beranda, katalog, checkout, lacak, login admin.
6. Sebelum go-live: `npm run check:go-live` (data klien GL-01…GL-12) dan checklist
   `docs/PRODUCTION-READINESS.md`.
