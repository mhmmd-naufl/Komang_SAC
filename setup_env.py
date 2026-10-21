"""
setup_env.py -- buat file .env di laptop baru, sekali jalan.

Kenapa file ini ada:
    .env berisi rahasia (kunci database, API key), jadi sengaja TIDAK ikut
    ter-commit ke repo publik. Script ini menyalin .env.example lalu menanya
    bagian yang kosong, supaya tidak ada yang salah ketik atau lupa mengisi.

    File yang dibuat ada di privat/.env -- folder repo privat, yang isinya
    ikut ter-clone ke laptop baru. Kalau privat/.env sudah ada (sudah
    ter-clone), script cuma mengisi bagian yang masih kosong.

Pakai:
    .\\.venv\\Scripts\\python.exe setup_env.py

Aman dijalankan berkali-kali:
    * privat/.env belum ada -> dibuat dari .env.example lalu ditanya 5 rahasia.
    * privat/.env sudah ada -> TIDAK ditimpa. Cuma mengisi yang masih kosong.
    * Tidak ada nilai rahasia yang dicetak balik ke layar.
"""

import os
import re
import secrets
import shutil
import sys

CONTOH = ".env.example"
# Kredensial utama tinggal di repo privat (folder privat/, gitignored di
# repo publik). Script ini mengisi file di sana, bukan di root -- supaya
# nilainya ikut ter-carry ke laptop baru bersama folder privatnya.
TUJUAN = os.path.join("privat", ".env")

# --- Lima rahasia yang TIDAK boleh ada di GitHub -------------------------
# Isian umum (nama bisnis, alamat, drop point, model AI) sudah ter-commit
# di .env.example, jadi tidak perlu ditanya lagi.
RAHASIA = [
    {
        "kunci": "SUPABASE_SERVICE_ROLE_KEY",
        "judul": "Supabase service_role key",
        "darimana": (
            "Supabase Dashboard -> Project Settings -> API Keys -> "
            "service_role (Legacy)."
        ),
        "kenapa": (
            "Backend memakai kunci ini untuk menulis ke database. "
            "TANPA INI backend tidak mau nyala sama sekali."
        ),
        "generate": False,
        "harus_pola": r"^eyJ",
        "pola_nama": "biasanya diawali 'eyJ'",
    },
    {
        "kunci": "SUPABASE_SERVICE_KEY",
        "judul": "Supabase service key (alias lama)",
        "darimana": "Nilai yang SAMA PERSIS dengan service_role key di atas.",
        "kenapa": (
            "Dipakai kalau variabel di atas kosong. Isi sama saja -- "
            "ini cuma nama lain."
        ),
        "generate": False,
        "harus_pola": r"^eyJ",
        "pola_nama": "harus sama dengan service_role key",
    },
    {
        "kunci": "JWT_SECRET_KEY",
        "judul": "JWT secret (tanda tangan login)",
        "darimana": (
            "Bebas. Kalau pindah dari laptop lain, salin nilainya dari .env "
            "laptop itu supaya semua orang yang sudah login tidak keluar."
        ),
        "kenapa": (
            "Ini yang menandatangani sesi login. Kalau nilainya berubah, "
            "SEMUA user yang sedang login akan keluar dan harus login ulang."
        ),
        "generate": True,
        "harus_pola": None,
        "pola_nama": "minimal 32 karakter acak",
    },
    {
        "kunci": "OPENROUTER_API_KEY",
        "judul": "OpenRouter API key (ringkasan AI)",
        "darimana": "https://openrouter.ai/keys -> Create Key.",
        "kenapa": (
            "Opsional. Kalau dikosongkan, dashboard tetap jalan -- ringkasan "
            "AI otomatis jatuh ke perhitungan aturan biasa."
        ),
        "generate": False,
        "harus_pola": r"^sk-or-",
        "pola_nama": "biasanya diawali 'sk-or-'",
        "boleh_kosong": True,
    },
    {
        "kunci": "CLEANUP_TOKEN",
        "judul": "Token cleanup foto",
        "darimana": (
            "Salin dari .env laptop lain, atau tekan [g] untuk bikin baru. "
            "Kalau bikin BARU, kamu juga harus mengganti secret "
            "CLEANUP_TOKEN di GitHub Actions."
        ),
        "kenapa": (
            "Ini kata sandi khusus yang dipakai cron GitHub Actions untuk "
            "memanggil penghapusan foto tiap hari."
        ),
        "generate": True,
        "harus_pola": None,
        "pola_nama": "minimal 32 karakter acak",
    },
]


