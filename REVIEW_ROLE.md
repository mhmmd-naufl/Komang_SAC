# Review Role — Komang SAC

> Dokumen ringkasan review per role dan rekomendasi upgrade fitur

---

## 1. Role Teknisi

### Konfigurasi
- **Jumlah teknisi:** 3 orang
- **Device:** HP (Android/iOS)
- **Offline mode:** Perlu dipertimbangkan
- **Komisi:** Cukup jumlah pasang (tanpa rupiah)

### Fitur yang Sudah Ada
| Fitur | Keterangan |
|-------|------------|
| Login | Nomor WA + password |
| Lihat Tugas | Daftar transaksi yang diassign |
| Update Status | Diterima → Diproses → Diperiksa → Selesai → Siap diambil |
| Upload Foto | Before, after, defect |
| Catat Defect | Catatan kerusakan sepatu |
| Kurangi Stok | Pakai bahan → stok otomatis berkurang |
| Lihat Riwayat | Pekerjaan yang sudah selesai |

### Fitur yang Dibatasi (Sengaja)
| Dibatasi | Alasan |
|----------|--------|
| Tidak lihat harga | Fokus kerja, bukan angka financials |
| Tidak lihat komisi | Menghindari kecemasan/ketidakpuasan |
| Tidak lihat kontak pelanggan | Privasi customer |

### Rekomendasi Upgrade
| Prioritas | Fitur | Keterangan |
|-----------|-------|------------|
| **Tinggi** | Dashboard sederhana | "Hari ini: 5 pasang, Bulan ini: 45 pasang" |
| **Tinggi** | Mobile-friendly | Responsive, tombol besar, upload foto dari kamera |
| **Sedang** | Catatan ke admin | Untuk kasus khusus (misal: sol lepas) |
| **Sedang** | Filter riwayat | Per periode, search kode |
| **Opsional** | Offline mode | Cache data, upload saat online |
| **Opsional** | Notifikasi tugas baru | Auto-refresh tiap 30 detik |

---

## 2. Role Admin

### Konfigurasi
- **Fokus utama:** Performa per teknisi
- **Target/budget:** Menu opsional
- **Invoice:** Sederhana, digabung dengan notif WA "siap diambil"
- **Akses mobile:** Perlu
- **Prioritas:** Pencatatan & manajerial

### Fitur yang Sudah Ada
| Fitur | Keterangan |
|-------|------------|
| Dashboard | Omzet, transaksi, stok, komisi teknisi, sisa bersih |
| Manajemen Layanan | CRUD sepatu, harga, estimasi hari |
| Manajemen Transaksi | Lihat semua, filter, finalisasi harga |
| Manajemen Stok | CRUD, alert stok menipis |
| Manajemen User | CRUD, reset password |
| Manajemen Drop Point | CRUD mitra |
| Pengeluaran | Catat biaya operasional, rekap mingguan |
| Laporan | Bulanan/tahunan, export CSV |
| Analytics | Ringkasan AI + fallback, grafik tren |
| Assign Teknisi | Tugas ke teknisi tertentu |
| Multi-pasang | Lihat booking grup |

### Rekomendasi Upgrade
| Prioritas | Fitur | Keterangan |
|-----------|-------|------------|
| **Tinggi** | Performa per teknisi | Jumlah pasang, komisi, tren bulanan |
| **Tinggi** | Mobile-friendly admin | Bisa dibuka di HP |
| **Tinggi** | Notif WA + invoice sederhana | Kirim "pesanan siap diambil" + invoice teks |
| **Sedang** | Perbandingan periode | Bulan ini vs bulan lalu |
| **Sedang** | Filter teknisi | Evaluasi kinerja per teknisi |
| **Sedang** | Bulk action | Update status massal |
| **Opsional** | Target omzet | Set target bulanan, lihat progress |
| **Opsional** | Budget pengeluaran | Set budget, alert kalau over |
| **Opsional** | Export PDF | Invoice/resi untuk customer |

