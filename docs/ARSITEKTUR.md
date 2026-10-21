# Arsitektur — Komang SAC

Dokumen ini menjelaskan bagian dalam sistem secara mendetail. Untuk gambaran
singkat dan cara menjalankan, lihat [README](../README.md).

---

## 1. Gambaran Umum

```
                    ┌────────────────────────────────┐
                    │  Browser — 4 peran, 1 SPA     │
                    │  Pelanggan · Teknisi · Admin   │
                    │  · Mitra (drop point)          │
                    └───────────────┬────────────────┘
                                    │ HTTPS, axios, JWT bearer
                    ┌───────────────▼────────────────┐
                    │  React 18 + Vite + Tailwind    │
                    │  30 komponen · route dijaga    │
                    │  per peran (ProtectedRoute)    │
                    └───────────────┬────────────────┘
                                    │ /api/*
                    ┌───────────────▼────────────────┐
                    │  FastAPI — main.py             │
                    │  51 endpoint · JWT HS256       │
                    │  RBAC per-field · slowapi       │
                    └────┬──────────────────────┬────┘
                         │                      │
          ┌──────────────▼─────────┐   ┌────────▼─────────────────┐
          │  analytics.py          │   │  Supabase                │
          │  angka deterministik   │   │  PostgreSQL (6 tabel)    │
          │  + narasi AI (opsional)│   │  Storage (foto sepatu)   │
          │  + fallback aturan     │   │  RLS: aktif di expenses  │
          └────────────────────────┘   └──────────────────────────┘
```

Frontend **tidak** memakai Supabase Realtime — semua lewat FastAPI, sehingga
seluruh aturan RBAC bisa ditegakkan di satu tempat (backend).

### Route frontend

| Route | Akses | Isi |
|---|---|---|
| `/` | publik | Katalog harga |
| `/status` | publik | Lacak status cucian (`KS-XXXXXX`) |
| `/login` | publik | Masuk |
| `/admin` | admin | Dashboard omzet, stok, komisi |
| `/admin/sepatu` | admin | Master layanan & harga |
| `/admin/transaksi` | admin | Semua transaksi + ekspor CSV |
| `/admin/stock` | admin | Stok bahan & alat |
| `/admin/pengeluaran` | admin | Pengeluaran operasional |
| `/admin/users` | admin | Kelola pengguna |
| `/teknisi` | technician | Daftar tugas |
| `/mitra` | drop_point | Antrean & transaksi mitra |
| `/akun` | customer | Riwayat & profil |

---

## 2. Struktur Project

```
main.py               Backend FastAPI (semua endpoint)
analytics.py          Ringkasan AI (OpenRouter) + fallback berbasis aturan
bootstrap_admin.py    Sekali jalan: set password admin
manage_users.py       Lihat daftar akun + reset password
check_schema.py       Cek apakah kolom database sudah lengkap
check_auth.py         Audit: endpoint mana yang belum diproteksi auth
seed_dummy.py         Isi data dummy (konsumen, teknisi, transaksi, stock)
seed_pricelist.py     Isi 27 layanan asli Komang SAC (idempoten)
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
                     AdminShoes, AdminTransaksi, AdminStock, AdminUsers,
                     AdminExpenses (pengeluaran operasional + rekap mingguan),
                     PilihPeriode (pemilih bulan/tahun), Grafik (batang + horizontal)
  src/contexts/      AuthContext
  src/hooks/         useTabel.js (paginasi + filter + debounce pencarian)
  src/services/      api.js (axios + interceptor + ambilBerpaginan)
  src/utils/         helpers.js (formatRupiah, formatDate, getStatusConfig),
                     csv.js (ekspor CSV + ambil semua hasil filter),
                     periode.js (preset + rentang tanggal laporan)

docs/                 Dokumentasi lengkap (arsitektur, operasional, PRD, design)

Rentalyzer/           Proyek TERPISAH (sistem rental, repo git sendiri) — bukan bagian Komang SAC
```

