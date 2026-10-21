# Operasional — Komang SAC

Panduan setup, konfigurasi, dan deploy. Untuk penjelasan arsitektur, lihat
[ARSITEKTUR.md](ARSITEKTUR.md).

---

## 1. Setup (sekali saja)

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
.venv\Scripts\python.exe uvicorn main:app --reload --port 8001
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

Kredensial backend **tidak ada di repo publik**. Semuanya tinggal di repo
privat (`Komang_SAC_privat`), di folder `privat/` — dan folder itu diabaikan
`.gitignore` repo publik.

Cara tercepat di laptop baru:

```bash
git clone https://github.com/mhmmd-naufl/Komang_SAC.git
cd Komang_SAC
git clone https://github.com/mhmmd-naufl/Komang_SAC_privat.git privat
```

Folder `privat/` sekarang sudah berisi `.env` (kredensial backend) dan
`frontend.env` (variabel `VITE_*`).

Kalau `privat/.env` belum ada — misalnya repo privatnya belum ter-clone:

```bash
copy .env.example privat\.env   # Windows
cp .env.example privat/.env      # Linux/macOS
```

Lalu isi minimal:

```ini
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...   # WAJIB — bukan anon key
JWT_SECRET_KEY=<string acak>
```

Backend membacanya dari dua sumber, berurutan — **yang dimuat dulu menang**:

| Urutan | Sumber | Peran |
|---|---|---|
| 1 | `.env` di root | Override lokal per-PC (opsional, boleh tidak ada) |
| 2 | `privat/.env` | Kredensial utama, hasil clone repo privat |

Jadi kalau butuh menimpa satu nilai sementara (mis. key OpenRouter
beda), buat `.env` di root berisi **hanya** nilai itu — sisanya tetap
diambil dari `privat/.env`.

Opsional: `OPENROUTER_API_KEY` + `OPENROUTER_MODELS` untuk ringkasan AI. Tanpa
keduanya dashboard tetap jalan dengan ringkasan berbasis aturan.

> **Kenapa wajib `service_role`?** Backend memakai service-role key: key itu
> **melewati RLS** dan boleh menulis, sedangkan anon key tidak boleh menulis
> tabel yang RLS-nya aktif (saat ini `expenses`). Gejalanya kalau salah pakai
> anon key: `SELECT` tidak error tapi **balikin 0 baris** diam-diam, sedangkan
> `INSERT`/`UPDATE` **ditolak**. Gejalanya sangat membingungkan, jadi backend
> sekarang berhenti dengan pesan error kalau kunci ini belum diisi.

`service_role` hanya boleh ada di backend — **jangan pernah** ditaruh di
`frontend/` atau `.env` frontend. Frontend memakai anon key-nya sendiri lewat
`VITE_*` (lihat `frontend/.env.example`).

Buat `JWT_SECRET_KEY` dengan:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Kalau `privat/.env` masih berisi nilai placeholder, backend **akan berhenti**
saat start. Itu disengaja — JWT menandatangani sesi login, jadi secret yang
lemah berarti siapa pun bisa memalsukan token admin.

Atau pakai script bantu, yang menanyakan bagian yang kosong saja:

```bash
.venv\Scripts\python.exe setup_env.py
```

Script aman dijalankan berkali-kali: kalau `privat/.env` sudah ada, isinya
**tidak** ditimpa — hanya bagian yang masih kosong yang ditanyakan. Kalau
file-nya belum ada sama sekali, script membuatnya dari `.env.example` (dan
membuat folder `privat/` kalau belum ada).

Variabel frontend ada di `frontend/.env`. Setelah clone repo privat, salin
satu file itu:

```bash
copy privat\frontend.env frontend\.env
```

Isinya cuma `VITE_*` — bukan rahasia, tapi tetap perlu ada supaya frontend
tahu address backend-nya.

### 4. Set password admin

```bash
python bootstrap_admin.py
python bootstrap_admin.py 628980570911 "PasswordKuat123"
```

### 5. Isi data dummy (opsional, buat demo)

```bash
python seed_dummy.py
```

Membuat 1 admin, 3 teknisi, 1 drop point, 5 konsumen, 8 master layanan + harga,
7 item stock, dan 11 transaksi yang tersebar di 5 status — supaya dashboard,
filter, dan halaman tracking langsung kelihatan terisi.

### 6. Isi daftar harga asli (WAJIB sebelum dipakai)

```bash
python seed_pricelist.py --dry-run   # lihat dulu, tidak menulis apa pun
python seed_pricelist.py            # tulis 27 layanan asli Komang SAC
```

Mengisi 27 layanan dalam 3 kelompok katalog (Cuci Sepatu / Bag, Hat & Helmet /
Repaint & Reglue) beserta rentang harganya. Idempoten — aman dijalankan berulang,
dan tidak menimpa layanan yang sudah diubah manual dari panel admin.

> **Wajib dijalankan setelah `migrate.sql`**, karena script ini butuh kolom
> `harga_min`, `harga_max`, dan `kelompok` yang ditambahkan oleh migrasi.

