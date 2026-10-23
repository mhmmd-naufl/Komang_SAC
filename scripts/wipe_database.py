"""
Hapus data dari tabel yang disebut di baris perintah, dipaginasi per batch.

Argumen tabel yang valid diberikan di WIPE_OK. profiles sengaja tidak pernah
masuk daftar itu — data akun tidak boleh ikut terhapus oleh operasi kebersihan.

Alur per tabel:
  1. Tarik id sebanyak BATCH per halaman.
  2. .delete().in_("id", ids) — PostgREST menolak DELETE tanpa filter,
     jadi penghapusan selalu via daftar id konkret supaya eksplisit.
  3. Ulangi sampai halaman kosong.
"""
import os
import sys

from dotenv import load_dotenv
from supabase import create_client, Client

# Tabel yang BOLEH dibersihkan. Jangan menambah profiles ke sini.
WIPE_OK = ("transactions", "stock", "expenses", "shoes", "drop_points")
BATCH = 500


def wipe_tabel(supabase: Client, tabel: str) -> int:
    total = 0
    while True:
        ids = [
            r["id"]
            for r in (
                supabase.table(tabel)
                .select("id")
                .range(0, BATCH - 1)
                .execute()
                .data
                or []
            )
        ]
        if not ids:
            break
        supabase.table(tabel).delete().in_("id", ids).execute()
        total += len(ids)
        print(f"    {tabel}: {total} baris terhapus ...", end="\r")
    return total


def main():
    load_dotenv()
    url = os.getenv("SUPABASE_URL", "https://cssajztordwhsqaonzgn.supabase.co")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
    if not key:
        print("ERROR: SUPABASE_SERVICE_ROLE_KEY belum diisi di .env")
        sys.exit(1)

    tabels = sys.argv[1:]
    if not tabels:
        print(f"Pemakaian: python wipe_database.py <tabel> ... (pilihan: {', '.join(WIPE_OK)})")
        sys.exit(1)
    tidak_valid = [t for t in tabels if t not in WIPE_OK]
    if tidak_valid:
        print(f"ERROR: tabel ini tidak boleh ikut dihapus: {', '.join(tidak_valid)}")
        sys.exit(1)

    supabase = create_client(url, key)
    print(f"Mulai menghapus: {', '.join(tabels)}")
    for tabel in tabels:
        jumlah = wipe_tabel(supabase, tabel)
        print(f"  {tabel:15s}: {jumlah} baris dihapus")

    # Verifikasi akhir: pastikan benar-benar kosong
    print("\nVerifikasi (sisa baris):")
    for tabel in tabels:
        sisa = supabase.table(tabel).select("id").range(0, 1).execute().data or []
        print(f"  {tabel:15s}: {'KOSONG' if not sisa else 'MASIH ADA DATA!' }")


if __name__ == "__main__":
    main()
