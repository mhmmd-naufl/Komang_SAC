# prd.md (Product Requirements Document) — Komang SAC

> Status per Oktober 2026. Dokumen ini describing **kebutuhan**; status implementasi
> nyata ada di `plan.md`. Yang bertanda ✅ sudah ada di kode, yang belum ditandai begitu.

## 1. Product Overview

**Komang SAC** adalah sistem manajemen bisnis cuci sepatu berbasis web. Setiap titip
sepatu menghasilkan satu transaksi yang bisa dilacak pelanggan dari statuses
**Diterima → Diproses → Diperiksa → Selesai → Siap diambil**, sekaligus menjadi data
untuk laporan pendapatan, komisi teknisi, dan monitoring stok bahan.

**Arsitektur:** frontend React (Vite + Tailwind) di Vercel (free tier), backend FastAPI,
seluruh penyimpanan di **Supabase** (PostgreSQL + Auth + Storage + Realtime, free tier
tanpa kartu kredit). Tidak ada layanan berbayar yang wajib aktif.

## 2. Target Audience (User Personas)

* **Konsumen** — pemilik sepatu yang mau cuci tanpa ribet. Butuh: lihat harga, pilih
  treatment, titip di drop point, dan **tahu statusnya tanpa harus tanya admin**.
* **Admin (pemilik)** — butuh satu layar untuk tahu: berapa omzet, berapa Shoes washed,
  berapa komisi per teknisi, dan bahan apa yang mau habis.
* **Teknisi** — fokus kerja lapangan: ambil antrian, ganti status, upload foto
  sebelum/sesudah, catat temuan. **Tidak perlu melihat angka komisi.**
* **Drop Point** — mitra toko yang menerima titipan. Perlu: catat penerimaan, lihat
  antrian yang terkait drop point-nya, lalu laporkan ke admin.

## 3. Core Features — per Role

### 3.1 Konsumen

* ✅ **Katalog layanan** — grid merk/model + harga + jenis treatment
  (`GET /api/sepatu?aktif_only=true`).
* ✅ **Booking 2 langkah** — pilih treatment, drop point, metode bayar, dan tulis
  **catatan untuk teknisi** (`POST /api/transaksi`).
* ✅ **Nomor tracking** — tiap transaksi dapat kode `KS-XXXXXX` (huruf ambigu
  I/O/0/1 sengaja tidak dipakai supaya mudah dibaca/dibacakan lewat telepon).
* ✅ **Cek status tanpa akun** — `GET /api/transaksi/tracking/{kode}` menampilkan
  progres, catatan yang ditulis pelanggan, lokasi pengambilan, dan tombol kabari admin.
* ⬜ **Realtime tanpa refresh** — butuh Supabase Realtime di frontend (sudah disiapkan
  di `.env.example`, belum diaktifkan).
* ⬜ **Unduh foto hasil** — pelanggan bisa lihat foto `photo_after` sebagai bukti.

### 3.2 Admin

* ✅ **Auth JWT** — `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`,
  `POST /api/auth/set-password`. Password di-hash PBKDF2-SHA256 (200.000 iterasi).
* ✅ **Dashboard** — `GET /api/stats/admin`: shoes washed, total pendapatan, jumlah
  transaksi, komisi per teknisi, sebaran status, dan daftar stok menipis.
* ✅ **CRUD master sepatu** — merk, model, `harga_cuci`, `jenis_treatment`,
  `keterangan_treatment`, status aktif.
* ✅ **CRUD drop point** dan **CRUD pengguna** (terlindungi role admin).
* ✅ **CRUD stok** dengan peringatan `jumlah <= batas_minimum`, dan endpoint
  `POST /api/stock/{id}/kurangi` saat teknisi memakai bahan.
* ✅ **Kontrol status transaksi** — `PUT /api/transaksi/{id}/status`. Teknisi wajib
  menyertakan `photo_after` (baru maupun yang sudah tersimpan) sebelum status boleh
  **Selesai** atau **Siap diambil**.
* ✅ **Komisi teknisi otomatis** — `tech_commission = harga // 2`, tersimpan saat transaksi
  dibuat sehingga tidak ikut berubah bila harga master diedit.
* ⬜ **Notifikasi WhatsApp semi-manual** — sistem membangkitkan template pesan, admin
  klik → membuka `wa.me` → admin kirim sendiri. **Tanpa WhatsApp API.**