---

## 3. Model Data

Enam tabel. `transactions` adalah pusat —everything else menempel ke situ.

```
profiles ──┬──< transactions (user_id)   [RESTRICT]
           ├──< transactions (tech_id)    [SET NULL]
shoes ─────┴──< transactions (shoe_id)    [RESTRICT]
drop_points ───< transactions (drop_point_id) [SET NULL]
stock            (mandiri — dipakai saat teknisi mengurangi bahan)
expenses         (mandiri — pengeluaran operasional)
```

| Tabel | Isi | Catatan penting |
|---|---|---|
| `profiles` | Admin, pelanggan, teknisi, mitra | `password_hash` PBKDF2-SHA256, `role` ber-CHECK |
| `shoes` | Master **layanan**, bukan per-merk | Satu baris = satu varian layanan. Harga bisa rentang (`harga_min`/`harga_max`) |
| `drop_points` | Outlet & mitra | |
| `transactions` | Transaksi cuci | `kode` unik untuk tracking, `grup_id` untuk booking multi-pasang |
| `stock` | Alat & bahan | `batas_minimum` untuk alarm stok menipis |
| `expenses` | Pengeluaran operasional | RLS **sudah** aktif di tabel ini |

Kolom yang perlu diketahui:

- `transactions.selesai_at` — diisi backend saat teknisi menandai status
  `Selesai`. **Inilah** yang dipakai semua laporan, bukan `created_at`.
- `transactions.harga` / `tech_commission` — snapshot financials saat transaksi
  dibuat. Tidak berubah walau harga master berubah.
- `transactions.grup_id` — "benang" booking multi-pasang. Tiap pasang tetap
  jadi transaksi sendiri, tapi punya `grup_id` yang sama.
- `shoes.estimasi_hari` — estimasi pengerjaan per layanan (default 3 hari).

### Alur status

```
Diterima → Diproses → Diperiksa → Selesai → Siap diambil
```

Di Constraints `CHECK`, jadi status di luar daftar itu ditolak database, bukan
cuma aplikasi.

---

## 4. Endpoint Penting