Untuk menghapus data dummy (data asli tidak disentuh):

```bash
python seed_dummy.py --reset
```

### 7. Akun dan password

Password **tidak bisa dibaca balik** dari database — tersimpan sebagai hash
PBKDF2-SHA256.

Data akun demo dibuat oleh `seed_dummy.py`. Nomor HP dan password awal ikut
tertulis di file itu -- **jangan disalin ke dokumen publik**, karena daftar
kredensial ini pernah bocor sampai ke repo publik. Kalau butuh daftar akun
untuk login, cek langsung di database:

```bash
python manage_users.py list
```

| Nomor | Peran |
|---|---|
| `628980570911` | Admin |
| `628991000001` … `003` | Teknisi |
| `628981000001` | Konsumen |

Reset password kapan saja:

```bash
python manage_users.py reset 628980570911 "PasswordKuat123"
```

Di halaman `/login` saat `npm run dev`, ada blok **"Akun demo"** — klik salah
satu untuk mengisi nomor dan password otomatis. Blok itu dibungkus
`import.meta.env.DEV`, jadi **hilang total** di build produksi (sudah
diverifikasi: string kredensial tidak ada di dalam `dist/`).

> Ganti password admin sebelum sistem dipakai sungguhan.

### 8. Jalankan backend

```bash
uvicorn main:app --reload --port 8001
```

Cek `http://127.0.0.1:8001/health` — harus balas Supabase `terkoneksi`.
Dokumentasi interaktif: `http://127.0.0.1:8001/docs`

> **Kenapa port 8001?** Port 8000 dipakai aplikasi lain (VibeSift) di mesin
> yang sama. Kalau dua backend merebut satu port, frontend diam-diam memakai
> API yang salah dan gejalanya muncul sebagai "Not Found" yang menyesatkan.

### 9. Jalankan frontend

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

## 2. Referensi Environment Variable

Semua dibaca backend dari `privat/.env` (atau `.env` di root kalau mau
override lokal). Lihat `.env.example` untuk daftar lengkap
dengan komentar.

| Variabel | Wajib? | Fungsi |
|---|---|---|
| `SUPABASE_URL` | ya | URL project Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ya | Kunci tulis backend. Melewati RLS |
| `SUPABASE_SERVICE_KEY` | alias lama | Dipakai kalau variabel di atas kosong |
| `JWT_SECRET_KEY` | ya | Penanda tangan token login. Kalau kosong, backend berhenti |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | tidak | Masa berlaku token (default 7 hari) |
| `CLEANUP_TOKEN` | tidak | Token untuk endpoint internal TTL |
| `PHOTO_TTL_DAYS` | tidak | Retensi foto (default 7 hari) |
| `OPENROUTER_API_KEY` | tidak | Aktifkan ringkasan AI. Kosong = fallback aturan |
| `OPENROUTER_MODEL` | tidak | Satu model AI |
| `OPENROUTER_MODELS` | tidak | Daftar model cadangan, dicoba berurutan |
| `ACCEPTED_PAYMENTS` | tidak | Metode bayar yang diterima, mis. `tunai,qris` |
| `BUSINESS_*` | tidak | Nama, telepon, alamat, jam operasional |
| `TECHNICIAN_COMMISSION_PERCENT` | tidak | Persentase komisi teknisi |

Frontend punya variabel sendiri di `frontend/.env` — semuanya berawalan `VITE_`
dan otomatis ikut ter-*bundle* ke browser, jadi jangan pernah menaruh rahasia
di sana.

---

## 3. CI (GitHub Actions)

Workflow ada di [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). Jalan
otomatis setiap `push` ke `main`, setiap pull request, dan bisa dipicu manual
lewat tombol **Run workflow**.

Tiga job, diurut dari yang paling ringan:

| Job | Isi | Butuh secret? |
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
   | `JWT_SECRET_KEY` | sama persis dengan yang ada di `privat/.env` |
   | `SUPABASE_URL` | opsional; kalau kosong dipakai default project ini |
   | `BUSINESS_NAME` | opsional; nama bisnis yang tampil di halaman depan |
   | `BUSINESS_PHONE` | opsional; nomor WA outlet untuk pelanggan (tombol WA di form booking & halaman lacak status). Frontend punya fallback sendiri, jadi kosong pun tidak merusak tampilan. Kalau diisi, `test_api.py` ikut memastikan nomor itu tidak kosong di respons `/api/config` |
   | `OPENROUTER_API_KEY` | opsional; tanpa ini ringkasan AI otomatis jatuh ke fallback |

   Secret `BUSINESS_NAME` / `BUSINESS_PHONE` **tidak wajib**. Tanpa keduanya,
   test tetap jalan — yang diuji hanya kontraknya (`/api/config` memantulkan
   nilai `.env` apa adanya), bukan konfigurasi deploy.

3. Push lagi, atau jalankan workflow manual.

