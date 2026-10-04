# Production Readiness — Phase 8

Status keseluruhan: **PRE-DEPLOYMENT.** Semua pekerjaan teknis yang tidak membutuhkan
credential, data klien, atau keputusan hosting sudah selesai dan teruji. Peluncuran
production **tidak boleh** dilakukan sampai seluruh item B dan C selesai.

Alat verifikasi: `npm run preflight -- --target=production|staging` (env),
`npm run check:go-live` (data klien), `GET /api/health`, `npm run midtrans:smoke`
(sandbox), `npm run payments:reconcile`.

## A. READY (teknis, terverifikasi)

| Area | Status |
|---|---|
| Build production | `next build` hijau; varian standalone (Opsi B) dijalankan lokal: health, CSP, redirect admin OK |
| Environment | Validasi saat runtime (`src/server/env.ts`) + preflight per target; template `.env.production.example` tanpa nilai asli |
| Secret | Tidak ada secret di repo/bundle; tidak ada `NEXT_PUBLIC_` sensitif (dicek preflight); log menyamarkan secret/token |
| Database | Schema sinkron; migrasi forward-only, guard destruktif di CI, advisory lock saat migrasi; pool dapat diatur; kompatibel pooler |
| Transaksi & lock | Lock tanggal (kapasitas), lock order → transaksi (pembayaran); tes konkurensi & race lulus |
| Storage | Driver `local` + `s3` (S3-compatible, diuji terhadap server S3); bucket publik/privat wajib berbeda |
| Pembayaran (kode) | Adapter Midtrans (sandbox/production), webhook terverifikasi + status API + idempotensi; MockProvider ditolak di production |
| Cron | Endpoint Bearer constant-time; Vercel Cron 1×/hari (batas Hobby, `vercel.json`) — kebenaran kapasitas lewat lazy expiry; crontab contoh Opsi B tiap 5 menit |
| Auth/sesi | Argon2id, rate limit login, idle 8 j/absolut 7 h, revokasi sesi, proteksi admin terakhir, CLI admin production-safe |
| Keamanan HTTP | CSP nonce, HSTS, X-Frame-Options, nosniff, Referrer-Policy, cookie HttpOnly/Secure/SameSite, batas body API |
| Tracking | Token 256-bit di-hash, cookie bertanda tangan, rate limit, tanpa kebocoran ke URL/HTML/WhatsApp/log |
| Cache & indexing | Halaman privat `no-store` + `noindex`; `robots.txt` menutup /admin, /api, /checkout, /lacak, /pesanan |
| Observability | Log JSON + `onRequestError` dengan kode referensi; `GET /api/health` untuk uptime monitor |
| Zona waktu | Semua aturan bisnis memakai Asia/Jakarta secara eksplisit; tes lulus di TZ server lain |
| Dokumentasi | `docs/DEPLOYMENT.md`, `docs/RUNBOOK.md`, `docs/PHASE7-SECURITY-AUDIT.md` |

## B. BLOCKED — credential / data dari manusia

| Item | Dibutuhkan dari | Catatan |
|---|---|---|
| Server key **sandbox** Midtrans | Anda / klien (akun Midtrans) | Untuk validasi sandbox PRD §60 (`npm run midtrans:smoke` + uji simulator). Simpan di secret staging, jangan di chat/repo |
| Merchant **production** Midtrans + onboarding QRIS (GL-10) | Klien | Server key production hanya di secret hosting production |
| Database production & staging (connection string) | Keputusan hosting → Anda | Setelah TD-17 diputuskan |
| Bucket storage + access key (publik & privat) | Keputusan hosting → Anda | Supabase Storage (Opsi A) atau R2/S3 (Opsi B) |
| Domain + DNS (`APP_URL`) | Klien | Juga untuk Notification URL Midtrans |
| `AUTH_SECRET`, `CRON_SECRET` | Anda (dibuat acak per environment) | `openssl rand -base64 48` |
| Data bisnis GL-01…GL-08, GL-11, GL-12 | Klien | Logo, produk & foto asli, alamat, WhatsApp, rekening, media sosial, jam operasional/pickup, cutoff final, tautan kebijakan, copy marketing. Diisi lewat admin; `check:go-live` melaporkan yang kurang |
| Akun admin pemilik usaha | Klien (email) | Dibuat dengan `npm run admin -- create` |

## C. BLOCKED — keputusan bisnis / hosting

| Keputusan | Pemilik |
|---|---|
| **TD-17 Hosting**: Opsi A (Vercel Pro + Supabase) atau Opsi B (VPS + Docker) — termasuk biaya | Anda / klien |
| **Kebijakan pembatalan & refund (FD-61, GL-09)** — sistem hanya mencatat refund | Klien |
| Kepatuhan data pribadi (UU 27/2022, kebijakan privasi, kemungkinan pendaftaran PSE) — risiko R10 | Klien / penasihat hukum |

## D. OPTIONAL / post-launch

- Error monitoring eksternal (`SENTRY_DSN`, opsional di plan §37).
- Uptime monitor yang memanggil `/api/health`.
- Rate limit tambahan di level hosting untuk webhook bertanda tangan salah; job retensi `payment_webhook_events`.
- Pembaruan `drizzle-kit` saat tidak lagi bergantung pada `@esbuild-kit` (advisory dev-only, lihat audit Phase 7).
- Uji restore berkala (per kuartal) dan latihan runbook.

## Langkah go-live (setelah B & C selesai)

1. Staging: env → `preflight --target=staging` → migrate → deploy → UAT klien + validasi sandbox Midtrans (DEPLOYMENT.md §5) → uji restore backup.
2. Production: env → `preflight --target=production` → migrate → deploy → health → buat admin pemilik → isi Website Settings & katalog asli → `check:go-live` tanpa MISSING/SAMPLE_DATA → nonaktifkan akun uji → Notification URL Midtrans production → cron aktif → persetujuan go-live klien.