| Method       | Path                             | Auth          | Keterangan                                                     |
| ------------ | -------------------------------- | ------------- | -------------------------------------------------------------- |
| GET          | `/health`                        | —             | Cek koneksi database                                           |
| GET          | `/api/config`                    | —             | Info bisnis + metode bayar yang diterima (`ACCEPTED_PAYMENTS`) |
| POST         | `/api/auth/register`             | —             | Daftar sebagai pelanggan                                       |
| POST         | `/api/auth/login`                | —             | Login, dapat token JWT                                         |
| GET          | `/api/auth/me`                   | JWT           | Profil user aktif                                              |
| POST         | `/api/auth/set-password`         | JWT           | Set/ganti password                                             |
| GET          | `/api/sepatu`                    | —             | Katalog harga publik. `?aktif_only=false` melihat nonaktif     |
| GET          | `/api/sepatu/{id}`               | —             | Detail satu layanan                                            |
| GET          | `/api/drop-points`               | —             | Lokasi mitra publik                                             |
| GET          | `/api/drop-points/{id}`          | —             | Detail satu mitra                                              |
| GET          | `/api/transaksi/tracking/{kode}` | —             | Cek status publik (`KS-XXXXXX`). Ikut `grup_id`, estimasi, dan foto |
| GET          | `/api/transaksi/grup/{grup_id}`  | —             | Semua pasang dalam booking multi-pasang (kode+status+layanan)  |
| POST         | `/api/transaksi`                 | JWT           | Buat booking. Konsumen = atas namanya sendiri. `payment_method` divalidasi terhadap `ACCEPTED_PAYMENTS` |
| GET          | `/api/transaksi`                 | JWT           | Konsumen: miliknya. Teknisi: tugasnya. Admin/mitra: semua. `dari_selesai`/`sampai_selesai` untuk laporan (berbeda dari `dari`/`sampai` yang memakai tanggal masuk)      |
| GET          | `/api/transaksi/{id}`            | JWT           | Hanya pemilik/teknisi/admin                                    |
| PUT          | `/api/transaksi/{id}/status`     | teknisi/admin  | Update status. Wajib `photo_after` untuk Selesai/Siap diambil. Backend mencatat `selesai_at` saat status jadi Selesai   |
| PUT          | `/api/transaksi/{id}/harga`       | admin          | Finalisasi harga untuk layanan ber-rentang. Hitung ulang `tech_commission`   |
| GET          | `/api/stats/admin`               | admin         | Agregat dashboard. `?periode=bulan&bulan=10&tahun=2026` atau `?periode=tahun&tahun=2026` atau `?periode=semua`                                              |
| GET          | `/api/analytics/summary`         | admin         | Ringkasan + saran AI (fallback otomatis) + fakta untuk grafik. Parameter periode sama dengan `/api/stats/admin`               |
| POST/PUT/    | `/api/sepatu`                    | admin         | Kelola master layanan & harga                                  |
| DELETE       | `/api/sepatu/{id}`               | admin         | Hapus layanan. 409 kalau masih dipakai transaksi                |
| GET          | `/api/stock`                     | admin/teknisi | `?low_stock=true` untuk item menipis                            |
| GET          | `/api/stock/{id}`                | admin/teknisi | Detail item stok                                               |
| POST/PUT     | `/api/stock`                     | admin         | Tambah/ubah stok                                               |
| POST         | `/api/stock/{id}/kurangi`        | admin/teknisi | Kurangi stok saat pakai bahan                                  |
| GET/POST     | `/api/expenses`                  | admin         | Riwayat + catat pengeluaran. Filter `kategori`, `dari`/`sampai` (inklusif), `q` di keterangan |
| PUT/DELETE   | `/api/expenses/{id}`             | admin         | Koreksi / hapus catatan pengeluaran                            |
| GET          | `/api/expenses/rekap-mingguan`   | admin         | Total per minggu (Senin–Minggu WIB), 8 minggu terakhir          |
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

## 5. Paginasi

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

Kalau `cari_status` diisi, dia **mengalahkan `aktif_only`**. Jadi
`?cari_status=false` saja sudah cukup untuk mencari yang nonaktif — tanpa
harus ikut mengirim `aktif_only=false`. Kalau keduanya difilter terpisah,
PostgREST menyANDkan `status=true` dan `status=false`, dan hasilnya selalu
kosong.

Karena `aktif_only` default-nya `True`, panel admin **wajib** mengirim
`aktif_only=false` — kalau tidak, master yang dinonaktifkan tidak akan pernah
tampak dan tidak bisa dihidupkan kembali.

> `low_stock` sengaja difilter lewat daftar id, bukan di Python. Kalau
> filtering dilakukan setelah data diambil, `X-Total-Count` jadi tidak sinkron
> dengan isi halaman — panel melaporkan "2 item" padahal ada 8, dan halaman 2
> tampak kosong padahal masih ada isi.

---

## 6. Laporan per Bulan / Tahun

Dashboard admin bisa dilihat per **bulan** atau **tahun**, lewat pemilih periode
di bagian atas. Empat preset cepat: *Bulan ini*, *Bulan lalu*, *Tahun ini*,
*Semua waktu* — plus pemilih bulan/tahun untuk periode lain.

### Semua angka dihitung dari tanggal SELESAI

Kolom `transactions.selesai_at` diisi backend otomatis saat teknisi mengubah
status ke **Selesai**. Kolom ini yang dipakai untuk laporan, bukan `created_at`.