def _tampil_pendek(nilai: str) -> str:
    """Tampilkan hanya sebagian kecil nilai, supaya rahasia tidak bocor
    lewat layar, riwayat terminal, atau screenshot."""
    if not nilai:
        return "(kosong)"
    if len(nilai) <= 8:
        return f"{nilai[:2]}*** (panjang {len(nilai)})"
    return f"{nilai[:4]}...{nilai[-2:]} (panjang {len(nilai)})"


def _validasi(rahasia: dict, nilai: str) -> list[str]:
    """Kembalikan daftar peringatan (bukan error fatal)."""
    peringatan = []
    panjang_min = 32 if rahasia["kunci"] in ("JWT_SECRET_KEY", "CLEANUP_TOKEN") else 8
    if len(nilai) < panjang_min:
        peringatan.append(f"kelihatannya terlalu pendek (minimal {panjang_min} karakter)")

    if rahasia.get("harus_pola") and not re.search(rahasia["harus_pola"], nilai):
        peringatan.append(f"tidak cocok pola {rahasia['pola_nama']}")

    # Deteksi nilai contoh yang belum diganti.
    for tanda in ("ganti", "isi-", "xxx", "your-", "tempel", "disini"):
        if tanda in nilai.lower():
            peringatan.append("kelihatannya masih nilai contoh, bukan nilai asli")
            break
    return peringatan


def _baca_template() -> str:
    if not os.path.exists(CONTOH):
        sys.exit(
            f"Tidak menemukan {CONTOH}. Jalankan script ini dari folder "
            "project (tempat file requirements.txt berada)."
        )
    with open(CONTOH, encoding="utf-8") as f:
        return f.read()


def _pastikan_folder_project() -> None:
    """Gagal cepat kalau dijalankan dari folder yang salah.

    Tanpa pemeriksaan ini, script bisa diam-diam membaca dan menulis .env
    di folder lain (mis. folder yang isinya .env.example serupa). Gejalanya
    membingungkan: semua dianggap sudah terisi padahal .env yang benar
    masih kosong. main.py ada HANYA di root project, jadi dipakai penanda.
    """
    penanda = ("main.py", "requirements.txt", "frontend")
    ada = [p for p in penanda if os.path.exists(p)]
    if len(ada) < 2:
        sys.exit(
            "Folder ini bukan root project Komang SAC.\n"
            f"  Yang ditemukan di sini : {ada or '(tidak ada satu pun)'}\n"
            "  Yang dicari            : main.py, requirements.txt, frontend/\n\n"
            "  Pindah dulu ke folder project, lalu jalankan ulang:\n"
            "      cd \"D:\\Naufal\\Komang SAC\"\n"
            "      .venv\\Scripts\\python.exe setup_env.py"
        )


def _baris_kosong(isian: str, kunci: str) -> bool:
    """True kalau variabel belum ada atau nilainya masih kosong."""
    pola = re.compile(rf"^\s*{re.escape(kunci)}\s*=(.*)$", re.MULTILINE)
    cocok = pola.search(isian)
    if not cocok:
        return True  # belum ada barisnya sama sekali
    return not cocok.group(1).strip()


def _tulis_nilai(isian: str, kunci: str, nilai: str) -> str:
    """Timpa (atau tambahkan) satu nilai di .env, komentar tetap utuh."""
    pola = re.compile(rf"^(\s*{re.escape(kunci)}\s*=).*$", re.MULTILINE)
    if pola.search(isian):
        return pola.sub(lambda m: f"{m.group(1)}{nilai}", isian, count=1)
    # Belum ada barisnya -> tambahkan di paling bawah.
    return isian.rstrip("\n") + f"\n{kunci}={nilai}\n"


