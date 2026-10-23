"""
Hapus seluruh objek di bucket Supabase Storage (default: transaksi-photos).

Bedanya dengan endpoint /internal/cleanup-fotos di backend: endpoint itu
berbasis retensi TTL (foto disaring berdasarkan umurnya), sedangkan script
ini menghapus SEMUA objek tanpa syarat — dipakai saat reset data sebelum
proyek direlease ulang / deploy.

Detail penting yang pernah memakan waktu di lapangan:
- Storage API merepresentasikan folder sebagai entri virtual: id=None,
  metadata=None. Entri yang PUNYA metadata = objek nyata; yang TIDAK punya
  = folder dan harus ditelusuri dengan list("<prefix><nama>/").
- Supabase Storage membatasi remove() maksimal 1000 objek per panggilan,
  jadi penghapusan dilakukan per batch kecil.
"""
import os
import sys

from dotenv import load_dotenv
from supabase import create_client, Client

BUCKET_DEFAULT = "transaksi-photos"
BATCH_MAKS = 500


def bersihkan_prefix(supabase: Client, bucket: str, prefix: str = "") -> int:
    """Telusuri prefix secara rekursif, hapus semua objek nyata di dalamnya.

    Folder virtual tidak perlu dihapus sendiri — begitu isinya kosong,
    Storage otomatis tidak menampilkannya lagi.
    """
    total = 0

    entri = supabase.storage.from_(bucket).list(
        prefix, {"limit": 1000, "offset": 0}
    ) or []

    file_objek = []
    folder = []
    for e in entri:
        nama = e.get("name")
        if not nama:
            continue
        if e.get("metadata"):
            file_objek.append(nama)
        else:
            folder.append(nama)

    for folder_n in folder:
        total += bersihkan_prefix(supabase, bucket, f"{prefix}{folder_n}/")

    for i in range(0, len(file_objek), BATCH_MAKS):
        batch = [f"{prefix}{n}" for n in file_objek[i : i + BATCH_MAKS]]
        supabase.storage.from_(bucket).remove(batch)
        total += len(batch)
        label = prefix or "(root)"
        print(f"    {bucket}/{label}: {total} objek total ...", end="\r")

    return total


def main():
    load_dotenv()
    url = os.getenv("SUPABASE_URL", "https://cssajztordwhsqaonzgn.supabase.co")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
    if not key:
        print("ERROR: SUPABASE_SERVICE_ROLE_KEY belum diisi di .env")
        sys.exit(1)

    bucket = sys.argv[1] if len(sys.argv) > 1 else BUCKET_DEFAULT
    supabase = create_client(url, key)

    print(f"Mulai membersihkan bucket: {bucket}")
    total = bersihkan_prefix(supabase, bucket)
    print(f"\nSelesai: {total} objek dihapus.")

    # Verifikasi akhir: daftar sisa entri beserta tipenya supaya jelas kalau
    # masih ada yang tertinggal — folder kosong secara normal sudah tidak
    # tampil, jadi entri sisa menandai ada objek yang tidak terjangkau.
    sisa = supabase.storage.from_(bucket).list()
    if not sisa:
        print("Verifikasi: bucket kosong.")
    else:
        print(f"Verifikasi: masih ada {len(sisa)} entri:")
        for e in sisa:
            tipe = "folder" if not e.get("metadata") else "file"
            print(f"  [{tipe}] {e.get('name')!r}")


if __name__ == "__main__":
    main()