Alasannya praktis: pemilik mau tahu "bulan ini dapat berapa". Cucian yang masuk
tanggal 31 dan selesai tanggal 2 adalah hasil bulan 2. Kalau dihitung dari
`created_at`, omzet bulan 1 akan kena tambahan dan bulan 2 akan berkurang.

Akibatnya, transaksi yang masih di tahap awal (Diterima/Diproses/Diperiksa)
**tidak** dihitung sebagai omzet periode mana pun. Jumlahnya tetap dilaporkan
terpisah sebagai "masih dikerjakan".

### Dua pasangan filter tanggal di `/api/transaksi`

| Parameter | Kolom | Dipakai untuk |
|---|---|---|
| `dari` / `sampai` | `created_at` | Melihat antrean: "yang masuk sejak tanggal berapa" |
| `dari_selesai` / `sampai_selesai` | `selesai_at` | Laporan: "yang selesai di bulan ini" |

Keduanya sengaja **tidak** digabung. Kalau dipakai bersama-sama, hasilnya baris
yang masuk DAN selesai di rentang itu — untuk laporan omzet itu salah, karena
cucian yang masuk bulan lalu lalu selesai bulan ini harus ikut dihitung bulan ini.

Batas atas `sampai_selesai` **eksklusif** (menunjuk ke 1 pukul 00:00 periode
berikutnya), karena backend membandingkannya dengan `lt()`. Kalau mengirim
tanggal terakhir periode, transaksi yang selesai tepat tengah malam tanggal 1
akan hilang dari laporan.

### Pengeluaran operasional & sisa bersih

Halaman **Pengeluaran** (`/admin/pengeluaran`) mencatat biaya di luar bahan
cuci: token listrik, PDAM, dan kategori lain yang bisa diketik bebas (otomatis
dinormalisasi lowercase, jadi "Listrik" dan "listrik" tidak jadi dua kategori).

Bagian atas halaman menampilkan **rekap mingguan** — total minggu ini (Senin–
Minggu, WIB) dibanding minggu lalu, plus grafik mini 8 minggu terakhir. Ini
jawaban cepat untuk "minggu ini habis berapa".

Pengeluaran ikut masuk hitungan dashboard dan CSV ringkasan:

```
Sisa bersih = omzet − komisi teknisi − pengeluaran
```

`Sisa untuk outlet` (omzet − komisi) tetap dilaporkan terpisah, jadi dua-duanya
bisa dibandingkan. Ringkasan AI membaca total per kategori saja — kolom
`keterangan` tidak pernah dikirim ke OpenRouter karena bisa memuat catatan
pribadi.

### Estimasi per layanan & booking multi-pasang

Dua kolom tambahan di sisi konsumen:

- **`shoes.estimasi_hari`** — estimasi pengerjaan per layanan (diatur dari
  panel admin; kosong = default 3 hari). Konsumen melihat tanggal estimasi
  yang sesuai layanannya ("Repaint ±6 hari", bukan "2–3 hari" untuk semua),
  dan halaman status menampilkan ajakan bertanya via WA yang halus kalau
  pengerjaan lewat dari estimasi.
- **`transactions.grup_id`** — "benang" booking multi-pasang. Konsumen bisa
  menambah beberapa pasang dalam satu form booking; tiap pasang tetap jadi
  transaksi sendiri (status memang per pasang) dengan `grup_id` yang sama.
  Halaman status menampilkan "Satu booking, N pasang" dengan status tiap
  pasang, dan halaman akun menandainya dengan chip *booking grup*.

### Parameter periode di stats & analytics

`/api/stats/admin` dan `/api/analytics/summary` menerima parameter yang sama:

| Parameter | Arti |
|---|---|
| `periode=bulan&bulan=10&tahun=2026` | Satu bulan, grafik per **hari** |
| `periode=tahun&tahun=2026` | Satu tahun, grafik per **bulan** |
| `periode=semua` | Seluruh riwayat, grafik per **bulan** |

