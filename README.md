# Komang SAC — Sistem Manajemen Cuci Sepatu

Aplikasi web untuk operasional bisnis cuci sepatu: tracking status oleh pelanggan,
catatan & foto oleh teknisi, dashboard omzet & stok oleh admin.

Prinsip proyek: **Free Tier First** — tidak butuh kartu kredit.

---

## Struktur Project

```
main.py               Backend FastAPI (semua endpoint)
bootstrap_admin.py    Sekali jalan: set password admin
check_schema.py       Cek apakah kolom database sudah lengkap
check_auth.py         Audit: endpoint mana yang belum diproteksi auth
seed_dummy.py         Isi data dummy (konsumen, teknisi, transaksi, stock)
test_api.py           Uji endpoint + RBAC (in-process, tanpa server)
schema.sql            DDL untuk instalasi database BARU
migrate.sql           Untuk database yang sudah ada (aman diulang)
requirements.txt      Dependency Python
.env.example          Template konfigurasi

frontend/             React + Vite + Tailwind
  src/components/    Navbar, Catalog, BookingModal, StatusTracker, LoginModal,
                     AdminDashboard, Toast
  src/contexts/      AuthContext
  src/services/      api.js (axios + interceptor)
  src/utils/         helpers.js (formatRupiah, formatDate, getStatusConfig)

blueprint.md          Stack, pola skema, design token
prd.md                Spesifikasi fitur per role
plan.md               Roadmap + status implementasi
design.md             Sistem desain UI
summary.md            Ringkasan untuk partner
data.md               Format intake data master dari Google Form

content-planner/      Proyek TERPISAH (content planner media sosial) — akan dipindahkan
```

---

## Setup (sekali saja)

> Semua perintah backend di bawah memakai `.venv`. **Jangan** pakai `pip install`
> global — itu bikin bentrok versi dengan project lain di komputer kamu.
> `.venv/` sudah masuk `.gitignore`.

### 1. Virtual environment + dependency

```bash
python -m venv .venv
```

Aktifkan dulu (per shell):

```bash
.venv\Scripts\activate            # Windows PowerShell / CMD
source .venv/bin/activate         # macOS / Linux / Git Bash
```

Lalu install:

```bash
pip install -r requirements.txt
```

Kalau tidak ingin aktivasi tiap kali, panggil langsung:

```bash
.venv\Scripts\python.exe uvicorn main:app --reload
```

### 2. Siapkan database

- **Database baru?** Buka Supabase → SQL Editor → tempel seluruh isi `schema.sql` → Run.
- **Database sudah ada?** Tempel seluruh isi `migrate.sql` → Run. Aman dijalankan berulang.

`migrate.sql` juga mengisi drop point, admin, dan stock awal secara idempoten.

Verifikasi hasilnya:

```bash
python check_schema.py
```

Kalau semua baris keluar "lengkap", database sudah siap dipakai.

### 3. Konfigurasi env

```bash
copy .env.example .env      # Windows
cp .env.example .env        # Linux/macOS
```

Lalu isi minimal:

```ini
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...   # WAJIB — bukan anon key
JWT_SECRET_KEY=<string acak>
```

> **Kenapa wajib `service_role`?** RLS di proyek ini sudah aktif di semua tabel.
> Effectnya kalau backend pakai anon key: `SELECT` tidak error tapi **balikin 0 baris**
> diam-diam (data selalu terlihat kosong), sedangkan `INSERT`/`UPDATE` **ditolak**.
> Gejalanya sangat membingungkan, jadi backend sekarang berhenti dengan pesan error
> kalau kunci ini belum diisi.

`service_role` melewati RLS, jadi **key ini hanya boleh ada di backend** — jangan
pernah ditaruh di `frontend/` atau `.env` frontend. Frontend memakai anon key-nya
sendiri lewat `VITE_*` (lihat `frontend/.env.example`).

Buat `JWT_SECRET_KEY` dengan:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Kalau `.env` masih berisi nilai placeholder, backend **akan berhenti** saat start.
Itu disengaja — JWT menandatangani sesi login, jadi secret yang lemah berarti siapa
pun bisa memalsukan token admin.

### 4. Set password admin

```bash
python bootstrap_admin.py
python bootstrap_admin.py 628980570911 "PasswordKuat123"
```

### 4b. Isi data dummy (opsional, buat demo)

```bash
python seed_dummy.py
```

Membuat 1 admin, 3 teknisi, 1 drop point, 5 konsumen, 8 master layanan + harga,
7 item stock, dan 11 transaksi yang tersebar di 5 status — supaya dashboard,
filter, dan halaman tracking langsung kelihatan terisi.

Password semua akun dummy: `password123`