### Fitur Notif WA + Invoice (Sederhana)
```
Alur:
1. Admin update status → "Siap diambil"
   ↓
2. Sistem otomatis kirim WA ke customer:
   ┌─────────────────────────────────┐
   │  Halo [Nama],                   │
   │  Pesanan [Kode] siap diambil!   │
   │                                 │
   │  📋 Invoice:                    │
   │  Layanan: Deep Cleaning         │
   │  Harga: Rp 50.000               │
   │  Status: Lunas                   │
   │                                 │
   │  Terima kasih! 🙏               │
   └─────────────────────────────────┘
   ↓
3. Customer datang → tukar dengan sepatu
```

---

## 3. Role Konsumen

### Fitur yang Sudah Ada
| Fitur | Keterangan |
|-------|------------|
| Register | Nomor WA + password |
| Login | Nomor WA + password |
| Lihat Katalog | Daftar layanan & harga |
| Booking | Pilih layanan, drop point, metode bayar |
| Multi-pasang | Booking beberapa pasang sekaligus |
| Tracking Status | Lacak status cucian (publik, tanpa login) |
| Riwayat Booking | Lihat semua pesanan |
| Estimasi Hari | Lihat estimasi selesai |
| Akun | Lihat profil, ganti password |
| Drop Point | Lihat lokasi mitra |

### Rekomendasi Upgrade
| Prioritas | Fitur | Keterangan |
|-----------|-------|------------|
| **Tinggi** | Foto progres | Lihat foto sebelum & sesudah dari teknisi |
| **Tinggi** | Reset password via admin | Paling sederhana & gratis |
| **Sedang** | Foto referensi layanan | Pakai logo dulu, nanti ganti foto asli |
| **Sedang** | Estimasi real-time | Berdasarkan antrean |
| **Opsional** | Pembatalan booking | Via admin atau sistem |
| **Opsional** | Invoice PDF | Bisa via WA saja |
| **Opsional** | Simpan keranjang | Booking nanti |
| **Opsional** | Peta lokasi drop point | Visual, tapi tidak wajib |

### Catatan Khusus
- **Notif WA status:** Skip, cukup di web
- **Foto layanan:** Pakai logo biru (`/assets/logo-biru.png`) untuk sekarang
- **Pembatalan:** Bisa via admin dulu, fitur sistem nanti

---

## 4. Role Drop Point

### Fitur yang Sudah Ada
| Fitur | Keterangan |
|-------|------------|
| Login | Nomor WA + password |
| Lihat Transaksi | Semua transaksi yang masuk ke drop pointnya |
| Kontak Customer | Lihat nama + nomor WA customer |
| Detail Transaksi | Lihat status, layanan, harga |
| Profil | Lihat profil, ganti password |

### Rekomendasi Upgrade
| Prioritas | Fitur | Keterangan |
|-----------|-------|------------|
| **Tinggi** | Filter & search transaksi | By status, tanggal, kode tracking |
| **Tinggi** | Deep link WA | Langsung chat customer |
| **Sedang** | Dashboard ringkasan | Jumlah transaksi hari ini |
| **Sedang** | Edit profil | Update info sendiri |
| **Opsional** | Export CSV | Rekap manual |
| **Opsional** | Foto drop point | Branding |

### Catatan Khusus
- **Lihat omzet:** Skip, cukup jumlah transaksi
- **Update status:** Skip, hanya lihat (admin yang update)
- **Chat WA langsung:** Skip, bisa salin manual
- **Export data:** Skip, tidak perlu

---

## 5. Ringkasan Prioritas Semua Role

| Role | Prioritas Utama | Status |
|------|-----------------|--------|
| **Teknisi** | Dashboard sederhana, mobile-friendly, catatan ke admin | ✅ Review selesai |
| **Admin** | Performa teknisi, notif WA + invoice, mobile-friendly | ✅ Review selesai |
| **Konsumen** | Foto progres, reset password via admin | ✅ Review selesai |
| **Drop Point** | Lihat transaksi, kontak customer, filter & search | ✅ Review selesai |

---

## 6. Estimasi Harga Update

Berdasarkan fitur-fitur yang sudah direview:

| Kategori | Estimasi |
|----------|----------|
| **Harga Pasaran** | Rp 7.000.000 – Rp 20.000.000 |
| **Harga Teman** | Rp 3.500.000 – Rp 10.000.000 |
| **Harga "Siap Pakai"** | Rp 5.000.000 – Rp 12.000.000 |
| **Harga Teman Ngerintis** | Rp 1.500.000 – Rp 3.000.000 |