Default-nya `semua`, jadi ketiga endpoint itu tetap jalan dipanggil tanpa
parameter apa pun. Kalau periodenya bukan `semua`, `tahun` (dan `bulan` untuk
periode bulan) wajib diisi — kalau tidak, backend menolak dengan 400, bukan
menebak periode diam-diam.

Granularitas grafik mengikuti periode: satu bulan → per hari, satu tahun →
per bulan. Bucket harian/bulanan dihitung di zona **WIB** (UTC+7) supaya
transaksi yang selesai lewat tengah malam tidak masuk tanggal yang salah.

### Ekspor CSV

Tiga tombol ekspor di dashboard, masing-masing menghasilkan satu berkas CSV:

| Tombol | Isi |
|---|---|
| **Ringkasan** | Angka KPI periode (omzet, komisi, sisa untuk outlet, dst.) |
| **Tren** | Deret harian/bulanan: label, jumlah pekerjaan, omzet |
| **Transaksi** | Semua transaksi yang selesai di periode ini (dengan tanggal selesai) |

Berkas CSV memakai BOM UTF-8 supaya Excel di Windows membaca karakter non-ASCII
dengan benar, dan nilai yang mengandung koma dibungkus tanda kutip sesuai
RFC 4180.

---

## 7. Ringkasan AI (OpenRouter)

**AI HANYA untuk dua hal: RINGKASAN dan SARAN.** Itu saja.

Semua angka, grafik, dan tabel di dashboard dihitung secara deterministik di
`analytics.py` — tidak pernah lewat model bahasa. Alasannya:

1. Angka dari LLM bisa berbeda antara dua pemanggilan untuk data yang sama,
   jadi dashboard yang "berubah sendiri" saat di-refresh tidak bisa dipercaya
   untuk menghitung bayar teknisi.
2. Model gratis bisa lambat atau mati. Kalau grafik ikut bergantung padanya,
   satu timeout membuat separuh dashboard kosong.
3. Batas token. Meminta model menulis JSON angka ratusan baris prone ke
   hallucination di setiap digit.

Jadi alurnya: `gather_facts` menghitung semuanya secara deterministik, lalu
OpenRouter HANYA membaca angka-angka itu dan menulis narasi + saran. Kalau
OpenRouter gagal, `rule_based` menulis versi yang sama dari perhitungan lokal.

Panel AI di dashboard menampilkan narasi (ringkasan) dan daftar berpoin (saran).
Grafik, kartu angka, dan tabel ada di atasnya — semuanya dari perhitungan lokal.

Dua jalur, dan UI selalu memberi tahu yang mana yang dipakai:

| `sumber` | Kapan dipakai | Hasil |
|---|---|---|
| `ai` | `OPENROUTER_API_KEY` ada dan salah satu model berhasil | Naratif seperti tulisan analis |
| `fallback` | Key kosong, atau **semua** model gagal (429/timeout/dihapus dari katalog) | Ringkasan deterministik dari `analytics.py`, tanpa jaringan |
| `error` | Backend gagal menghitung (mis. kolom berubah) | Panel angka tetap tampil, naratif diganti pesan error |

Jadi halaman dashboard **tidak pernah kosong** hanya karena layanan AI sedang
tidak sehat. Fallback butuh nol konfigurasi.

