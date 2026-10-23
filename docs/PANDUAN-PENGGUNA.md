# Panduan Pengguna Komang SAC

Dokumen ini untuk **siapa pun yang memakai aplikasi Komang SAC** — pemilik
(admin), teknisi, mitra drop point, dan konsumen. Fokusnya: cara login, apa
saja yang bisa dilakukan tiap peran, dan cara kerja fitur secara berurutan.

Dokumen teknis (arsitektur, penyebaran, kredensial) dibahas di file terpisah:

| Kebutuhan | Dokumen |
|---|---|
| Struktur kode & desain sistem | `docs/ARSITEKTUR.md` |
| Setup environment & operasional harian | `docs/OPERASIONAL.md` |
| Repo privat & kredensial | `docs/REPO-PRIVAT.md` |

---

## 1. Komang SAC itu apa?

Aplikasi kegiatan cuci sepatu (lengkap dengan bay, topi, dan helm) yang
menghubungkan **konsumen**, **teknisi**, **mitra drop point**, dan **admin**
dalam satu tempat:

- Konsumen melihat daftar harga, memesan (sedulur), lalu menelusuri status
  cucian lewat kode tracking singkat.
- Teknisi menerima antrean, mencatat kondisi benda sebelum diselidiki, dan
  mengemas foto sebelum/sesudah pekerjaan.
- Mitra drop point menerima benda dari konsumen, mendeteksi permintaan baru
  di wilayahnya, dan dapat menghubungi konsumen lewat WhatsApp yang tercatat.
- Admin mengatur katalog layanan, transaksi, pengguna, persediaan, dan
  pengeluaran — termasuk laporan omzet & profit.

Nomor tracking konsumen berformat **`KS-XXXXXX`** (6 karakter; huruf tanpa
I/O dan angka tanpa 0/1 supaya tidak tertukar saat dibacakan).

---

## 2. Akun, Peran, dan Log masuk

### Four roles & hak aksesnya

| Peran | Halaman | Bisa melakukan |
|---|---|---|
| Konsumen (customer) | `/akun` | Melihat katalog, memesan, melacak status, riwayat lengkap |
| Teknisi (technician) | `/teknisi` | Mengubah status pekerjaan, catat cacat, unggah foto |
| Mitra drop point (drop_point) | `/mitra` | Melihat semua transaksi + kontak konsumen (tanpa mengubah) |
| Admin (admin) | `/admin` | Semua fitur: katalog, transaksi, pengguna, persediaan, pengeluaran, laporan |

Aturan penting: harga (termasuk profit teknisi) **tidak dilihat oleh teknisi
penuh** — backend menyaring kolom harga/komisi sebelum data dikirim, bukan
sekadar menyembunyikan di tampilan.

### Membuat akun (hanya konsumen)

Pendaftaran mandiri **hanya untuk peran konsumen**:

1. Buka halaman **Masuk** (`/login`).
2. Pilih tab **Daftar**.
3. Isi nama lengkap, nomor WhatsApp, dan kata sandi (minimal 6 karakter).
4. Nomor akan dinormalisasi otomatis ke format internasional
   (`08xx` / `+62xx` → `62xx`) supaya tidak berganda di database setiap
   mengganti bentuk penulisan.

Teknisi, mitra drop point, dan admin **tidak dapat mendaftar sendiri** —
akunnya dibuat/disetujui oleh admin lewat panel **Pengguna**.

### Log masuk

- Halaman `/login` memakai **nomor WhatsApp + kata sandi**.
- Nomor ditulis kapan pun bentuknya — `0812…`, `+62812…`, atau `62812…`
  diperirama sama.
- Sesi disimpan dalam bentuk token JWT (7 hari dari default
  `ACCESS_TOKEN_EXPIRE_MINUTES`). Sesi kadaluwarsa → kamu diajak log masuk
  ulang secara otomatis, tanpa kehilangan halaman sedang dibuka.

### Mengganti / menetapkan kata sandi

