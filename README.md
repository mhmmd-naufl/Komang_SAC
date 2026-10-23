# Komang SAC — Sistem Manajemen Cuci Sepatu

[![CI](https://github.com/mhmmd-naufl/Komang_SAC/actions/workflows/ci.yml/badge.svg)](https://github.com/mhmmd-naufl/Komang_SAC/actions/workflows/ci.yml)
[![Lisensi: MIT](https://img.shields.io/badge/Lisensi-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.142-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)

Aplikasi web operasional untuk bisnis cuci sepatu: pelanggan melacak status
cucian, teknisi mencatat progres dan foto, admin memantau omzet, stok, dan
komisi.

> Proyek nyata untuk usaha laundry lokal. Full-stack, **gratis di semua
> service-nya**, tanpa kartu kredit. Bahasa antarmuka: Indonesia.

---

## Fitur

| Peran | Kemampuan |
|---|---|
| **Pelanggan** | Katalog harga, booking multi-pasang, lacak status + foto, riwayat & profil |
| **Teknisi** | Daftar tugas, update status (wajib foto saat Selesai), catatan cacat, tender harga |
| **Admin** | Dashboard omzet/stok/komisi per periode, master layanan & harga, stok, pengeluaran, kelola user & mitra, ringkasan AI |
| **Mitra** | Terima antrean cucian, input transaksi, pantau transaksi outlet |

Alur status cucian: `Diterima → Diproses → Diperiksa → Selesai → Siap diambil`.
Booking bisa berisi beberapa pasang sekaligus (dihubungkan lewat `grup_id`).

---

## Arsitektur

```
  Browser (4 peran, 1 SPA)
            │  HTTPS · axios · JWT bearer
            ▼
  React 18 + Vite + Tailwind
  30 komponen · route dijaga per peran
            │  /api/*
            ▼
  FastAPI — main.py
  51 endpoint · JWT HS256 · RBAC per-field · slowapi
        ┌───┴──────────────────────┐
        ▼                          ▼
  analytics.py                Supabase
  angka deterministik         PostgreSQL (6 tabel)
  + narasi AI (opsional)      Storage (foto sepatu)
  + fallback aturan           RLS aktif di `expenses`
```

Frontend **tidak** memakai Supabase Realtime — semua lewat FastAPI, sehingga
seluruh aturan RBAC ditegakkan di satu tempat.

---

## Teknologi

| Layer | Pilihan | Alasan |
|---|---|---|
| Backend | Python 3.12 · FastAPI · Pydantic v2 | Async, tipe kuat, dokumentasi otomatis |
| Auth | JWT HS256 · PBKDF2-SHA256 | Tanpa dependency bcrypt |
| Database | Supabase PostgreSQL + RLS | Free tier, RLS jadi lapisan keamanan |
| Frontend | React 18 · Vite · Tailwind · react-router-dom | SPA cepat, guard route per peran |
| Rate limit | slowapi (in-memory) | Tanpa Redis, tetap gratis |
| AI | OpenRouter (model gratis) | Opsional, punya fallback deterministik |
| CI | GitHub Actions | 3 job: lint+build, compile, uji RBAC |

---

## Screenshot

> Placeholder — ganti dengan tangkapan layar asli.
>
> 1. Katalog harga (halaman depan, tanpa login)
> 2. Halaman lacak status transaksi
> 3. Dashboard admin — omzet, stok, grafik
> 4. Panel teknisi — daftar tugas + upload foto
>
> Simpan di `docs/img/` lalu rujuk seperti ini:
> `![Dashboard admin](docs/img/dashboard-admin.png)`

---

## Menjalankan

```bash
# 1. Backend
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt

# 2. Frontend
cd frontend && npm install && cd ..
```

```bash
# 3. Database — tempel schema.sql ke Supabase SQL Editor → Run
#    (punya database lama? pakai migrate.sql, aman diulang)

# 4. Konfigurasi
#    Kredensial backend tinggal di repo privat (folder privat/).
#    Di laptop baru:
#      git clone https://github.com/mhmmd-naufl/Komang_SAC_privat.git privat
#      copy privat\frontend.env frontend\.env
#    Kalau repo privat tidak tersedia, isi manual:
#      copy .env.example privat\.env
copy frontend\.env.example frontend\.env

# 5. Jalankan
.venv\Scripts\python.exe uvicorn main:app --reload --port 8001
cd frontend && npm run dev
```

Backend: <http://127.0.0.1:8001> · Frontend: <http://localhost:3000>

> Port **8001**, bukan 8000 — port 8000 dipakai aplikasi lain di mesin yang sama.
> Kalau dua backend merebut satu port, frontend diam-diam memakai API yang salah.

> **Kredensial tidak ada di repo ini.** Repo publik ini memang harus tetap
> publik, jadi `.env` backend disimpan di repo GitHub **Private**
> (`Komang_SAC_privat`) yang di-clone ke folder `privat/`. Backend membacanya
> otomatis; folder `privat/` di-ignore repo ini dan CI gagal kalau sampai
> ikut ter-commit. Detailnya di [docs/REPO-PRIVAT.md](docs/REPO-PRIVAT.md).

---

## Keputusan Teknis

- **RBAC per-field, bukan per-endpoint.** Field `harga` dan `tech_commission`
  dihapus dari respons untuk teknisi; `customer` (nama + nomor WhatsApp)
  dihapus untuk teknisi dan konsumen. Penarikan ini berlaku di *semua* endpoint
  yang mengembalikan transaksi — kalau ada satu yang lupa, teknisi bisa
  membaca komisi dari panel Network di DevTools.

- **Angka dashboard dihitung deterministik.** AI hanya menulis narasi dan
  saran, tidak pernah menyentuh angka, grafik, atau tabel. Semua dihitung di
  `analytics.py`. Kalau model mati atau kena rate limit, fallback berbasis
  aturan menggantikannya — jadi dashboard tidak pernah kosong hanya karena
  layanan AI sedang tidak sehat.

- **Free-tier first, tanpa kompromi keamanan.** Row Level Security di Supabase,
  rate limit in-memory (tanpa Redis), penghapusan foto otomatis lewat GitHub
  Actions. Nol biaya running.

- **Guard di CI.** Workflow gagal kalau `.env` atau folder `privat/` ikut
  ter-commit. Secret dibaca lewat `env:` dan tidak pernah ditulis ke log.

- **Rahasia tidak pernah menyentuh repo publik.** Kredensial backend disimpan
  di repo GitHub **Private** terpisah, di-clone ke folder `privat/` yang
  di-ignore. Bukan branch privat — history repo publik bisa bocor ke commit
  yang salah, dan mengoreksinya berarti rewrite history. Modularisasi
  kredensial jadi **repo kedua**, jadi memindahkannya ke device baru cuma
  `git clone`, tanpa ada yang perlu diketik ulang.

- **Laporan omzet dihitung dari tanggal *selesai*, bukan tanggal masuk.**
  Cucian yang masuk tanggal 31 dan selesai tanggal 2 adalah hasil bulan 2.

---

## Dokumentasi

Dokumentasi lengkap ada di folder [`docs/`](docs/):

| Dokumen | Isi |
|---|---|
| [PANDUAN-PENGGUNA.md](docs/PANDUAN-PENGGUNA.md) | Panduan pemakaian untuk konsumen, teknisi, mitra, & admin: login, booking, tracking, panel admin |
| [ARSITEKTUR.md](docs/ARSITEKTUR.md) | Model data, 51 endpoint, pagination, laporan, AI, rate limit, TTL foto |
| [OPERASIONAL.md](docs/OPERASIONAL.md) | Setup, environment variable, CI, deploy, troubleshooting |
| [REPO-PRIVAT.md](docs/REPO-PRIVAT.md) | Repo privat untuk file sensitif (kredensial, data) |
| [prd.md](docs/prd.md) | Spesifikasi fitur per role |
| [plan.md](docs/plan.md) | Roadmap + status implementasi |
| [design.md](docs/design.md) | Sistem desain UI |
| [blueprint.md](docs/blueprint.md) | Stack, pola skema, design token |
| [summary.md](docs/summary.md) | Ringkasan untuk partner |
| [data.md](docs/data.md) | Format intake data master |
| [HANDOVER.md](docs/HANDOVER.md) | Dokumen serah terima |
| [REVIEW_ROLE.md](docs/REVIEW_ROLE.md) | Review per role + rekomendasi upgrade |

---

## Lisensi

[MIT](LICENSE)