Secret tidak pernah ditulis ke log — hanya dibaca lewat `env:` lalu dipakai
untuk menyusun file `.env` sementara yang dihapus di step terakhir (`if:
always()`). `test_api.py` hanya **membaca** database (login + fetch), tidak
menulis apa pun.

> `SUPABASE_SERVICE_ROLE_KEY` punya akses penuh ke database dan **tidak bisa
> di-revoke** lewat dashboard. Kalau bocor, generate ulang key-nya di Supabase.

---

## 4. Sebelum Deploy

- [ ] Jalankan `migrate.sql` di Supabase (termasuk kolom `selesai_at`)
- [ ] Jalankan `python seed_pricelist.py` untuk mengisi 27 layanan asli
- [ ] Ganti `JWT_SECRET_KEY` di `privat/.env`
- [ ] Ganti password admin bawaan — `python manage_users.py reset 628980570911 "..."`
- [ ] Isi `BUSINESS_PHONE` di `privat/.env` — nomor WA outlet yang dipakai
      pelanggan untuk menghubungi (tombol WA di form booking dan di halaman
      lacak status). **Tidak wajib**: frontend punya fallback `WA_DEFAULT`
      di `BookingModal.jsx` dan `StatusTracker.jsx`, jadi link tetap jalan
      kalau env-nya kosong. Yang berubah hanya kalau kamu punya beberapa
      outlet dan ingin nomor per deployment berbeda.
- [ ] Tambahkan secret CI di GitHub (kalau mau uji database jalan di Actions)
- [ ] Isi `CLEANUP_TOKEN` di `.env` backend, lalu tambahkan secret `BACKEND_URL`
      dan `CLEANUP_TOKEN` di GitHub Actions supaya foto auto-hapus jalan
- [ ] **Aktifkan RLS** di Supabase (lihat bagian [7] di `migrate.sql`) — RLS
      saat ini baru aktif di tabel `expenses`, jadi anon key masih bisa membaca
      semua tabel
- [ ] Set `VITE_API_BASE_URL` untuk Vercel
- [ ] Import data master dari Excel (format ada di [data.md](data.md))

---

## 5. Perintah Sehari-hari

| Tujuan | Perintah |
|---|---|
| Cek kolom database | `python check_schema.py` |
| Audit endpoint terbuka | `python check_auth.py` |
| Uji endpoint + RBAC | `python test_api.py` |
| Lihat daftar akun | `python manage_users.py list` |
| Reset password | `python manage_users.py reset <no-hp> "<password>"` |
| Lint + build frontend | `cd frontend && npm run check` |

---

## 6. Migrasi ke Device Baru

Kredensial ikut ke device baru **tanpa perlu mengetik ulang**, karena ada
repo privat terpisah.

```bash
# 1. Clone repo publik
git clone https://github.com/mhmmd-naufl/Komang_SAC.git
cd Komang_SAC

# 2. Clone repo privat ke folder privat/
git clone https://github.com/mhmmd-naufl/Komang_SAC_privat.git privat

# 3. Frontend butuh variabel VITE_* (satu file)
copy privat\frontend.env frontend\.env
```

Selesai. `privat/.env` sudah terbaca backend otomatis — tidak ada yang perlu
diketik manual.

Langkah sisanya tetap seperti biasa:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cd frontend && npm install
```

Kalau `privat/.env` ternyata belum ada (mis. repo privatnya belum ter-clone
atau mau mulai dari nol), jalankan `setup_env.py` — dia akan membuat
`privat/.env` dari `.env.example` dan menanyakan bagian yang kosong.

Kalau di device baru kamu mau **key berbeda** dari yang ada di
`privat/.env` (mis. OpenRouter key sendiri), buat `.env` di root berisi
nilai itu saja. Backend memuat `.env` root lebih dulu, jadi isinya yang
menang, dan sisanya tetap diambil dari `privat/.env`.

---

## 7. Troubleshooting

| Gejala | Penyebab & solusi |
|---|---|
| Backend berhenti saat start: "JWT_SECRET_KEY belum diisi" | `privat/.env` belum ada / nilainya masih placeholder. Isi dengan `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| Backend berhenti: "SUPABASE_SERVICE_ROLE_KEY belum diisi" | Pakai anon key. Backend butuh service-role key |
| Semua data kosong padahal tabel ada | RLS + anon key. Backend harus pakai service-role key, bukan anon |
| Frontend "Not Found" padahal backend jalan | Port bentrok. Komang SAC pakai **8001**, bukan 8000 |
| Layar putih setelah edit | Jalankan `npm run lint` — biasanya ada variabel yang salah dihapus dari import |
| `PGRST100` saat mengetik di kolom pencarian | Bug sudah diperbaiki di backend; kalau muncul, pastikan versi terbaru |
| `PGRST103` saat pindah halaman | Bug sudah diperbaiki di backend (halaman di-clamp) |
| Foto tidak terhapus otomatis | Secret `BACKEND_URL` / `CLEANUP_TOKEN` belum diisi di GitHub Actions |