- **Konsumen & akun lain yang sedang log masuk**: lewat halaman akun
  (**Setel kata sandi**) — dipakai untuk mengganti kata sandi pertama kali
  ataupun menggantinya nanti.
- **Lupa sandi / akun terkunci**: pemulihannya praktis — hubungi **admin**,
  admin mengeset kata sandi baru untukmu lewat panel Pengguna. Tidak ada
  alur surel karena layanan ini sengaja tanpa dependensi emailing.

---

## 3. Untuk Konsumen

### 3.1 Beranda & katalog

Halaman beranda (`/`) menampilkan **Layanan & Harga** dari tabel
`shoes`, terbagi 3 kelompok:

- **Cuci Sepatu** — Fast Cleaning, Deep Cleaning (Non White / White /
  Whitening), Suede Treatment, Kids Shoes, Unyellowing, Slippers.
- **Bag, Hat & Helmet** — Bag Cleaning (4 ukuran), Hat Cleaning, Helmet
  Cleaning (anak/dewasa/fullface).
- **Repaint & Reglue** — Shoes Repaint (canvas/suede/leather/midsole),
  Shoes Reglue, Jahit Sol.

Semua harga **sudah termasuk perbaikan & keterampilan**. Layanan dengan
harga rentang menampilkan **"mulai dari Rp X"** — angka akhirnya disepakati
setelah kondisi barang diperiksa (lihat bagian teknisi).

### 3.2 Booking (memesan)

Dari katalog, klik **Booking** pada layanan yang dijalankan:

- Bisa lebih dari paket dalam satu sesi — rancang transaksi seperti itu
  berbagi **satu ID grup** sehingga admin melihatnya sebagai satu reservasi.
- Pilih **metode pembayaran** yang tersedia di outlet (tunai / transfer /
  QCIS — daftar ini digiring admin lewat `.env`, jadi selalu sinkron).
- Konsumen boleh mengisi **catatan** (mis. bahan pendukung).
- Layanan ber-harga rentang dicatat dari **harga minimum**; angka final
  dikonfirmasi admin nanti, bukan dihitung ulang di belakang.

Kamu perlu log masuk untuk booking. Kalau belum, aplikasi akan membawa
kamu ke `/login` lalu kembali ke tempat semula.

### 3.3 Melacak status

Tanpa perlu log masuk: buka **Cek Status** (`/status`), masukkan kode
`KS-XXXXXX`. Pelacak ini sama yang dipakai teknisi/admin untuk menautkan
kode ke halaman publik.

### 3.4 Akun saya

Halaman `/akun` menampilkan **seluruh riwayat** reservasimu (bukan cucian
satu kode saja):

- **Sedang berjalan** — cucian yang masih diproses.
- **Selesai** — riwayat lengkap beserta tanggal & harga final.
- Selain itu, lewat sini kamu bisa mengganti kata sandi.

---

## 4. Untuk Teknisi

Halaman `/teknisi` menampilkan pekerjaan berjalan dengan filter status.
Alur resmi status:

```
Diterima → Diproses → Diperiksa → Selesai → Siap diambil
```

Yang teknisi boleh lakukan per transaksi:

1. **Mengubah status** sesuai tahapan di atas (backend menegakkan urutan
   nilai status yang valid; status acak akan ditolak).
2. **Mencatat cacat bawaan** (defect) sebelum mulus diproses — mis. goresan
   yang sudah ada, sol mengelupas, warna memucat. Catatan ini pelindungmu:
   mencegah tuduhan "rusak saat dicuci".
3. **Unggah foto seeding foto teknisi:**
   - **Foto sebelum** — kondisi barang saat diterima.
   - **Foto sesudah** — wajib saat akan melanjutkan ke **Selesai** atau
     **Siap diambil**; tanpa itu permintaan ditolak backend.
4. **Teknisi tidak melihat harga & komisi** di tampilan maupun respons
   API — kolomnya dihilangkan oleh backend.

---

## 5. Untuk Mitra Drop Point

Halaman `/mitra`:

