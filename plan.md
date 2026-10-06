# plan.md (Development Roadmap) — Komang SAC

Status per Oktober 2026. `[x]` sudah ada di kode · `[ ]` belum.

---

## Phase 0: Dokumen & Keputusan — ✅

- [x] `blueprint.md` — stack, pola skema, modul, design token
- [x] `prd.md` — spesifikasi fitur per role
- [x] `design.md` — sistem desain UI
- [x] `summary.md` — ringkasan untuk partner
- [x] `data.md` — format intake data master (Google Form → Excel)
- [x] Keputusan: Supabase-only backend (menghindari tagihan kartu kredit)

## Phase 1: Database — ✅

- [x] Proyek Supabase dibuat (`cssajztordwhsqaonzgn`)
- [x] 5 tabel: `profiles`, `shoes`, `drop_points`, `transactions`, `stock`
- [x] Kolom `jenis_treatment` + `keterangan_treatment` di `shoes`
- [x] Kolom `catatan_konsumen` + `tech_commission` di `transactions`
- [x] Trigger auto-update `transactions.updated_at`
- [x] `schema.sql` (instalasi baru) & `migrate.sql` (DB lama) — ✅ ditulis
- [ ] Seed `shoes` dari price list klien (**menunggu data dari Excel**)
- [ ] RLS + policy Supabase (**WAJIB sebelum deploy publik**)
- [ ] Storage bucket + Object TTL policy (hapus foto otomatis 7–30 hari)

## Phase 2: Backend FastAPI — ✅

- [x] `main.py` — CRUD `sepatu`, `transaksi`, `users`, `drop-points`, `stock`
- [x] `GET /health` + `GET /`
- [x] Auth JWT: login, register, me, set-password (PBKDF2-SHA256)
- [x] `GET /api/transaksi/tracking/{kode}` untuk cek status publik
- [x] `GET /api/stats/admin` untuk dashboard
- [x] Validasi `photo_after` wajib sebelum status Selesai/Siap diambil
- [x] Kunci & secret dipindah ke `.env` (lihat `.env.example`)
- [x] `bootstrap_admin.py` — set password admin sekali jalan
- [ ] Upload foto ke Supabase Storage + kompresi 2 MB
- [ ] Export Excel/CSV
- [ ] `requirements.txt` lengkap

## Phase 3: Frontend React + Vite — ✅ (build lolos)

- [x] Vite + Tailwind + palette biru/putih
- [x] `Navbar`, `Catalog`, `BookingModal`, `StatusTracker`, `LoginModal`
- [x] `AdminDashboard` + `AdminLayout` + route guard per role
- [x] `services/api.js` (axios + interceptor token + pesan error ramah)
- [x] `contexts/AuthContext.jsx`
- [x] `components/Toast.jsx`
- [x] Fallback mock agar UI tetap bisa direview tanpa backend
- [x] `npm run build` sukses
- [ ] Halaman CRUD admin: `sepatu`, `transaksi`, `stock`, `users`
- [ ] Halaman `/teknisi` — antrian + upload foto (tanpa angka komisi)
- [ ] Halaman `/drop-point`
- [ ] Supabase Realtime agar status berubah tanpa refresh

## Phase 4: Laporan & WhatsApp — ⬜

- [ ] Generator template pesan + tombol `wa.me` (semi-manual, tanpa WA API)
- [ ] Grafik pendapatan bulanan + top treatment
- [ ] Laporan stok bahan terpakai
- [ ] Filter + export CSV

## Phase 5: Deploy — ⬜

- [ ] Jalankan `migrate.sql` di Supabase
- [ ] Isi `.env` backend (JWT_SECRET acak)
- [ ] Deploy frontend ke Vercel + set `VITE_API_BASE_URL`
- [ ] Jalankan `bootstrap_admin.py`
- [ ] **Aktifkan RLS sebelum dibuka ke publik**
- [ ] Import data master dari Excel klien

---

## Risiko yang sudah diketahui

| Risiko | Mitigasi |
|---|---|
| Anon key bocor | RLS belum aktif — **wajib** diaktifkan sebelum deploy |
| Free tier penuh | Kuota 1 GB storage ≈ 500–1000 foto, jadi TTL 7–30 hari wajib |
| Admin lupa ganti password awal | `bootstrap_admin.py` + arahan ganti setelah login pertama |
| `JWT_SECRET` bawaan | Ganti lewat `.env` sebelum deploy |

## Success Metrics

- 50 konsumen aktif bulanan
- 90% status di-update tepat waktu
- 80% transaksi punya foto before/after
- Biaya bulanan: **Rp 0**

## Out of Scope

- Aplikasi mobile native (hanya web responsif)
- WhatsApp Business API (pakai `wa.me` semi-manual)
- Payment gateway online (bayar di tempat)
- Multi-cabang

---

*Folder `content-planner/` adalah proyek terpisah (content planner media sosial
Google Apps Script) dan akan dipindahkan keluar dari repo ini.*