Aktifkan dengan isi `OPENROUTER_API_KEY` di `.env` (gratis, ambil di
<https://openrouter.ai/keys>).

### Fallback multi-model

Model gratis sering kena rate limit (429) atau tiba-tiba hilang dari katalog.
Karena itu backend tidak bergantung pada satu model: `OPENROUTER_MODELS` di
`.env` berisi daftar model yang **dicoba berurutan** sampai ada yang berhasil:

```ini
OPENROUTER_MODELS=nvidia/nemotron-3-super-120b-a12b:free,nvidia/nemotron-3.5-lightning:free,nvidia/nemotron-3-ultra-550b-a55b:free,google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free
```

- Model paling kiri adalah prioritas utama; sisanya cadangan.
- Kalau `OPENROUTER_MODELS` kosong, `OPENROUTER_MODEL` (satu model) yang
  dipakai — kompatibel dengan `.env` lama tanpa perlu diubah.
- Total waktu tunggu dijaga ±45 detik: jatah timeout tiap model dibagi rata
  (minimal 12 detik), jadi makin banyak cadangan tidak berarti makin lama
  menunggu. Kegagalan cepat seperti 429/404 langsung lanjut ke model berikutnya.
- Field `model` di respons menunjukkan model yang benar-benar menjawab, jadi
  kelihatan di UI saat sedang memakai cadangan.

Daftar model gratis terkini: <https://openrouter.ai/models?q=:free>.
Catatan hasil uji tiap model ada di komentar atas `analytics.py`.

Yang dikirim ke OpenRouter **hanya angka agregat**: jumlah transaksi, omzet,
status, nama layanan, sisa stok. Kode transaksi, nomor telepon, dan nama orang
tidak pernah ikut. Endpoint-nya admin-only, dan `test_api.py` memverifikasi
kelima hal tersebut.

---

## 8. Rate Limiting (anti brute-force)

Backend memakai [`slowapi`](https://github.com/laurents/slowapi) dengan storage
in-memory. Tidak butuh Redis, tidak ada layanan tambahan, tetap gratis.

| Endpoint | Batas | Alasan |
|---|---|---|
| `POST /api/auth/login` | 5/menit | Membatasi menebak password |
| `POST /api/auth/register` | 3/jam | Mencegah pendaftaran massal |
| `POST /api/auth/set-password` | 5/menit | Melindungi akun yang sudah login |
| `GET /api/transaksi/tracking/{kode}` | 30/menit | Mencegah pembrute-force kode booking |
| `POST /api/transaksi` | 10/jam | Mencegah spam booking |
| `POST /internal/cleanup-fotos` | 5/jam | Endpoint mesin, bukan untuk manusia |
| *semua endpoint lain* | 300/menit | Jaring pengaman global |

Saat kena limit, server membalas `429` dengan header `Retry-After` berisi
detik yang tersisa, dan pesan dalam bahasa Indonesia.

**Dua hal yang perlu diketahui:**

1. **Batasnya per IP.** Kalau di belakang proxy (Railway/Vercel), kode membaca
   `X-Forwarded-For` lebih dulu. Tanpa itu semua pengunjung dihitung sebagai
   satu orang dan saling memblokir.
2. **In-memory artinya reset saat server restart** dan tidak dibagi antar
   worker. Untuk deployment sekarang (satu proses, free tier) ini sudah cukup.
   Kalau nanti menambah worker, cukup ganti `storage_uri="memory://"` jadi
   `storage_uri="redis://..."` di `main.py` — kode endpoint tidak berubah.

> Rate limit dihitung dari IP, jadi kalau kamu menguji login 6 kali berturut-turut
> dari komputer yang sama, percobaan keenam akan ditolak selama satu menit.
> Itu memang perilaku yang diinginkan, bukan bug.

---

## 9. Hapus Foto Otomatis (Storage TTL)

Foto sepatu (`photo_before` / `photo_after` / `photo_defect`) disimpan di
Supabase Storage dengan kuota **1 GB**. Supabase free tier **tidak punya**
fitur hapus-otomatis, jadi penghapusannya dijalankan dari luar:

```
GitHub Actions (tiap hari 10.17 WIB)
        │
        ▼
POST /internal/cleanup-fotos        ← dilindungi header X-Cleanup-Token
        │
        ├─ cari transaksi yang updated_at sudah lebih dari PHOTO_TTL_DAYS
        ├─ hapus file-nya dari Supabase Storage
        └─ kosongkan kolom foto di database
```

Retensi diatur lewat `PHOTO_TTL_DAYS` di `.env` (default **7 hari**).

**Yang perlu diisi supaya fitur ini hidup:**

1. `CLEANUP_TOKEN` di `.env` backend — buat dengan
   `python -c "import secrets; print(secrets.token_urlsafe(32))"`
2. Dua secret di GitHub (**Settings → Secrets and variables → Actions**):

   | Secret | Isi |
   |---|---|
   | `BACKEND_URL` | URL produksi backend, tanpa slash di belakang |
   | `CLEANUP_TOKEN` | nilai yang sama dengan di `.env` backend |

Kalau secret belum diisi, workflow tidak berwarna merah — hanya melewatkan
tugasnya dengan peringatan kuning.

**Dua hal penting soal cara kerjanya:**

- Retensi dihitung dari `updated_at`, **bukan** dari waktu foto diupload.
  Begitu ada aktivitas pada transaksi (status diganti, harga diedit), hitungan
  mundurnya mulai dari nol. Konsekuensinya foto bisa bertahan **lebih** dari
  7 hari — dan itu memang disengaja, supaya foto tidak hilang di tengah masa
  komplain pelanggan.
- Kolom database dikosongkan **hanya setelah** file benar-benar terhapus dari
  Storage. Kalau penghapusan gagal, kolom tetap ada sehingga tidak ada file
  yatim yang masih memakan kuota tapi tidak punya catatan di database.

Uji manual: buka **Actions → Cleanup Foto (TTL) → Run workflow**, atau panggil
langsung:

```bash
curl -X POST http://localhost:8001/internal/cleanup-fotos \
  -H "X-Cleanup-Token: <isi CLEANUP_TOKEN kamu>"
```

---

## 10. Catatan Keamanan

- **Password** disimpan sebagai hash PBKDF2-SHA256 — tidak bisa dibaca balik.
  Reset lewat `manage_users.py`.
- **JWT** HS256, `JWT_SECRET_KEY` wajib acak. Kalau kosong, backend berhenti
  saat start (fail-fast), bukan jalan dengan secret lemah.
- **Service-role key** hanya di backend. Tidak pernah ditaruh di `frontend/`.
- **RLS** saat ini baru aktif di tabel `expenses`. Policy untuk 5 tabel lain
  masih terkomentari di `migrate.sql` bagian [7] — **aktifkan sebelum deploy
  ke publik**, kalau tidak anon key masih bisa membaca semua tabel.
- **Guard CI** gagal kalau `.env` atau folder `privat/` ikut ter-commit.

- **Audit proteksi endpoint** (`check_auth.py`) membedakan tiga jenis
  proteksi: JWT (mayoritas), token statis lewat header
  (`POST /internal/cleanup-fotos` — dibandingkan dengan `hmac.compare_digest`),
  dan yang memang publik. Untuk yang pakai token statis, auditnya memverifikasi
  dari source endpoint, bukan dari nama route saja — jadi kalau perbandingan
  token suatu saat dihapus, audit ikut gagal, bukan lolos diam-diam.

---

## 11. Dokumen Lain

| Dokumen | Isi |
|---|---|
| [OPERASIONAL.md](OPERASIONAL.md) | Setup, CI, secret, deploy |
| [RENCANA-REPO-PRIVAT.md](RENCANA-REPO-PRIVAT.md) | Rencana repo privat untuk file sensitif |
| [prd.md](prd.md) | Spesifikasi fitur per role |
| [plan.md](plan.md) | Roadmap + status implementasi |
| [design.md](design.md) | Sistem desain UI |
| [blueprint.md](blueprint.md) | Stack, pola skema, design token |
| [summary.md](summary.md) | Ringkasan untuk partner |
| [data.md](data.md) | Format intake data master |
| [HANDOVER.md](HANDOVER.md) | Dokumen serah terima |
| [REVIEW_ROLE.md](REVIEW_ROLE.md) | Review per role + rekomendasi upgrade |
