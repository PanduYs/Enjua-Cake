# Runbook Operasional — Enjua Cake's

Prosedur insiden (IMPLEMENTATION-PLAN §38–§39). Log aplikasi berupa JSON per baris di
stdout/stderr hosting; token, password, secret, cookie, nomor HP/email disamarkan.
Error di halaman menampilkan **kode referensi** = `digest` di log `request_error`.

## Pemeriksaan cepat
- `GET /api/health` → 200 `{"ok":true}`; 503 berarti database tidak terjangkau.
- Log `payment_webhook` (status/outcome), `cron_expire_reservations` (jumlah expired),
  `payment_provider_create_qris_failed`, `request_error`.

## Restore database
1. Hentikan sementara trafik tulis (maintenance) atau naikkan instance baru.
2. Restore backup/PITR penyedia ke database baru; uji di staging bila memungkinkan.
3. Arahkan `DATABASE_URL` ke database hasil restore; jalankan `npm run db:migrate`.
4. Jalankan `npm run payments:reconcile -- --days=<rentang insiden>`; untuk setiap
   MISMATCH, kirim ulang notifikasi dari dashboard Midtrans (diproses webhook terverifikasi).
5. Cek dashboard admin: Payment Exception, bukti menunggu verifikasi.
Target usulan: RPO ≤ 24 jam (atau menit dengan PITR), RTO ≤ 4 jam.

## Rotasi secret
- `AUTH_SECRET`: ganti di hosting → redeploy. Semua sesi admin dan sesi lacak
  pelanggan berakhir (pelanggan memasukkan ulang nomor + kode akses; kode akses tetap berlaku).
- `CRON_SECRET`: ganti di hosting dan di sumber cron bersamaan.
- `MIDTRANS_SERVER_KEY`: buat key baru di dashboard Midtrans → ganti di hosting → redeploy → cabut key lama.
- Kredensial storage: buat access key baru → ganti → redeploy → cabut yang lama.
- Password database: rotasi di penyedia → perbarui `DATABASE_URL` → redeploy.
Catat setiap rotasi (tanggal, oleh siapa) di luar repositori.

## Payment gateway down
- Pelanggan melihat "Layanan pembayaran sedang bermasalah"; tidak ada pembayaran yang
  ditandai berhasil (EC-13). Webhook dibalas 503 agar provider mengulang.
- Reservasi tetap berjalan sesuai aturan (tidak diperpanjang). Setelah pulih:
  `npm run payments:reconcile`.

## Webhook gagal massal
1. Cek log `payment_webhook` status 401 (signature/kunci salah — periksa
   `MIDTRANS_SERVER_KEY` sesuai `PAYMENT_ENV`) atau 503 (status API tidak terjangkau).
2. Perbaiki penyebab, lalu kirim ulang notifikasi dari dashboard Midtrans.
3. `npm run payments:reconcile` hingga exit code 0 (≥1 dicek, 0 mismatch, 0 unchecked; window kosong → `--allow-empty`). Pembayaran yang tiba setelah pesanan
   kedaluwarsa otomatis menjadi Payment Exception (FD-107/118) — tangani di /admin/pembayaran.

## Storage tidak tersedia
- Gambar publik mengembalikan 503 (dengan `Retry-After`); upload bukti/foto gagal dengan
  pesan umum. Tidak ada data pesanan yang berubah. Pulihkan kredensial/endpoint lalu redeploy.

## Admin terkunci / lupa password
- Admin lain: /admin/akun → Reset Password.
- Tidak ada admin aktif: `npm run admin -- reset-password --email=<email>` dengan akses DB production.

## Cron tidak berjalan
- Kapasitas tetap benar (lazy expiry). Status di dashboard mungkin tertinggal; jalankan
  manual: `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/expire-reservations`.