- Menampilkan **semua transaksi** (karena tugas mitra adalah menerima
  benda dan memberitahukan perkembangannya ke konsumen), lengkap dengan
  **nomor WhatsApp konsumen** untuk kabarin "barangmu sudah siap".
- Memiliki kotak pencarian untuk mendeteksi transaksi cepat.
- **Batas wewenang**: mitra boleh MELIHAT data + kontak, tetapi TIDAK
  boleh mengubah/menghapus transaksi apa pun. Itu ditegakkan backend,
  bukan hanya menyembunyikan tombol.

Drop point yang terdaftar dikelola admin lewat panel **Drop Point**
(nama, alamat, nomor WA, aktif/dapat).

---

## 6. Untuk Admin

Semua fitur admin lewat `/admin`. Berikut subhalaman & penggunaannya.

### 6.1 Dashboard (halaman utama)

- **Periode laporan**: pilih bulan, bulan & tahun, atau seluruh riwayat
  (`periode=semua`). Label & granularitas grafik ikut menyesuaikan —
  satu bulan → grafik harian, satu tahun → grafik bulanan.
- Angka dari transaksi **sudah selesai** saja (`selesai_at` ada & dalam
  periode). Transaksi masih berjalan dilaporkan di **"masih berjalan"**
  supaya tidak menggembangkan angka omzet.
- Komponen utama: total nomor pekerjaan, omzet, komisi teknisi, sisa untuk
  outlet, **pengeluaran operasional**, dan **sisa bersih**.
- **Otorisasi pembanding**: periode sebelumnya dihitung otomatis untuk
  pencocokan (mis. bulan ini vs bulan lalu).
- Kalau layanan AI ringkasan (OpenRouter) gagal/tidak tersedia, dashboard
  tetap tampil dengan ringkasan fallback — tidak pernah kosong.

### 6.2 Master Layanan (`/admin/sepatu`)

- Ini price list resmi: satu baris = satu perbedaan layanan.
- Area field waktu: `kelompok`, `jenis_treatment`, penjelasan, dan
  **estimasi hari pengerjaan** (per layanan — Repaint tidak masuk akal
  diberi jadwal 2 hari seperti Deep Cleaning).
- Harga bisa **tetap** (harga_cuci) atau **rentang** (harga_min/harga_max).
  Validasi backend menolak harga_max < harga_min.
- Nonaktifkan (`status=false`) layanan lama alih-alih menghapus — riwayat
  transaksi lama tetap baca, katalog publik tak lagi menampilkan.

### 6.3 Transaksi (`/admin/transaksi`)

- Daftar lengkap dengan pencarian, filter status, dan **paginasi**
  (total halaman diberitahukan lewat header respons).
- Konfirmasi **harga final** untuk layanan ber-rentang di sini.
- Menghubungkan transaksi ke teknisi (pelaksana) & drop point (titik masuk).
- Kontak konsumen (nama + WhatsApp) tampil untuk admin & mitra; teknisi
  tidak mendapatkannya.

### 6.4 Persediaan (`/admin/stock`)

- Mengatur **alat** & **bahan** dengan tipe satuan (pcs/liter/kg/pack).
- **Batas minimum** → bekal yang menyentuh batas muncul di dashboard
  sebagai administrasi menipis.
- Riwayat perubahan dicatat lewat kolom `last_updated`.

### 6.5 Pengeluaran (`/admin/pengeluaran`)

- Karena semua biaya operasional (listrik, air, dsb.) per kategori &
  tanggal — dilaporkan di dashboard sebagai pengurangan dikhawatirkan
  profit.
- Tanggal masa depan ditolak; kategori bersih terlihat melalui
  normalisasi otomatis (trim + huruf kecil + ruang berlebih dipangkas).

### 6.6 Pengguna (`/admin/users`)

- Mengelola akun semua peran: nama, nomor WhatsApp, peran, status
  terverifikasi.
- **Reset kata sandi** akun lain — mekanisme pemulihan akun resmi
  (bila konsumen lupa sandi, cukup via admin).