* ⬜ **Export Excel/CSV** untuk laporan.

### 3.3 Teknisi

* ✅ **Update status** mengikuti alur 5 tahap.
* ✅ **Catatan servicing** — `defect_notes` untuk cacat bawaan yang ditemukan.
* ✅ **Dua foto saja** — `photo_before` dan `photo_after`. **Tidak ada foto proses**,
  sesuai kesepakatan.
* ✅ **Komisi dihitung otomatis** oleh sistem.
* ⬜ **Halaman antrian teknisi** — UI khusus `/teknisi` dengan daftar kerjaannya.
* ⬜ **Upload foto** dengan kompresi ke 2 MB + hapus otomatis 7–30 hari
  (Supabase Storage TTL belum dikonfigurasi).

> **Keputusan desain:** tampilan teknisi **tidak menampilkan komisi**. Angka
> `tech_commission` tetap dihitung dan disimpan supaya bisa dipakai untuk laporan
> admin, tapi tidak pernah ditampilkan ke teknisi.

### 3.4 Drop Point

* ✅ Data drop point sudah ada di `drop_points` dan terhubung ke transaksi.
* ⬜ Halaman `/drop-point` untuk menerima titipan baru + advancing status.
* ⬜ Riwayat lokal per drop point.

## 4. Reports

* ✅ `/api/stats/admin` — agregat dasar (pendapatan, Shoes washed, komisi per teknisi).
* ⬜ Grafik pendapatan bulanan + top treatment.
* ⬜ Laporan stok bahan terpakai.
* ⬜ Export CSV untuk Excel / Looker Studio.

> **Tidak ada fitur AI di aplikasi ini.** Semua analytics cukup dihitung langsung
> dari database agar tetap gratis dan tidak bergantung pada API pihak ketiga.
> (Pemakaian AI hanya ada di proyek terpisah `content-planner/` untuk konten media sosial.)

## 5. Non-Functional Requirements

* **Harus gratis sampai deploy.** Tanpa Railway/Render yang menagih kartu kredit.
* **Tanpa WhatsApp API** — semi-manual via `wa.me`.
* **Foto** maksimal 2 MB, hapus otomatis 7–30 hari lewat Supabase Storage TTL
  (kuota 1 GB ≈ 500–1000 foto).
* **Palet hanya biru & putih.** Netral `slate`, primer `blue`, sukses `emerald`,
  peringatan `amber`, bahaya `rose`. **Tidak ada indigo.**
* **Bahasa UI Indonesia.**
* **Keamanan** — ✅ JWT + PBKDF2; ⬜ RLS Supabase masih belum aktif (lihat catatan di
  `schema.sql`), ⬜ belum ada rate limiting.

## 6. Out of Scope

* Multi-cabang & multi-outlet.
* Integrasi pembayaran online (bayar di tempat).
* Auto-post ke media sosial.
* Aplikasi mobile native.

## 7. Data Model

| Tabel | Isi | Kolom kunci |
|---|---|---|
| `profiles` | Admin, Konsumen, Teknisi, Drop Point | `full_name`, `phone`, `password_hash`, `role`, `is_verified` |
| `shoes` | Master layanan + price list | `merk`, `model`, `harga_cuci`, `jenis_treatment`, `keterangan_treatment`, `status` |
| `drop_points` | Outlet + mitra | `nama`, `alamat`, `wa_contact`, `aktif` |
| `transactions` | Transaksi cuci | `kode`, `user_id`, `shoe_id`, `tech_id`, `drop_point_id`, `harga`, `tech_commission`, `status`, `catatan_konsumen`, `defect_notes`, `photo_before`, `photo_after` |
| `stock` | Alat & bahan cuci | `nama_item`, `tipe` (alat/bahan), `jumlah`, `satuan`, `batas_minimum`, `supplier`, `harga_beli` |

**Enum status:** `Diterima` · `Diproses` · `Diperiksa` · `Selesai` · `Siap diambil`
**Enum treatment:** `Standar` · `Premium` · `Steri` · `Waterproof`
**Enum role:** `admin` · `customer` · `technician` · `drop_point`

DDL lengkap: `schema.sql` (instalasi baru) · `migrate.sql` (database yang sudah ada).

---

* Sumber: kesepakatan bersama klien Komang SAC. Lihat `summary.md` untuk ringkasan
bisnisnya dan `data.md` untuk format data master dari Google Form.*
