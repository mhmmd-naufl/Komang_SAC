# summary.md

Komang SAC — Ringkasan Proyek Sistem Manajemen Cuci Sepatu

## Ringkasan

Aplikasi web berbasis **gratis (free tier)** untuk mengelola operasi cuci sepatu,
dengan 4 peran: **Admin, Pelanggan, Teknisi, dan Drop-point**.

**Tujuan utama:** memudahkan pelanggan melacak status (&ldquo;sudah jadi apa?&rdquo;) tanpa
harus bertanya ke admin, memberi admin satu layar untuk omzet + stok, dan membiarkan
teknisi fokus pada pekerjaan lapangan.

## Peran & Kewajiban

| Peran | Yang Bisa Dilakukan |
|---|---|
| **Admin** | Kelola master layanan & harga, lihat pendapatan & shoes washed,-atur komisi teknisi (50% otomatis), monitoring stok bahan/alat, kelola pengguna & drop point |
| **Pelanggan** | Daftar, pilih layanan, booking dengan catatan, cek status **Diterima → Diproses → Diperiksa → Selesai → Siap diambil**, kabari admin via WhatsApp |
| **Teknisi** | Update status, upload **2 foto (Before/After)**, catat defect. **Tidak ada tampilan komisi/laba di aplikasinya** |
| **Drop-point** | Terima titipan, lihat antrian drop point-nya, majukan status |

## Aturan Bisnis yang Disepakati

* **Komisi teknisi = 50% dari harga terpasang**, dihitung otomatis dan disimpan saat
  transaksi dibuat, sehingga tidak berubah retroactive.
* **Hanya 2 foto per transaksi**: sebelum & sesudah. Tidak ada foto proses.
* **Syarat selesai:** `photo_after` wajib ada sebelum status boleh Selesai/Siap diambil.
* **Notifikasi WhatsApp semi-manual** — sistem bikin template, admin klik, kirim sendiri
  dari WhatsApp. **Tidak memakai WhatsApp API** sehingga tetap gratis.
* **Palette biru & putih saja** (tanpa indigo).

## Stack Teknologi

* **Backend:** Python FastAPI + Supabase (PostgreSQL, Auth, Storage, Realtime — semua free tier, tanpa kartu kredit)
* **Frontend:** React + Vite + Tailwind CSS
* **Deploy:** Vercel (frontend) + Supabase (seluruh data & layanan)

## Data yang Masih Dibutuhkan

Lihat `data.md` untuk format lengkap:

1. Profil usaha (nama, alamat, kontak)
2. **Master layanan + price list** — merk, model, harga, jenis treatment, keterangan
3. Data drop-point
4. Stock awal alat & bahan
5. Profil admin (nama, nomor WhatsApp)

## Status Saat Ini

* Database 5 tabel sudah dibuat di Supabase
* Backend FastAPI CRUD + auth JWT + endpoint tracking sudah jalan
* Frontend React sudah terbangun dan bisa dijalankan (`npm run dev`)
* Modul admin (CRUD lengkap, upload foto, laporan, tombol WhatsApp) masih dikerjakan

## Langkah Selanjutnya

1. Jalankan `migrate.sql` di Supabase SQL Editor
2. Jalankan `bootstrap_admin.py` untuk membuat password admin
3. Kirim file Excel data master sesuai format di `data.md`
4. Lanjutkan Phase 3: halaman CRUD admin + halaman teknisi

---

*Arsitektur "Free Tier First" — tidak butuh kartu kredit. Semua berjalan di Supabase + Vercel.*
