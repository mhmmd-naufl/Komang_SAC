"""Hitung ulang komisi teknisi (default 40%) untuk transaksi yang sudah ada.

Latar belakang: dua jalur assign teknisi -- `POST /transaksi/{id}/claim` dan
`PUT /transaksi/{id}/status` oleh teknisi -- sebelumnya mengisi `tech_id`
tanpa menghitung `tech_commission`. Akibatnya transaksi yang dikerjakan
teknisi tersimpan dengan komisi 0, padahal kode yang baru sudah 40%.

Aturan yang dipakai sama dengan backend:
  - pengerja ber-role technician -> 40% dari harga
  - admin / tanpa pengerja / role lain -> 0 (admin kerja sendiri, tanpa potongan)

Pemakaian:
    python scripts/hitung_ulang_komisi.py            # dry-run, hanya lihat
    python scripts/hitung_ulang_komisi.py --apply    # simpan perubahan
"""
import os
import sys

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.getenv("SUPABASE_URL", "https://cssajztordwhsqaonzgn.supabase.co")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
c = create_client(url, key)

PERSEN = int(os.getenv("TECHNICIAN_COMMISSION_PERCENT", "40"))


def ambil_semua(tabel: str, kolom: str) -> list[dict]:
    """Ambil seluruh baris, lewati batas 1000 baris per request Supabase."""
    hasil, mulai, ukuran = [], 0, 1000
    while True:
        batch = (
            c.from_(tabel)
            .select(kolom)
            .range(mulai, mulai + ukuran - 1)
            .execute()
            .data
            or []
        )
        hasil.extend(batch)
        if len(batch) < ukuran:
            return hasil
        mulai += ukuran


transaksi = ambil_semua(
    "transactions", "id, kode, harga, tech_commission, tech_id, status"
)
profil = ambil_semua("profiles", "id, full_name, role")
peran = {p["id"]: (p.get("role") or "") for p in profil}
nama = {p["id"]: (p.get("full_name") or p["id"]) for p in profil}

perubahan = []
for t in transaksi:
    harga = t.get("harga") or 0
    pengerja = t.get("tech_id")
    seharusnya = int(harga * PERSEN / 100) if peran.get(pengerja) == "technician" else 0
    sekarang = t.get("tech_commission") or 0
    if seharusnya != sekarang:
        perubahan.append((t, seharusnya, sekarang))

print(f"Total transaksi       : {len(transaksi)}")
print(f"Perlu dihitung ulang  : {len(perubahan)}")
print(f"Persentase komisi     : {PERSEN}%")

for t, baru, lama in perubahan:
    pengerja = nama.get(t.get("tech_id"), "-") if t.get("tech_id") else "tanpa pengerja"
    print(
        f"  {t.get('kode') or t['id'][:8]} | {t.get('status'):13} | "
        f"harga {t.get('harga') or 0:>7} | {pengerja:20} | "
        f"{lama:>7} -> {baru:>7}"
    )

if not perubahan:
    print("\nSemua komisi sudah sesuai. Tidak ada yang perlu disimpan.")
    sys.exit(0)

if "--apply" not in sys.argv:
    print("\nDry-run. Tambahkan --apply untuk menyimpan perubahan di atas.")
    sys.exit(0)

gagal = 0
for t, baru, _ in perubahan:
    try:
        c.from_("transactions").update({"tech_commission": baru}).eq(
            "id", t["id"]
        ).execute()
    except Exception as exc:  # noqa: BLE001 - laporkan baris yang gagal, lanjut
        gagal += 1
        print(f"  GAGAL {t.get('kode') or t['id']}: {exc}")

print(f"\nSelesai. Diperbarui: {len(perubahan) - gagal}, gagal: {gagal}")
