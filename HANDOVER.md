# Dokumen Serah Terima — Komang SAC

> **Sistem Manajemen Cuci Sepatu**  
> Full-stack: Python (FastAPI) + React (Vite) + Supabase (PostgreSQL)

---

## 1. Yang Diterima (Include)

| No | Item | Keterangan |
|----|------|------------|
| 1 | **Source Code Lengkap** | Backend (Python) + Frontend (React) + Database schema |
| 2 | **Deployment** | Frontend di Vercel, Backend di Railway, Database di Supabase |
| 3 | **Database Schema** | `schema.sql` (baru) atau `migrate.sql` (existing) |
| 4 | **Dokumentasi** | README.md lengkap dengan panduan setup |
| 5 | **Pendampingan** | 1-2 minggu bantuan kalau ada masalah |
| 6 | **Revisi** | Maksimal 3x revisi setelah serah terima |
| 7 | **Tutorial** | Cara maintain & operasional dasar |

---

## 2. Yang Tidak Include (Exclude)

| No | Item | Keterangan |
|----|------|------------|
| 1 | **Maintenance jangka panjang** | Bisa dibayar lagi per bulan |
| 2 | **Fitur baru** | Nego terpisah |
| 3 | **Hosting cost** | Vercel/Supabase/Railway free tier (tanggungan penerima) |
| 4 | **Domain** | Tanggungan penerima |
| 5 | **Revisi unlimited** | Maksimal 3x |
| 6 | **Training tim** | Hanya pendampingan dasar |

---

## 3. Quick Setup Guide

### Backend (Python)

```bash
# 1. Clone repo
git clone <repo-url>
cd KomangSAC

# 2. Setup virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
source .venv/bin/activate       # Linux/Mac

# 3. Install dependencies
pip install -r requirements.txt

# 4. Setup .env
cp .env.example .env
# Isi: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET_KEY

# 5. Setup database (di Supabase SQL Editor)
# Jalankan: schema.sql (database baru)
# Atau: migrate.sql (database existing)

# 6. Set password admin
python bootstrap_admin.py

# 7. Jalankan
uvicorn main:app --reload
```

### Frontend (React)

```bash
cd frontend
npm install
cp .env.example .env
# Isi: VITE_API_BASE_URL
npm run dev
```

### Deployment

| Platform | Untuk | Langkah |
|----------|-------|---------|
| **Vercel** | Frontend | Import repo → Set `VITE_API_BASE_URL` → Deploy |
| **Railway** | Backend | Import repo → Set `.env` → Deploy |
| **Supabase** | Database | Buat project → Jalankan `schema.sql` |

---

## 4. Akun Default

| Peran | Nomor WhatsApp | Password |
|-------|----------------|----------|
| **Admin** | `628980570911` | `password123` |
| **Teknisi** | `628991000001` | `password123` |
| **Konsumen** | `628981000001` | `password123` |

> **PENTING:** Ganti password admin sebelum dipakai sungguhan!

---

## 5. Fitur Utama

| Fitur | Keterangan |
|-------|------------|
| **Booking System** | Konsumen bisa booking cuci sepatu |
| **Tracking Status** | Konsumen bisa lacak status cucian + foto sebelum/sesudah |
| **Admin Dashboard** | Omzet, stok, transaksi, analytics, performa per teknisi |
| **Manajemen Teknisi** | Assign tugas, tracking komisi, filter & evaluasi per teknisi |
| **Manajemen Stok** | Alat & bahan, alert stok menipis |
| **Pengeluaran** | Catat biaya operasional |
| **Multi-pasang** | Booking beberapa pasang sekaligus |
| **Laporan** | Bulanan/tahunan, export CSV |
| **Kirim Invoice WhatsApp** | Satu klik dari daftar transaksi: status + invoice jadi satu pesan |
| **Reset Password via Admin** | Lupa password? Admin ganti langsung, tanpa email atau tautan reset |
| **Panel Teknisi** | Ringkasan selesai hari ini / bulan ini, catatan ke admin, cari kode |
| **Panel Mitra Drop Point** | Ringkasan masuk hari ini, cari & filter, tombol WhatsApp pelanggan |

---

## 6. Struktur Folder

```
KomangSAC/
├── main.py               # Backend FastAPI
├── analytics.py          # Ringkasan AI + fallback
├── bootstrap_admin.py    # Setup password admin
├── manage_users.py       # Kelola user
├── check_schema.py       # Cek database
├── check_auth.py         # Audit keamanan
├── seed_dummy.py         # Data dummy (opsional)
├── seed_pricelist.py     # Data harga layanan
├── schema.sql            # Database baru
├── migrate.sql           # Database existing
├── requirements.txt      # Dependency Python
├── .env.example          # Template konfigurasi
│
├── frontend/             # React + Vite
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── contexts/     # Auth context
│   │   ├── hooks/        # Custom hooks
│   │   ├── services/     # API service
│   │   └── utils/        # Helper functions
│   └── package.json
│
└── README.md             # Dokumentasi lengkap
```

---

## 7. Environment Variables

### Backend (.env)

```ini
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
JWT_SECRET_KEY=<string-acak>
OPENROUTER_API_KEY=...          # Opsional (untuk AI summary)
OPENROUTER_MODELS=...           # Opsional
BUSINESS_NAME=Komang SAC
BUSINESS_PHONE=081234567890
BUSINESS_HOURS=09.00-20.00 WIB
ACCEPTED_PAYMENTS=tunai,transfer,qris
```

### Frontend (frontend/.env)

```ini
VITE_API_BASE_URL=http://localhost:8000
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

---

## 8. Kontak & Support

| Hal | Keterangan |
|-----|------------|
| **Pendampingan** | 1-2 minggu setelah serah terima |
| **Revisi** | Maksimal 3x |
| **Bug fixing** | Gratis selama masa pendampingan |
| **Fitur baru** | Nego terpisah |

---

## 9. Checklist Sebelum Serah Terima

- [ ] Database sudah setup (schema.sql / migrate.sql)
- [ ] Password admin sudah diganti
- [ ] Data harga layanan sudah diisi (seed_pricelist.py)
- [ ] Frontend sudah bisa build tanpa error
- [ ] Backend sudah bisa jalan tanpa error
- [ ] Deployment sudah live (Vercel + Railway + Supabase)
- [ ] Akun demo sudah bisa login
- [ ] README.md sudah dibaca

---

## 10. Lisensi

Proyek ini menggunakan lisensi **MIT**. Bebas digunakan, dimodifikasi, dan didistribusikan.

---

**Selamat menggunakan! Semoga bisnisnya sukses.**