def main() -> None:
    print("=" * 62)
    print("  SETUP .env -- Komang SAC")
    print("=" * 62)
    print()

    _pastikan_folder_project()

    if os.path.exists(TUJUAN):
        print(f"{TUJUAN} SUDAH ADA. File ini TIDAK akan ditimpa.")
        print("Cuma bagian yang masih kosong yang akan ditanya.\n")
        with open(TUJUAN, encoding="utf-8") as f:
            isian = f.read()
    else:
        isian = _baca_template()
        # Folder privat/ belum tentu ada di laptop baru.
        folder = os.path.dirname(TUJUAN)
        if folder:
            os.makedirs(folder, exist_ok=True)
        shutil.copyfile(CONTOH, TUJUAN)
        print(f"Membuat {TUJUAN} baru dari {CONTOH}.\n")

    perlu_diisi = [r for r in RAHASIA if _baris_kosong(isian, r["kunci"])]

    if not perlu_diisi:
        print("Semua rahasia sudah terisi. Tidak ada yang perlu dilakukan.")
        print(f"\n{TUJUAN} siap dipakai.")
        return

    print(f"Ada {len(perlu_diisi)} bagian yang perlu diisi.\n")
    print("-" * 62)
    print("CATATAN PENTING:")
    print("  Kalau kamu pindah dari laptop lain, buka privat/.env laptop lama")
    print("  lalu salin nilainya dari sana. Itu cara paling aman karena")
    print("  semua token yang sudah beredar tetap berlaku.")
    print("-" * 62)

    for rahasia in perlu_diisi:
        print()
        print(f"[{rahasia['kunci']}]")
        print(f"  Isi    : {rahasia['judul']}")
        print(f"  Ambil  : {rahasia['darimana']}")
        print(f"  Fungsi : {rahasia['kenapa']}")

        while True:
            tanya = "  Nilai (kosongkan kalau boleh kosong"
            if rahasia.get("generate"):
                tanya += ", atau [g] untuk bikin baru"
            tanya += "): "

            nilai = input(tanya).strip()

            if nilai.lower() == "g" and rahasia.get("generate"):
                nilai = secrets.token_urlsafe(32)
                print(f"  -> dibuatkan: {_tampil_pendek(nilai)}")
            elif not nilai and rahasia.get("boleh_kosong"):
                pass  # memang diperbolehkan kosong
            elif not nilai:
                print("  ! Wajib diisi. Ketik nilainya, atau [g] kalau tersedia.")
                continue

            if not nilai:
                break

            peringatan = _validasi(rahasia, nilai)
            if peringatan:
                print(f"  ! Peringatan: {', '.join(peringatan)}")
                yakin = input("  Tetap pakai nilai ini? [y/N]: ").strip().lower()
                if yakin != "y":
                    continue

            isian = _tulis_nilai(isian, rahasia["kunci"], nilai)
            break

    with open(TUJUAN, "w", encoding="utf-8") as f:
        f.write(isian)

    print()
    print("=" * 62)
    print(f"  {TUJUAN} selesai ditulis.")
    print("=" * 62)

    # Ingatkan langkah lanjutan yang gampang dilupakan.
    if _baris_kosong(isian, "CLEANUP_TOKEN"):
        pass  # sudah diizinkan kosong, tidak perlu diingatkan
    else:
        print(
            "\nJANGAN LUPA: kalau CLEANUP_TOKEN dibuat BARU (bukan disalin\n"
            "dari laptop lama), ganti juga secret 'CLEANUP_TOKEN' di GitHub:\n"
            "  Settings -> Secrets and variables -> Actions\n"
            "Kalau tidak, cron hapus foto tiap hari akan ditolak terus."
        )

    print("\nLangkah berikutnya:")
    print("  1. Jalankan: .\\.venv\\Scripts\\python.exe check_schema.py")
    print("     (memastikan database terhubung dengan benar)")
    print("  2. Jalankan: .\\.venv\\Scripts\\python.exe bootstrap_admin.py")
    print("     (sekali saja, untuk set password admin)")
    print("  3. Jalankan: .\\.venv\\Scripts\\python.exe uvicorn main:app --reload --port 8001")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nDibatalkan. Perubahan belum ditulis.")
        sys.exit(130)
