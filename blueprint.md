# blueprint.md — Cetakan Proyek Komang SAC

> Cara pakai: kirim file ini ke AI + satu kalimat konteks, contoh:
> *"Ikuti blueprint ini untuk membangun sistem manajemen cuci sepatu. Yang dipakai: stack, pola skema, modul auth, dashboard admin, dan ketentuan komisi. Yang tidak dipakai: paket jam, AI summary, dan scheduler."*
> AI yang membaca blueprint ini bisa langsung scaffolding tanpa kamu menjelaskan ulang dari nol.

## 1. Stack Baku

* **Backend:** Python, FastAPI (Uvicorn), Pydantic v2, PyJWT, password di-hash dengan `hashlib.pbkdf2_hmac` (tanpa dependency bcrypt).
* **Frontend:** React + Vite, react-router-dom, Tailwind CSS, lucide-react.
* **DB:** PostgreSQL (via Supabase). Storage file: Supabase Storage (URL absolut). **Deploy: Vercel (frontend SPA) + Supabase (DB/Auth/Storage/Realtime) — semuanya FREE Tier, tanpa kartu kredit.**
* **Aturan:** tiap tabel punya `created_at`; kolom baru nullable/berdefault; enum baru sinkron `models + schemas + frontend`.

## 2. Pola Skema (WAJIB ditiru)

* **Tabel pengguna:** `profiles` (`full_name`, `phone` unique, `password_hash`, `role`, `is_verified`, `created_at`).
* **Tabel master:** `shoes` (merk, model, `harga_cuci`, `jenis_treatment`, `keterangan_treatment`, `status`, `created_at`) + `drop_points` (nama, alamat, wa_contact, aktif).
* **Tabel fakta `transactions`:** FK ke `profiles`/`shoes`/`drop_points`, `kode` (nomor tracking publik), **snapshot finansial** (`harga`, `tech_commission`), enum status (`Diterima|Diproses|Diperiksa|Selesai|Siap diambil`), `catatan_konsumen`, `defect_notes`, `photo_before` + `photo_after`, `created_at` + `updated_at` auto.
* **Tabel `stock`:** `nama_item`, `tipe` (alat/bahan), `jumlah`, `satuan`, `batas_minimum`, `supplier`, `harga_beli`, `last_updated`.

> **Penting:** kolom snapshot (`harga`, `tech_commission`) diisi saat transaksi dibuat dan
> **tidak ikut berubah** kalau harga master diedit. Ini yang menjaga laporan historis tetap benar.

## 3. Modul Backend (salin polanya)

1. Auth JWT di `main.py` — `/api/auth/login`, `/api/auth/register`, `/api/auth/me`, `/api/auth/set-password`, plus dependency `get_current_user` dan `require_role(*roles)`.
2. CRUD `shoes` (filter `aktif_only`) + CRUD `drop_points` + CRUD `profiles` + CRUD `stock`.
3. Transaksi: create (hitung `tech_commission = harga // 2` saat create), update status dengan aturan **wajib ada `photo_after`** sebelum Selesai/Siap diambil, dan endpoint publik `GET /api/transaksi/tracking/{kode}`.
4. Agregat admin: `GET /api/stats/admin` (pendapatan, shoes washed, komisi per teknisi, sebaran status).
5. Export Excel/CSV untuk laporan.

## 4. Modul Frontend (salin polanya)

* `Navbar` → `Catalog` (grid publik) → `BookingModal` (2 langkah + catatan) → `StatusTracker` (progress 5 tahap) → `LoginModal` → `AdminDashboard` (kartu statistik + tabel transaksi + komisi + stok menipis).
* `services/api.js`: axios, base URL `VITE_API_BASE_URL`, token di localStorage (key `TOKEN_KEY`), interceptor 401 → `/login`.
* `contexts/AuthContext.jsx`: `user`, `loading`, `login`, `register`, `logout`, penanda role.
* Setiap fetch: state loading + error + empty-state, plus **fallback mock** supaya UI tetap bisa direview tanpa backend.
* Format angka/tanggal HANYA lewat `utils/helpers.js` (`formatRupiah`, `formatDate`, `formatDateTime`, `getStatusConfig`).
* Teks UI Bahasa Indonesia; kunci env frontend diawali `VITE_` dan tidak boleh berisi secret.

## 5. Design Token (salin gayanya)

* **Warna:** Palet **biru & putih**.
    * Kartu `rounded-2xl border border-slate-100 bg-white shadow-card`; aksen `bg-primary-50` / `border-primary-100`.
    * Judul seksi `text-xs font-bold uppercase tracking-wider text-slate-600`; angka hero `text-xl font-bold`.
    * Palet: netral `slate`, primer `blue`, sukses `emerald`, peringatan `amber`, bahaya `rose`, info `sky/cyan`. **Tanpa indigo.**
    * Badge status: Diterima `blue`, Diproses `amber`, Diperiksa `violet`, Selesai `emerald`, Siap diambil `cyan`.
    * Ikon lucide-react. **Catatan:** versi 0.294 tidak punya ikon `Shoe` — pakai `Footprints`.
* **Bahasa UI Indonesia.** Tanggal `toLocaleDateString/String("id-ID", ...)` dengan `year: "numeric"` (JANGAN `"4-digit"`).
* **Hierarki teks:** judul seksi, label mikro, angka hero.

## 6. Kontrak Env

```
# backend
SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY
JWT_SECRET_KEY / ACCESS_TOKEN_EXPIRE_MINUTES
ADMIN_WHATSAPP

# frontend
VITE_API_BASE_URL / VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
```

## 7. Checklist Adaptasi per Proyek Baru

1. Ganti nama domain (misal: aset → resource, ADP → BAC).
2. Pertahankan: snapshot finansial, lifecycle status, auth JWT, export.
3. Sesuaikan: enum status, jenis layanan, dan satuan di skema + form.
4. Jangan bawa: kredensial, URL produksi lama, file database lokal.
