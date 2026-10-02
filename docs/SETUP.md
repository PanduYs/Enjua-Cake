# Setup — Enjua Cake's (Phase 1 Foundation)

Teknis lengkap: `IMPLEMENTATION-PLAN.md`. Requirement: `PRD.md`, `PRD-Design.md`, `FINAL-REQUIREMENT-DECISIONS.md`.

## Prasyarat

- Node.js 22+
- PostgreSQL 16 (lokal via `docker compose up -d`, atau instance sendiri)

## Langkah

```bash
npm ci
cp .env.example .env.local        # isi AUTH_SECRET, MOCK_PAYMENT_WEBHOOK_SECRET, SEED_ADMIN_PASSWORD
docker compose up -d              # PostgreSQL lokal (opsional)
set -a; . ./.env.local; set +a    # muat env untuk script CLI
npm run db:migrate                # terapkan migration di ./drizzle
npm run db:seed-admin             # buat admin pertama (development saja)
npm run db:seed-sample            # katalog CONTOH + gambar placeholder (development saja)
npm run dev                       # http://localhost:3000/admin/login
```

`AUTH_SECRET`: minimal 32 karakter acak, mis. `openssl rand -base64 32`.

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run lint` | ESLint (termasuk aturan batas layer domain) |
| `npm run typecheck` | TypeScript strict |
| `npm run test:unit` | Unit test (tanpa database) |
| `npm run test:integration` | Integration test dengan PostgreSQL asli |
| `npm run build` | Build production |
| `npm run db:generate` | Generate migration SQL setelah mengubah `src/server/db/schema` |
| `npm run db:migrate` | Terapkan migration |
| `npm run db:seed-admin` | Buat admin dari `SEED_ADMIN_*` (ditolak di production) |
| `npm run db:seed-sample` | Kategori & produk contoh berlabel "Contoh" (`-- --reset` untuk mengosongkan katalog & settings dulu) |
| `npm run test:e2e` | Playwright + axe + matrix responsive (butuh `npm run build` dan `E2E_DATABASE_URL`) |

### Integration test

Butuh database sekali pakai — **isinya dihapus setiap run**:

- `TEST_DATABASE_URL=postgres://…/enjua_test npm run test:integration`, atau
- tanpa `TEST_DATABASE_URL`: Testcontainers menjalankan `postgres:16` (butuh Docker).

### E2E

```bash
npm run build
E2E_DATABASE_URL=postgres://…/enjua_e2e npm run test:e2e
```

Database E2E **dihapus dan di-seed ulang** setiap run. Chromium: `npx playwright install chromium`,
atau set `PW_CHROMIUM_EXECUTABLE` ke Chromium yang sudah terpasang.

## Aturan penting

- Jangan pernah commit `.env*` selain `.env.example`; secret production hanya di dashboard hosting.
- Ubah skema hanya lewat `src/server/db/schema` + `npm run db:generate`; CI menolak skema tanpa migration.
- `src/server/domain` harus murni (tanpa framework/ORM/provider) — dijaga ESLint.
- Payment provider Phase 1 hanya `mock`; `PAYMENT_ENV=production` dengan mock ditolak saat startup.
- Storage saat ini hanya driver `local` (folder `.storage/`, di-ignore git); file publik disajikan lewat `/storage/...`.
- Konten bisnis (alamat, WhatsApp, jam) dibaca dari Website Settings; yang belum diisi klien disembunyikan, tidak dikarang.
