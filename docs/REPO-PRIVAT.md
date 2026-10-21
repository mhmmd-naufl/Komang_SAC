# Repo Privat untuk File Sensitif

> **Status: SUDAH DIIJALANKAN.** Repo privatnya ada di
> <https://github.com/mhmmd-naufl/Komang_SAC_privat> (visibility **Private**),
> folder `privat/` sudah dibuat, dan backend sudah membaca `.env` dari sana.
> Dokumen ini menjelaskan setup tersebut sekaligus cara memindahkannya ke
> device baru.

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

## Yang Sudah Dijalankan

### Fase 0 — Repo privat dibuat (manual)

1. Dibuat di <https://github.com/new> — owner `mhmmd-naufl`, nama
   `Komang_SAC_privat`
2. **Visibility: Private** ✅ (diverifikasi: API anonim balas 404, `ls-remote`
   dengan kredensial berhasil)
3. Tidak dicentang "Add a README file", jadi push pertama bersih tanpa conflict

### Fase 1 — Pembersihan repo publik

- [x] 5 file scratch dibuang: `_check_active.py`, `_check_shoes.py`,
      `_fix_tersedia5.py`, `_test_db.py`, `_temp.txt`
- [x] `.gitignore` diperketat: `.env.*` + `!.env.example`, `/privat/`,
      `/_*.py`, `/_temp*.txt`, `*.bak`, `*.orig`, `*.rej`

### Fase 2 — Repo privat di disk

```powershell
New-Item -ItemType Directory privat, privat\data, privat\seed
Move-Item .env privat\.env              # kredensial asli pindah ke sini
Copy-Item frontend\.env privat\frontend.env
```

`privat\.gitignore` — **tidak** meng-ignore `.env` (justru itu isi utamanya),
hanya `*.log`, `__pycache__/`, `*.bak|orig|rej`.

`privat\README.md` — penjelasan isi repo + aturan mainannya.

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

Isi repo privat sekarang: `.env`, `frontend.env`, `.gitignore`, `README.md`,
`data/.gitkeep`, `seed/.gitkeep`.

### Fase 3 — Kode supaya baca dari `privat/` (3 file)

**`main.py`**:

```python
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_BASE_DIR, ".env"))
load_dotenv(os.path.join(_BASE_DIR, "privat", ".env"), override=False)
```

**`seed_pricelist.py`** — potongan sama persis.

**`setup_env.py`**:

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

- [x] `ci.yml` — step "Pastikan folder privat/ tidak ikut ter-commit"
- [x] `docs/OPERASIONAL.md` — setup env + bagian "Migrasi ke Device Baru"
- [x] `docs/ARSITEKTUR.md` — tabel proteksi

### Fase 5 — Verifikasi

```powershell
git status                                    # clean
git ls-files | Select-String "privat"         # kosong (folder-nya tidak ter-track)
git check-ignore -v privat                    # .gitignore:51:/privat/
git -C privat ls-files | Select-String "\.env$"   # ada .env
.venv\Scripts\python.exe -c "import main; print('OK', main.SUPABASE_URL, len(main.JWT_SECRET))"
```

Semua ✅ — dan `test_api.py` tetap 126 lulus, 0 gagal.

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