### Faktor Penentu:
1. Full-stack (Backend + Frontend + Database)
2. Deployment ready (Vercel + Supabase + Railway)
3. Fitur lengkap (Booking, Admin, Tracking, Analytics, Stok, Pengeluaran)
4. Mobile-friendly
5. Notif WA + invoice sederhana
6. Performa per teknisi

---

## 7. Checklist Implementasi

### Teknisi
- [x] Dashboard sederhana (jumlah pasang) — kartu "Selesai hari ini" & "Selesai bulan ini", dihitung dari `selesai_at` (WIB)
- [x] Mobile-friendly — sudah responsif (grid 2→3→6 kolom, tombol besar, upload foto dari galeri/kamera HP)
- [x] Catatan ke admin — textarea per pekerjaan, disimpan ke kolom `defect_notes` (tampil sebagai "Catatan teknisi" di layar admin)
- [x] Filter riwayat — pencarian kode tracking + filter status yang sudah ada

### Admin
- [x] Performa per teknisi — kartu "Performa Teknisi" (pasang, komisi, kontribusi %, total)
- [x] Mobile-friendly — sudah responsif; sidebar jadi menu hamburger di layar kecil
- [x] Notif WA + invoice sederhana — satu pesan WA berisi status + invoice; tombol per baris & di modal detail
- [x] Perbandingan periode — badge tren untuk omzet **dan** jumlah pekerjaan vs periode sebelumnya
- [x] Filter teknisi — dropdown di halaman Transaksi (termasuk "Belum ditugaskan"), ikut saat ekspor CSV

### Konsumen
- [x] Foto progres (sebelum & sesudah) — sudah ada di StatusTracker dan halaman Akun
- [x] Reset password via admin — endpoint `POST /api/users/{id}/reset-password` + tombol gembok di halaman Pengguna
- [x] Logo layanan (sudah implementasi) — `logo-biru.png` di katalog & BookingModal

### Drop Point
- [x] Filter & search transaksi — sudah ada (search + filter status)
- [x] Deep link WA — sudah ada (template pesan siap diambil)
- [x] Dashboard ringkasan — tambah kartu "Masuk hari ini" di samping ringkasan status

### Sengaja tidak dikerjakan (di luar lingkup harga teman)
- Offline mode (butuh service worker + strategi sinkronisasi)
- Notifikasi tugas baru / auto-refresh 30 detik
- Target omzet, budget pengeluaran, ekspor PDF
- Tren bulanan per teknisi (pakai filter teknisi + rentang tanggal di halaman Transaksi)

---

## 8. Catatan Teknis untuk Serah Terima

Perubahan yang menyentuh backend:

| File | Perubahan |
|------|-----------|
| `main.py` | Endpoint `POST /api/users/{user_id}/reset-password` (admin-only) |
| `main.py` | Filter `tech_id="null"` di `GET /api/transaksi` diarahkan ke `is_()` — PostgREST membedakan string `"null"` dari SQL NULL |
| `main.py` | `selesai_at` hanya diisi saat status **benar-benar berubah**, sesuai komentar yang sudah ada. Sebelumnya menyimpan catatan pada pekerjaan Selesai bisa menulis ulang tanggal selesai dan memindahkan pekerjaan lama ke omzet bulan berjalan |
| `analytics.py` | `perubahan_transaksi_persen` + `periode_lalu_transaksi` untuk badge tren jumlah pekerjaan |

Perubahan frontend: `TeknisiPage`, `AdminDashboard`, `AdminTransaksi`, `AdminUsers`, `DropPointPage`, `utils/periode.js` (helper `tanggalWib`), `services/api.js`.

**Zona waktu:** semua hitungan "hari ini" memakai `tanggalWib()` dari `utils/periode.js` (UTC+7), karena `created_at`/`selesai_at` disimpan dalam UTC.

**Cara verifikasi:** `npm run check` di `frontend/` (lint + build) dan `python -m py_compile main.py analytics.py`.

---

**Dokumen ini dibuat berdasarkan review role yang dilakukan pada 8 Oktober 2026.**
