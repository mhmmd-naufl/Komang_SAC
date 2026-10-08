"""
Audit proteksi endpoint: pastikan hanya endpoint publik yang tanpa auth.

Jalankan:
    .\\.venv\\Scripts\\python.exe check_auth.py

Exit code 1 kalau ada endpoint non-publik yang terbuka.
"""

import inspect
import re
import sys

sys.path.insert(0, ".")

import main  # noqa: E402
from fastapi.routing import APIRoute  # noqa: E402

# Endpoint yang memang boleh terbuka untuk publik (tanpa login).
# PENTING: pakai pasangan (METHOD, PATH), bukan path saja. Kalau cuma path,
# POST/PUT/DELETE pada path yang sama ikut dianggap publik padahal butuh auth.
PUBLIK = {
    ("GET", "/"),
    ("GET", "/health"),
    # Info bisnis & metode bayar untuk halaman depan; tidak ada data sensitif
    ("GET", "/api/config"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/register"),
    # Katalog harga & lokasi mitra memang ditampilkan di halaman depan
    ("GET", "/api/sepatu"),
    ("GET", "/api/sepatu/{sepatu_id}"),
    ("GET", "/api/drop-points"),
    ("GET", "/api/drop-points/{dp_id}"),
    # Cek status pakai kode booking, TANPA login (itu fiturnya)
    ("GET", "/api/transaksi/tracking/{kode}"),
    # Pasangan lain dalam booking multi-pasang; data minimal (kode+status+layanan)
    ("GET", "/api/transaksi/grup/{grup_id}"),
}


def jumlah_auth(route: APIRoute) -> int:
    """Berapa banyak sub-dependency auth yang menempel ke route ini."""
    return len(route.dependant.dependencies)


def role_terpasang(route: APIRoute) -> str:
    """Cek require_role(...) dari source fungsi route."""
    try:
        src = inspect.getsource(route.endpoint)
    except (OSError, TypeError):
        return ""
    m = re.search(r'require_role\(([^)]*)\)', src)
    return m.group(1).strip() if m else ""


def run() -> int:
    rows = []
    terbuka = []

    for r in main.app.routes:
        if not isinstance(r, APIRoute):
            continue
        methods = sorted(m for m in r.methods if m != "HEAD")
        auth = jumlah_auth(r)
        # Satu route bisa punya >1 method (tidak terjadi di proyek ini, tapi
        # tetap aman: publik hanya kalau semua method-nya memang publik).
        publik = all((m, r.path) in PUBLIK for m in methods)

        if not auth and not publik:
            for m in methods:
                terbuka.append((m, r.path))

        for m in methods:
            rows.append((m, r.path, auth, (m, r.path) in PUBLIK, role_terpasang(r)))

    lebar = max(len(p) for _, p, *_ in rows) + 2
    print(f"{'METHOD':<7}{'PATH':<{lebar}}{'PROTEKSI':<24}ROLE")
    print("-" * (lebar + 46))
    for method, path, auth, publik, role in rows:
        if publik:
            ket = "PUBLIK (sengaja)"
        elif auth:
            ket = f"auth x{auth}"
        else:
            ket = "TERBUKA!"
        print(f"{method:<7}{path:<{lebar}}{ket:<24}{role}")

    total = len(rows)
    terlindungi = sum(1 for _, _, a, _, _ in rows if a)
    print("-" * (lebar + 46))
    print(f"{total} endpoint | {terlindungi} protected | {len(PUBLIK)} publik disengaja")

    if terbuka:
        print("\nMASIH TERBUKA:")
        for m, p in terbuka:
            print(f"  {m} {p}")
        return 1

    print("\nOK: semua endpoint non-publik sudah dilindungi auth.")
    return 0


if __name__ == "__main__":
    sys.exit(run())