"""
Backup seluruh tabel Komang SAC ke file JSON lokal.

Dipakai SEBELUM operasi penghapusan besar supaya ada salinan yang bisa
dipulihkan: profile akun sampai transaksi. Pemaginasiannya memakai range()
karena kalau ditarik sekaligus, PostgREST memotong hasil di limit default.
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client, Client

TABEL = ["profiles", "shoes", "drop_points", "transactions", "stock", "expenses"]
HALAMAN = 1000


def tarik_semua(supabase: Client, tabel: str) -> list:
    """Tarik seluruh baris satu tabel, per halaman 1000 baris."""
    rows = []
    offset = 0
    while True:
        chunk = (
            supabase.table(tabel)
            .select("*")
            .range(offset, offset + HALAMAN - 1)
            .execute()
            .data
            or []
        )
        if not chunk:
            break
        rows.extend(chunk)
        offset += HALAMAN
    return rows


def cari_kunci() -> tuple:
    load_dotenv()
    url = os.getenv("SUPABASE_URL", "https://cssajztordwhsqaonzgn.supabase.co")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
    if not key:
        print("ERROR: SUPABASE_SERVICE_ROLE_KEY belum diisi di .env")
        sys.exit(1)
    return url, key


def main():
    url, key = cari_kunci()
    supabase = create_client(url, key)

    dump = {}
    for tabel in TABEL:
        try:
            dump[tabel] = tarik_semua(supabase, tabel)
            print(f"  {tabel:15s}: {len(dump[tabel])} baris")
        except Exception as exc:
            print(f"  {tabel:15s}: GAGAL ({type(exc).__name__}) — backup berhenti.")
            sys.exit(2)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    keluar = Path(__file__).resolve().parent.parent / f"backup_komangsac_{stamp}.json"
    keluar.write_text(
        json.dumps(dump, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"\nBackup tersimpan: {keluar}")
    print("PERHATIAN: file ini berisi hash password & data pelanggan.")
    print("Simpan di tempat aman, jangan pernah di-commit ke git.")


if __name__ == "__main__":
    main()
