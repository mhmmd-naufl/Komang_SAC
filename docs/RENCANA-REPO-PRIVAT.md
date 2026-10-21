# Rencana: Repo Privat untuk File Sensitif

> **Status: BELUM DIJALANKAN.** Dokumen ini adalah rancangan, bukan
> deskripsi kondisi sekarang. `.gitignore` sudah disiapkan (`/privat/`), tapi
> folder `privat/` belum dibuat dan repo privatnya belum ada di GitHub.

---

## Masalah

`.env` dan `frontend/.env` sengaja tidak ikut commit ke repo publik. Konsekuensinya:

- Git hanya mengangkut **objek yang sudah di-commit**. File di `.gitignore`
  hidup hanya di disk itu.
- Saat pindah ke device baru, kredensial harus diisi manual ulang — prone
  salah ketik, dan sering berakhir dengan secret yang lebih lemah dari
  seharusnya.

Meanwhile repo publik `Komang_SAC` **wajib tetap publik** (untuk portofolio),
jadi kredensial tidak boleh masuk sana sama sekali.

## Solusi: repo kedua yang PRIVATE

Folder `privat/` di dalam project dijadikan **repo git terpisah** yang
di-push ke repo GitHub dengan visibility **Private**.

```
D:\Naufal\Komang SAC\
├── .git/            → repo PUBLIK   (origin)
├── privat/          → repo PRIVAT   (origin: Komang_SAC_privat)
│   ├── .git/
│   ├── .env           ← SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET_KEY,
│   │                    OPENROUTER_API_KEY, CLEANUP_TOKEN
│   ├── frontend.env   ← VITE_* (isinya dipublikasikan ke browser, tapi
│   │                    tetap disimpan supaya tidak perlu setup ulang)
│   ├── data/          ← dump SQL, ekspor transaksi, foto, data master
│   └── seed/          ← data master / seed realistis
├── .env            → opsional: override lokal (tetap .gitignore)
└── ...kode...
```

Kenapa **repo terpisah**, bukan branch di repo yang sama:

- Kredensial tidak pernah masuk history repo publik. Sekali pun tidak.
- Kalau tanpa sengaja `git push --all origin`, commit yang berisi secret ada di
  repo terpisah — bukan di repo publik.
- Repo privat bisa punya aturan akses sendiri (kolaborator, rotasi member).

### Kenapa file sensitif TIDAK dipindah ke root

Prinsipnya: **file tetap di tempat yang sudah biasa dipakai**, supaya tidak
ada yang rusak karena tiba-tiba pindah tempat.

- `.env` tetap dibaca dari root kalau ada (override lokal).
- `privat/.env` dibaca sebagai **cadangan** — cara application's
  `load_dotenv()` bekerja: file yang dimuat **pertama** menang, dan
  `override=False` berarti variabel yang sudah terisi tidak ditimpa.

Jadi urutan di `main.py`:

```python
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_BASE_DIR, ".env"))                     # lokal, menang
load_dotenv(os.path.join(_BASE_DIR, "privat", ".env"), override=False)  # cadangan
```

Nol duplikasi, nol drift. Root `.env` boleh ada (untuk override lokal) atau
tidak ada sama sekali.

---

## Rencana Eksekusi

### Fase 0 — Manual (browser, ±2 menit)

1. Buka <https://github.com/new>
2. Owner `mhmmd-naufl` · Nama `Komang_SAC_privat`
3. **Visibility: Private** ← WAJIB
4. **Jangan** centang "Add a README file" (biar push pertama bersih tanpa conflict)
5. Create → **verifikasi** halaman repo menampilkan badge **Private**

> Kalau kelewat jadi Public: hapus & buat ulang repo itu. Kredensial yang
> pernah ter-push ke publik = bocor permanen (commit masih ada di history
> walau branch-nya dihapus).

### Fase 1 — Pembersihan repo publik (sudah selesai)

