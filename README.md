# Komang SAC — Sistem Manajemen Cuci Sepatu

[![CI](https://github.com/mhmmd-naufl/Komang_SAC/actions/workflows/ci.yml/badge.svg)](https://github.com/mhmmd-naufl/Komang_SAC/actions/workflows/ci.yml)
[![Lisensi: MIT](https://img.shields.io/badge/Lisensi-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.142-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)

Aplikasi web untuk operasional bisnis cuci sepatu: tracking status oleh pelanggan,
catatan & foto oleh teknisi, dashboard omzet & stok oleh admin.

Prinsip proyek: **Free Tier First** — tidak butuh kartu kredit.

> Badge CI hijau berarti: frontend lolos lint + build, semua file Python lolos
> compile, dan `.env` tidak ikut ter-commit. Uji endpoint terhadap database
> Supabase ikut jalan kalau secret sudah diisi (lihat [CI](#ci-github-actions)).

---

## Struktur Project

```
main.py               Backend FastAPI (semua endpoint)
analytics.py          Ringkasan AI (OpenRouter) + fallback berbasis aturan
bootstrap_admin.py    Sekali jalan: set password admin
manage_users.py       Lihat daftar akun + reset password
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
                     LogoutConfirm, AnalyticsSummary, AdminDashboard,
                     TeknisiPage, DropPointPage, CustomerAccount,
                     Pagination, AdminUi, Toast
  src/components/admin/
                     AdminShoes, AdminTransaksi, AdminStock, AdminUsers
  src/contexts/      AuthContext
  src/hooks/         useTabel.js (paginasi + filter + debounce pencarian)
  src/services/      api.js (axios + interceptor + ambilBerpaginan)
  src/utils/         helpers.js (formatRupiah, formatDate, getStatusConfig),
                     csv.js (ekspor CSV + ambil semua hasil filter)

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

### 5. Akun dan password

Password **tidak bisa dibaca balik** dari database — tersimpan sebagai hash
PBKDF2-SHA256. Yang penting saat login adalah password yang **sama** dengan
yang di-hash, jadi untuk testing cukup pakai akun di bawah:

| Peran | Nomor WhatsApp | Password |
|---|---|---|
| Admin | `628980570911` | `password123` |
| Teknisi | `628991000001` | `password123` |
| Teknisi | `628991000002` | `password123` |
| Teknisi | `628991000003` | `password123` |
| Drop point | `628991000004` | `password123` |
| Konsumen | `628981000001` | `password123` |
| Konsumen | `628981000002` | `password123` |
| Konsumen | `628981000003` | `password123` |
| Konsumen | `628981000004` | `password123` |
| Konsumen | `628981000005` | `password123` |

Di halaman `/login` saat `npm run dev`, ada blok **"Akun demo"** — klik salah
satu untuk mengisi nomor dan password otomatis. Blok itu dibungkus
`import.meta.env.DEV`, jadi **hilang total di build produksi** (sudah
diverifikasi: string kredensial tidak ada di dalam `dist/`).

Lihat semua akun dan reset password kapan saja:

```bash
python manage_users.py                          # daftar semua akun
python manage_users.py list technician          # filter per role
python manage_users.py reset 628980570911 "PasswordKuat123"
```

> Ganti password admin sebelum sistem dipakai sungguhan.

### 6. Jalankan backend

```bash
uvicorn main:app --reload
```

Cek `http://127.0.0.1:8000/health` — harus balas Supabase `terkoneksi`.
Dokumentasi interaktif: `http://127.0.0.1:8000/docs`

### 7. Jalankan frontend

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
> **tidak ditangkap** oleh `vite build` — aplikasi lolos build, lalu crash saat
> render dan layarnya putih. That's the exact bug yang pernah terjadi di proyek ini.

---

## Endpoint Penting

| Method       | Path                             | Auth          | Keterangan                                                     |
| ------------ | -------------------------------- | ------------- | -------------------------------------------------------------- |
| GET          | `/health`                        | —             | Cek koneksi database                                           |
| POST         | `/api/auth/register`             | —             | Daftar sebagai pelanggan                                       |
| POST         | `/api/auth/login`                | —             | Login, dapat token JWT                                         |
| GET          | `/api/auth/me`                   | JWT           | Profil user aktif                                              |
| POST         | `/api/auth/set-password`         | JWT           | Set/ganti password                                             |
| GET          | `/api/sepatu`                    | —             | Katalog harga publik. `?aktif_only=false` melihat nonaktif     |
| GET          | `/api/sepatu/{id}`               | —             | Detail satu layanan                                            |
| GET          | `/api/drop-points`               | —             | Lokasi mitra publik                                             |
| GET          | `/api/drop-points/{id}`          | —             | Detail satu mitra                                              |
| GET          | `/api/transaksi/tracking/{kode}` | —             | Cek status publik (`KS-XXXXXX`)                                |
| POST         | `/api/transaksi`                 | JWT           | Buat booking. Konsumen = atas namanya sendiri                  |
| GET          | `/api/transaksi`                 | JWT           | Konsumen: miliknya. Teknisi: tugasnya. Admin/mitra: semua      |
| GET          | `/api/transaksi/{id}`            | JWT           | Hanya pemilik/teknisi/admin                                    |
| PUT          | `/api/transaksi/{id}/status`     | teknisi/admin  | Update status. Wajib `photo_after` untuk Selesai/Siap diambil   |
| GET          | `/api/stats/admin`               | admin         | Agregat dashboard                                              |
| GET          | `/api/analytics/summary`         | admin         | Ringkasan AI + angka agregat (fallback otomatis)               |
| POST/PUT/    | `/api/sepatu`                    | admin         | Kelola master layanan & harga                                  |
| DELETE       | `/api/sepatu/{id}`               | admin         | Hapus layanan. 409 kalau masih dipakai transaksi                |
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

### Aturan privasi yang ditegakkan backend

Beberapa field sengaja **tidak pernah dikirim** ke peran tertentu, jadi tidak
bisa dibaca meski lewat DevTools:

| Peran | Yang dihapus | Alasan |
|---|---|---|
| teknisi | `harga`, `tech_commission` | Teknisi fokus pada pekerjaan, bukan angka financials |
| teknisi | `customer` (nama + nomor) | Daftar telepon pelanggan tidak boleh ada di perangkat teknisi |
| konsumen | `customer` | Itu datanya sendiri, tidak ada gunanya dikirim ulang |
| drop point | — | Melihat seluruh transaksi memang tugasnya, termasuk kontak untuk mengabari |

Penaringan ini berlaku di **semua** endpoint yang mengembalikan transaksi,
termasuk `PUT /api/transaksi/{id}/status` — bukan hanya di daftar dan detail.
Kalau ada satu endpoint yang lupa, teknisi bisa membaca komisi dari panel
Network di DevTools.

---

## Paginasi

Empat halaman admin (Sepatu, Transaksi, Stok, Pengguna) memakai format yang
sama:

| Parameter | Arti |
|---|---|
| `page` | Nomor halaman, mulai dari 1 |
| `per_page` | Jumlah baris per halaman, maks 200 |
| `q` | Pencarian teks (lihat tabel di bawah) |

Respons tetap berupa **JSON list biasa**, supaya katalog publik dan halaman
status tidak ikut berubah. Jumlah total dikirim di header HTTP:

| Header | Isi |
|---|---|
| `X-Total-Count` | Total baris hasil filter |
| `X-Total-Pages` | Jumlah halaman |
| `X-Page` | Halaman yang benar-benar disajikan |
| `X-Per-Page` | Baris per halaman yang dipakai |

Dua hal penting soal ini:

- **Halaman di-clamp.** Kalau `page` di luar jangkauan, backend mengembalikan
  halaman terakhir yang valid (bukan error). PostgREST melempar
  `PGRST103` kalau offset melewati jumlah baris; tanpa clamp, admin yang
  sedang di halaman 5 lalu_LOW_ tanpa sengaja akan membuat seluruh panel error.
- **Nilai kosong dibuang.** `?q=&status=` tidak pernah dikirim, supaya
  `q` berisi spasi tidak memicu pencarian sia-sia. Nilai boolean `false`
  sengaja **tidak** ikut dibuang, karena `aktif_only=false` berarti
  "jangan pakai default" — membuangnya membuat tab "Nonaktif" diam-diam
  menampilkan semua data aktif.

`expose_headers` di `main.py` wajib diisi agar browser bisa membaca header
tersebut dari JavaScript. Tanpa itu, server mengirimnya tapi JavaScript tetap
melihat `undefined`.

| Endpoint | `q` mencari di |
|---|---|
| `/api/sepatu` | `merk`, `model` |
| `/api/transaksi` | `kode` (nomor tracking) |
| `/api/stock` | `nama_item` |
| `/api/users` | `full_name`, `phone` |
| `/api/drop-points` | `nama`, `alamat` |

Nilai pencarian dibungkus tanda kutip ganda sebelum dikirim ke PostgREST.
Tanpa itu, mengetik `60 (besar)` merusak logic tree-nya dan seluruh
permintaan gagal dengan `PGRST100`.

Filter tambahan: `status`, `urut`, `dari`/`sampai` (transaksi), `tipe`,
`low_stock` (stok), `role` (pengguna), `aktif_only` + `cari_status`
(sepatu, drop point).

### Dua filter status yang sering tertukar

`/api/sepatu` punya dua cara memfilter status, dan bedanya penting:

| Yang dikirim | Arti | Dipakai oleh |
|---|---|---|
| *(tidak ada apa-apa)* | hanya yang **aktif** (default endpoint) | katalog publik |
| `aktif_only=false` | **semua**, aktif dan nonaktif | panel admin, tab "Semua" |
| `aktif_only=true` | hanya yang aktif | panel admin, tab "Aktif" |
| `cari_status=false` | hanya yang **nonaktif** | panel admin, tab "Nonaktif" |

Karena `aktif_only` default-nya `True`, panel admin **wajib** mengirim
`aktif_only=false` — kalau tidak, master yang dinonaktifkan tidak akan pernah
tampak dan tidak bisa dihidupkan kembali.

> `low_stock` sengaja difilter lewat daftar id, bukan di Python. Kalau
> filtering dilakukan setelah data diambil, `X-Total-Count` jadi tidak sinkron
> dengan isi halaman — panel melaporkan "2 item" padahal ada 8, dan halaman 2
> tampak kosong padahal masih ada isi.

---

## Ringkasan AI (OpenRouter)

Panel admin menampilkan analisis 14 hari terakhir: tren omzet, layanan
terlaris, beban kerja per teknisi, stok kritis, dan pekerjaan yang tertahan.

Dua jalur, dan UI selalu memberi tahu yang mana yang dipakai:

| `sumber` | Kapan dipakai | Hasil |
|---|---|---|
| `ai` | `OPENROUTER_API_KEY` ada dan panggilan berhasil | Naratif seperti tulisan analis |
| `fallback` | Key kosong, model habis kuota (429), timeout, atau model dihapus dari katalog | Ringkasan deterministik dari `analytics.py`, tanpa jaringan |
| `error` | Backend gagal menghitung (mis. kolom berubah) | Panel angka tetap tampil, naratif diganti pesan error |

Jadi halaman dashboard **tidak pernah kosong** hanya karena layanan AI sedang
tidak sehat. Fallback butuh nol konfigurasi.

Aktifkan dengan isi `OPENROUTER_API_KEY` di `.env` (gratis, ambil di
<https://openrouter.ai/keys>). Model default `nvidia/nemotron-3-super-120b-a12b:free`
— kalau habis kuota, ganti ke model lain dari daftar
<https://openrouter.ai/models?q=:free>.

Yang dikirim ke OpenRouter **hanya angka agregat**: jumlah transaksi, omzet,
status, nama layanan, sisa stok. Kode transaksi, nomor telepon, dan nama orang
tidak pernah ikut. Endpoint-nya admin-only, dan `test_api.py` memverifikasi
kelima hal tersebut.

---

## CI (GitHub Actions)

Workflow ada di [`.github/workflows/ci.yml`](.github/workflows/ci.yml). Jalan
otomatis setiap `push` ke `main`, setiap pull request, dan bisa dipicu manual
lewat tombol **Run workflow**.

Tiga job, diurut dari yang paling ringan:

| Job |_isi_ | Butuh secret? |
|---|---|---|
| `frontend` | `npm ci` → ESLint → `vite build` | tidak |
| `backend-compile` | `py_compile` semua file Python + verifikasi `.env` tidak ter-commit | tidak |
| `backend-tests` | `check_schema.py`, `check_auth.py`, `test_api.py` | ya — di-*skip* kalau secret kosong |

Job `backend-tests` sengaja tidak gagal kalau secret belum diisi — dia
menampilkan notifikasi "Test database dilewati" dan sisanya tetap hijau. Ini
supaya repo tidak pernah merah hanya karena secret belum disiapkan, dan tetap
aman untuk fork yang tidak punya akses ke database.

### Mengaktifkan uji database (opsional)

1. Buka **Settings → Secrets and variables → Actions → New repository secret**
2. Tambahkan:

   | Nama secret | Isi |
   |---|---|
   | `SUPABASE_SERVICE_ROLE_KEY` | service role key dari Supabase → Project Settings → API |
   | `JWT_SECRET_KEY` | sama persis dengan yang ada di `.env` lokal |
   | `SUPABASE_URL` | opsional; kalau kosong dipakai default project ini |
   | `OPENROUTER_API_KEY` | opsional; tanpa ini ringkasan AI otomatis jatuh ke fallback |

3. Push lagi, atau jalankan workflow manual.

Secret tidak pernah ditulis ke log — hanya dibaca lewat `env:` lalu dipakai
untuk menyusun file `.env` sementara yang dihapus di step terakhir (`if:
always()`). `test_api.py` hanya **membaca** database (login + fetch), tidak
menulis apa pun.

> `SUPABASE_SERVICE_ROLE_KEY` punya akses penuh ke database dan **tidak bisa
> di-revoke** lewat dashboard. Kalau bocor, generate ulang key-nya di Supabase.

---

## Sebelum Deploy

- [ ] Jalankan `migrate.sql` di Supabase
- [ ] Ganti `JWT_SECRET_KEY` di `.env`
- [ ] Ganti password admin bawaan — `python manage_users.py reset 628980570911 "..."`
- [ ] Tambahkan secret CI di GitHub (kalau mau uji database jalan di Actions)
- [ ] **Aktifkan RLS** di Supabase (lihat catatan di `schema.sql`) — anon key sekarang
      masih bisa membaca semua tabel
- [ ] Set `VITE_API_BASE_URL` untuk Vercel
- [ ] Import data master dari Excel (format ada di `data.md`)

---

_Folder `content-planner/` adalah proyek terpisah dan akan dipindahkan keluar dari repo ini._