| Nomor | Peran |
|---|---|
| `628980570911` | Admin |
| `628991000001` … `003` | Teknisi |
| `628981000001` | Konsumen |

Untuk menghapus data dummy (data asli tidak disentuh):

```bash
python seed_dummy.py --reset
```

### 5. Jalankan backend

```bash
uvicorn main:app --reload
```

Cek `http://127.0.0.1:8000/health` — harus balas Supabase `terkoneksi`.
Dokumentasi interaktif: `http://127.0.0.1:8000/docs`

### 6. Jalankan frontend

```bash
cd frontend
npm install
copy .env.example .env      # sesuaikan VITE_API_BASE_URL
npm run dev
```

Buka `http://localhost:3000`

Script yang tersedia:

| Script | Fungsi |
|---|---|
| `npm run dev` | server dev dengan HMR |
| `npm run lint` | ESLint saja — menangkap variabel tak terdefinisi |
| `npm run build` | build produksi ke `dist/` |
| `npm run check` | lint + build (**jalankan sebelum commit**) |

> `no-undef` di ESLint itu penting: di era JS tanpa TypeScript, salah hapus import
> tidak caught oleh `vite build` — aplikasi crash saat render dan layarnya putih.

---

## Endpoint Penting

| Method       | Path                             | Auth          | Keterangan                                                     |
| ------------ | -------------------------------- | ------------- | -------------------------------------------------------------- |
| GET          | `/health`                        | —             | Cek koneksi database                                           |
| POST         | `/api/auth/register`             | —             | Daftar sebagai pelanggan                                       |
| POST         | `/api/auth/login`                | —             | Login, dapat token JWT                                         |
| GET          | `/api/auth/me`                   | JWT           | Profil user aktif                                              |
| POST         | `/api/auth/set-password`         | JWT           | Set/ganti password                                             |
| GET          | `/api/sepatu`                    | —             | Katalog harga publik (`aktif_only=true` by default)            |
| GET          | `/api/sepatu/{id}`               | —             | Detail satu layanan                                            |
| GET          | `/api/drop-points`               | —             | Lokasi mitra publik                                             |
| GET          | `/api/drop-points/{id}`          | —             | Detail satu mitra                                              |
| GET          | `/api/transaksi/tracking/{kode}` | —             | Cek status publik (`KS-XXXXXX`)                                |
| POST         | `/api/transaksi`                 | JWT           | Buat booking. Konsumen = atas namanya sendiri                  |
| GET          | `/api/transaksi`                 | JWT           | Konsumen: miliknya. Teknisi: tugasnya. Admin/mitra: semua      |
| GET          | `/api/transaksi/{id}`            | JWT           | Hanya pemilik/teknisi/admin                                    |
| PUT          | `/api/transaksi/{id}/status`     | teknisi/admin  | Update status. Wajib `photo_after` untuk Selesai/Siap diambil   |
| GET          | `/api/stats/admin`               | admin         | Agregat dashboard                                              |
| POST/PUT/    | `/api/sepatu`                    | admin         | Kelola master layanan & harga                                  |
| DELETE       | `/api/sepatu/{id}`               | admin         | Hapus layanan                                                  |
| GET          | `/api/stock`                     | admin/teknisi | `?low_stock=true` untuk item menipis                            |
| GET          | `/api/stock/{id}`                | admin/teknisi | Detail item stok                                               |
| POST/PUT     | `/api/stock`                     | admin         | Tambah/ubah stok                                               |
| POST         | `/api/stock/{id}/kurangi`        | admin/teknisi | Kurangi stok saat pakai bahan                                  |
| GET          | `/api/users?role=technician`     | admin         | Daftar user per role                                           |
| GET/PUT      | `/api/users/{id}`                | admin         | Detail/ubah user                                               |
| POST         | `/api/users`                     | admin         | Buat user                                                      |
| POST/PUT     | `/api/drop-points`               | admin         | Kelola mitra                                                    |

Cek ulang tabel ini tiap backend berubah:

```bash
python check_auth.py
```

Script itu gagal (exit 1) kalau ada endpoint non-publik yang lupa diproteksi.

---

## Sebelum Deploy

- [ ] Jalankan `migrate.sql` di Supabase
- [ ] Ganti `JWT_SECRET_KEY` di `.env`
- [ ] Ganti password admin bawaan
- [ ] **Aktifkan RLS** di Supabase (lihat catatan di `schema.sql`) — anon key sekarang
      masih bisa membaca semua tabel
- [ ] Set `VITE_API_BASE_URL` untuk Vercel
- [ ] Import data master dari Excel (format ada di `data.md`)

---

_Folder `content-planner/` adalah proyek terpisah dan akan dipindahkan keluar dari repo ini._