- [x] 5 file scratch dibuang: `_check_active.py`, `_check_shoes.py`,
      `_fix_tersedia5.py`, `_test_db.py`, `_temp.txt`
- [x] `.gitignore` diperketat: `.env.*` + `!.env.example`, `/privat/`,
      `/_*.py`, `/_temp*.txt`, `*.bak`, `*.orig`, `*.rej`

### Fase 2 — Bikin repo privat di disk

```powershell
New-Item -ItemType Directory privat, privat\data, privat\seed
Move-Item .env privat\.env              # kredensial asli pindah ke sini
Copy-Item frontend\.env privat\frontend.env
```

`privat\.gitignore`:

```gitignore
# Repo ini SENGAJA menyimpan .env -- jangan pernah di-ignore.
*.log
```

`privat\README.md` — penjelasan singkat isi repo ini.

Init & push:

```powershell
cd privat
git init -b main
git add -A
git commit -m "privat: kredensial & data lokal Komang SAC"
git remote add origin https://github.com/mhmmd-naufl/Komang_SAC_privat.git
git push -u origin main
cd ..
```

### Fase 3 — Kode supaya baca dari `privat/` (3 file)

**`main.py`** (dekat baris 23-26):

```python
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_BASE_DIR, ".env"))
load_dotenv(os.path.join(_BASE_DIR, "privat", ".env"), override=False)
```

**`seed_pricelist.py`** (dekat baris 39-41) — potongan sama persis.

**`setup_env.py`** (baris 25-26 + sebelum `shutil.copyfile`):

```python
CONTOH = ".env.example"
TUJUAN = os.path.join("privat", ".env")
...
os.makedirs(os.path.dirname(TUJUAN), exist_ok=True)
```

Efeknya di device baru: `setup_env.py` tidak membuat `.env` baru, tapi
**mengisi `privat/.env` yang sudah ter-clone**.

Tidak perlu diubah: `check_schema.py`, `check_auth.py`, `test_api.py`,
`bootstrap_admin.py`, `manage_users.py` — semuanya `import main` → otomatis ikut.

### Fase 4 — Guard & dokumentasi

- `ci.yml` — tambah step "Pastikan folder privat/ tidak ikut ter-commit"
- `README.md` — bagian cara clone repo privat
- `docs/OPERASIONAL.md` — cara pakai `setup_env.py` setelah repo privat di-clone

### Fase 5 — Verifikasi

```powershell
git status                                    # clean
git ls-files | Select-String "privat"         # kosong
git -C privat ls-files | Select-String "\.env$"   # ada .env
.venv\Scripts\python.exe -c "import main; print('OK', main.SUPABASE_URL, len(main.JWT_SECRET))"
```

---

## Hasil Akhir: Migrasi ke Device Baru

```powershell
git clone https://github.com/mhmmd-naufl/Komang_SAC.git
cd Komang_SAC
git clone https://github.com/mhmmd-naufl/Komang_SAC_privat.git privat
Copy-Item privat\frontend.env frontend\.env     # 1 perintah, isinya VITE_* saja
```

`.venv` + `npm install` tetap dari nol seperti biasa. Kredensial backend
langsung terbaca dari `privat/.env` — tidak ada yang perlu diketik manual.

---

## Aturan Main

1. **Jangan pernah** `git add -f privat/` di repo publik.
2. Kalau `privat/` muncul sebagai untracked di `git status` repo publik, itu
   berarti `.gitignore` rusak — perbaiki sebelum commit apa pun.
3. Kalau pernah terlanjur push secret ke repo publik: **generate ulang key-nya
   di Supabase**. Menghapus commit tidak cukup, history masih menyimpan.
   `SUPABASE_SERVICE_ROLE_KEY` dan `JWT_SECRET_KEY` wajib dirotasi;
   `OPENROUTER_API_KEY` cukup di-revoke di OpenRouter.
