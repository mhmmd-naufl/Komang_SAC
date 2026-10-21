# design.md (UI/UX Design System) — Komang SAC

> Acuan desain seluruh frontend (`frontend/src`). Gaya: minimalis, mobile-first, bahasa Indonesia.

## 1. Prinsip Desain

1. **Minimalis & cepat:** satu layar satu tugas. Navigasi lewat `Navbar.jsx` + `react-router-dom` (rute publik vs rute admin terproteksi).
2. **Bisa dipakai tanpa login:** katalog dan cek status terbuka. Hanya area admin/teknisi/drop point yang butuh JWT.
3. **Kartu membulat:** kontainer `rounded-2xl border border-slate-100 bg-white shadow-card`; aksen `bg-primary-50` / `border-primary-100`.
4. **Hierarki teks:** judul seksi `text-xs font-bold uppercase tracking-wider text-slate-600`; angka hero `text-xl sm:text-2xl font-bold`; label mikro `text-xs`.
5. **Umpan balik instan:** spinner saat loading, `Toast.jsx` untuk sukses/error, badge status berwarna, empty-state eksplisit (jangan layar kosong).

## 2. Palet & Tipografi

* **Warna:** netral `slate` (teks/latar), primer `blue` (aksi), sukses `emerald`, peringatan `amber`, bahaya `rose`, info `sky/cyan`. **Tanpa indigo.**
* **Badge status:** Diterima `blue`, Diproses `amber`, Diperiksa `violet`, Selesai `emerald`, Siap diambil `cyan`.
* **Rupiah:** selalu lewat `formatRupiah()` di `utils/helpers.js` — jangan format manual.
* **Tanggal:** `toLocaleDateString/String("id-ID", ...)` dengan `year: "numeric"` (BUKAN `"4-digit"` — tidak valid).
* **Ikon:** lucide-react. **Catatan:** versi 0.294 tidak punya ikon `Shoe` — pakai `Footprints`.
* **Kelas utility yang tersedia:** `btn`, `btn-primary`, `btn-secondary`, `btn-danger`, `btn-ghost`, `input`, `card`, `card-primary`, `badge-*`, `container-main`, `animate-fade-in`, `animate-slide-up`.

## 3. Halaman & Komponen

| Komponen | Peran & Isi |
|----------|-------------|
| `Navbar.jsx` | Navigasi publik; dropdown user saat login; link "Admin" hanya untuk role admin |
| `Catalog.jsx` | Grid cards publik: merk/model, badge treatment, keterangan, harga; klik → `BookingModal` |
| `BookingModal.jsx` | 2 langkah — pilih treatment/drop point/bayar/catatan, lalu konfirmasi; hasil = kode tracking `KS-XXXXXX` |
| `StatusTracker.jsx` | Cari lewat kode tracking; progress vertikal 5 tahap; catatan pelanggan; tombol kabari admin saat siap diambil |
| `LoginModal.jsx` | Halaman `/login`; tab Masuk / Daftar; simpan token JWT |
| `AdminDashboard.jsx` | 4 kartu statistik, tabel transaksi terbaru, komisi per teknisi, daftar stok menipis |
| `AdminLayout` (di `App.jsx`) | Sidebar responsif + route guard per role (`ProtectedRoute`) |
| `Toast.jsx` | Notifikasi `success` / `error` / `warning` / `info` |
| `AuthContext.jsx` | State auth global: `user`, `loading`, `login`, `register`, `logout` |

> Halaman CRUD admin (`sepatu`, `transaksi`, `stock`, `users`) saat ini masih
> placeholder di `App.jsx` — lihat `plan.md` Phase 3.

## 4. Kontrak Data ↔ UI

* `statsApi.admin()` → `{ total_transaksi, shoes_washed, total_pendapatan, total_teknisi, per_teknisi[], per_status }`.
* `transactionsApi.tracking(kode)` → `{ id (kode), status, harga, created_at, catatan_konsumen, photo_before, photo_after, shoes, drop_point }`.
* `transactionsApi.list(params)` → array transaksi dengan kolom `kode`, `status`, `harga`, `created_at`.
* `stockApi.list({ low_stock: true })` → item dengan `jumlah <= batas_minimum`.
* Base URL API: `import.meta.env.VITE_API_BASE_URL` di `services/api.js`.
* **Setiap layar WAJIB punya fallback mock** supaya UI tetap bisa direview saat backend mati.

## 5. Aturan Tambah UI Baru (Vibecoding)

1. Ikuti pola kartu `rounded-2xl border border-slate-100 bg-white p-6` dan tombol `btn-primary`.
2. Setiap fetch wajib punya state `loading` + `error` + empty-state.
3. Format angka/tanggal hanya lewat `utils/helpers.js` — jangan inline `toLocaleString`.
4. Teks UI Bahasa Indonesia; kunci env diawali `VITE_` dan tidak boleh berisi secret.
5. Jangan pernah menampilkan `tech_commission` ke teknisi (lihat `prd.md` §3.3).
6. Chart baru: Recharts + `ResponsiveContainer`, tick kecil (`fontSize: 10, fill #94a3b8`), tanpa garis sumbu.

## 6. Design Token

* **Warna utama:** `blue-50` (latar), `blue-100` (border), `blue-600` (aksi), `blue-700` (teks), `blue-500` (hover).
* **Warna bantuan:** `emerald-500` (sukses), `amber-500` (peringatan), `rose-500` (bahaya), `slate-500` (teks abu).
* **Radius:** `rounded-2xl` (kontainer), `rounded-xl` (tombol/input).
* **Typografi:** Inter, `text-xs font-bold uppercase tracking-wider` (judul), `text-xl font-bold` (angka).
* **Shadow:** `shadow-sm` (elemen ringan), `shadow-card` (kartu), `shadow-lg` (modal).

## 7. Responsive Behavior

* **Mobile-first:** semua komponen responsif hingga 375px.
* **Tabel:** horizontal scroll (`overflow-x-auto`) pada layar kecil.
* **Navbar:** link non-esensial disembunyikan di mobile, user menu jadi dropdown.
* **Sidebar admin:** off-canvas di mobile, fixed di `lg+`.

---

*Palet biru & putih tanpa indigo adalah kesepakatan eksplisit dengan klien.*