- Pengguna baru bisa dibuat langsung dari panel alih-alih bergantung pada
  pendaftaran mandiri.

---

## 7. Makna tiap status (untuk semua peran)

| Status | Maknanya | Catatan teknis |
|---|---|---|
| `Diterima` | Barang masuk di titik drop point / outlet | Fakta awal transaksi |
| `Diproses` | Sedang dikerjakan teknisi | Cacat dibuat catatan sebelum/mulai tahap ini |
| `Diperiksa` | Sudah dikunjungi QC / diperiksa hasilnya | |
| `Selesai` | Pekerjaan tamat (**butuh foto sesudah**) | Memasuki hitungan omzet pada tanggal `selesai_at` |
| `Siap diambil` | Menunggu dijemput konsumen | Juga butuh foto sesudah |

Laporan omzet dihitung dari `selesai_at` (tanggal pekerjaan tamat), bukan
tanggal masuk — supaya cucian masuk 31 dan tamat 2 dijack oleh bulan
yang benar. Zona waktunya **WIB (UTC+7)**, bukan UTC.

---

## 8. Pembayaran & harga

- **Metode pembayaran** diterima dikiring `.env` admin
  (`ACCEPTED_PAYMENTS`), dipublikasikan lewat endpoint `/api/config` —
  jadi frontend selalu konsisten dengan kebijakan outlet.
- Nomor WhatsApp & jam operasional bisnis juga tampil dari sana.
- Untuk layanan harga-rentang: booking mencatat harga minimum; harga
  akhir disepakati & dikonfirmasi admin setelah barang diperiksa.

---

## 9. FAQ & Masalah Umum

**"Layanan & Harga" kosong / gagal memuat**
Cek: (1) backend jalan? (2) `VITE_API_BASE_URL` frontend menunjuk server
backend yang benar (di produksi: domain Railway). Lihat juga bagian
Troubleshooting di `docs/OPERASIONAL.md`.

**Kode tracking tak ketemu**
Pastikan format `KS-XXXXXX` dan tidak satu butir berbeda (huruf I/O dan
angka 0/1 memang tidak digunakan pada kode — kalau kamu membacanya, itu
sebenarnya huruf lain).

**Lupa password**
Hubungi admin; admin mengeset kata sandi baru dari panel Pengguna.
Tidak ada email reset pada sistem — ini keputusan yang disengaja (lihat
dokumen arsitektur).

**Nomor saya tak dikenal saat login**
Nomor dinaikkan ke format `62…` saat disimpan. Coba tulis dengan bentuk
lain (sadari 0 / +62 / 62) — ketiganya dinormalisasi sama saja.

**Saya teknisi, kenapa tidak lihat harga?**
Sengaja. Kolom harga/komisi disaring di backend untuk peran teknisi,
termasuk kalau seseorang memaksa lewat DevTools.

---

## 10. Ringkasan untuk Pemilik (ketika menempatkan / baru plugging)

- Semua konfigurasi memakai variabel lingkungan di `.env` (lihat
  `.env.example` + `docs/OPERASIONAL.md`). Data sensitif TIDAK pernah
  disimpan dalam repo publik.
- Fitur ringkasan AI dashboard (OpenRouter) bersifat opsional; di
  **mode penuh tanpa kunci** laporan tetap jalan dengan ringkasan
  lokal (sumber `fallback`).
- Foto transaksi disimpan di folder Supabase `transaksi-photos` dan
  dibersihkan secara berkala oleh workflow GitHub `Cleanup Foto (TTL)`.
- Tiga perangkat untuk keadaan darurat operasional (dibaca: pemilik):
  `scripts/backup_database.py`, `scripts/wipe_database.py`,
  `scripts/wipe_storage.py` — jalankan dari folder proyek dengan
  `.venv` yang aktif. Bacakan komentar file sebelum dipakai.

---

*Terakhir dibarui: 2026-10-23. Kalau ada fitur yang berubah, perbarui
dokumen ini di commit yang sama dengan kodenya.*
