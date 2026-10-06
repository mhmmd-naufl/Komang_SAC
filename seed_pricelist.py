r"""
=============================================================
Komang SAC — Seed DAFTAR HARGA ASLI
=============================================================
Mengisi tabel `shoes` dengan price list Komang SAC yang sebenarnya, menggantikan
data dummy (Nike Air Force 1, Adidas Ultraboost, ...) jadi layanan asli.

Satu baris `shoes` = satu VARIAN LAYANAN:
  merk   -> nama layanan      (mis. "Deep Cleaning")
  model  -> varian            (mis. "White")
  kelompok -> grup katalog    (3 grup, sesuai daftar harga resmi)

CARA PAKAI
---------
  .venv\Scripts\python.exe seed_pricelist.py            # upsert + hapus dummy
  .venv\Scripts\python.exe seed_pricelist.py --dry-run  # lihat dulu, ubah apa saja
  .venv\Scripts\python.exe seed_pricelist.py --keep-dummy  # jangan hapus dummy

CATATAN PENTING
---------------
1. Script INI IDEMPOTEN. Diulang berkali-kali aman: baris yang sudah ada
   di-update according to daftar harga, bukan diduplikasi.
2. Kolom `harga_min`, `harga_max`, `kelompok` harus sudah ada -> jalankan
   migrate.sql bagian [6] dulu di Supabase SQL Editor.
3. Baris dummy TIDAK bisa dihapus lewat SQL biasa karena ada transaksi yang
   masih memakainya (FK RESTRICT). Script ini menonaktifkannya dulu supaya
   hilang dari katalog, lalu menghapusnya kalau memang sudah tidak dipakai.
   Riwayat transaksi lama tetap bisa dibaca.
4. Transaksi yang sudah terlanjur memakai dummy TIDAK dihapus. Kalau admin
   mengubah harga final transaksi lewat panel, angkanya ikut terupdate.
=============================================================
"""

from __future__ import annotations

import os
import sys

from dotenv import load_dotenv

load_dotenv()

from supabase import create_client  # noqa: E402  (harus setelah load_dotenv)


# ==============================================================
# DAFTAR HARGA RESMI
# ==============================================================
# kelompok: 3 grup sesuai daftar harga Komang SAC
#   "Cuci Sepatu"          -> Shoes Cleaning
#   "Bag, Hat & Helmet"    -> Bag Cleaning, Hat Cleaning, Helmet Cleaning
#   "Repaint & Reglue"     -> Shoes Repaint, Shoes Reglue
#
# harga_cuci = harga_min (harga tetap, atau titik awal untuk rentang)
# harga_min  = awal rentang. WAJIB diisi kalau harga_max != harga_cuci
# harga_max  = ujung rentang (None = harga tetap)
#
# jenis_treatment = service family, dipakai sebagai badge di katalog publik

KELOMPOK_CUCI = "Cuci Sepatu"
KELOMPOK_BAG = "Bag, Hat & Helmet"
KELOMPOK_REPAINT = "Repaint & Reglue"

DAFTAR_HARGA = [
    # ---------- GRUP 1: CUCI SEPATU ----------
    {
        "kelompok": KELOMPOK_CUCI,
        "jenis_treatment": "Fast Cleaning",
        "merk": "Fast Cleaning",
        "model": "Paket Ringan",
        "harga_cuci": 15000,
        "harga_min": 15000,
        "harga_max": 15000,
        "keterangan_treatment": "Upper, mid-sol, dan leces. Paket ringan.",
    },
    {
        "kelompok": KELOMPOK_CUCI,
        "jenis_treatment": "Fast Cleaning",
        "merk": "Fast Cleaning",
        "model": "Paket Berat",
        "harga_cuci": 20000,
        "harga_min": 20000,
        "harga_max": 20000,
        "keterangan_treatment": "Upper, mid-sol, dan leces. Paket berat.",
    },
    {
        "kelompok": KELOMPOK_CUCI,
        "jenis_treatment": "Deep Cleaning",
        "merk": "Deep Cleaning",
        "model": "Non White",
        "harga_cuci": 25000,
        "harga_min": 25000,
        "harga_max": 25000,
        "keterangan_treatment": "Upper, midsole, outsole, insole, dan leces. Untuk sepatu bukan putih.",
    },
    {
        "kelompok": KELOMPOK_CUCI,
        "jenis_treatment": "Deep Cleaning",
        "merk": "Deep Cleaning",
        "model": "White",
        "harga_cuci": 30000,
        "harga_min": 30000,
        "harga_max": 30000,
        "keterangan_treatment": "Upper, midsole, outsole, insole, dan leces. Untuk sepatu putih.",
    },
    {
        "kelompok": KELOMPOK_CUCI,
        "jenis_treatment": "Deep Cleaning",
        "merk": "Deep Cleaning",
        "model": "Whitening",
        "harga_cuci": 35000,
        "harga_min": 35000,
        "harga_max": 35000,
        "keterangan_treatment": "Deep cleaning plus pemutih untuk mengembalikan warna putih.",
    },
    {
        "kelompok": KELOMPOK_CUCI,
        "jenis_treatment": "Suede Treatment",
        "merk": "Suede Treatment",
        "model": "Standar",
        "harga_cuci": 30000,
        "harga_min": 30000,
        "harga_max": 30000,
        "keterangan_treatment": "Perawatan khusus bahan suede, bukan cuci biasa.",
    },
    {
        "kelompok": KELOMPOK_CUCI,
        "jenis_treatment": "Kids Shoes",
        "merk": "Kids Shoes",
        "model": "Standar",
        "harga_cuci": 15000,
        "harga_min": 15000,
        "harga_max": 15000,
        "keterangan_treatment": "Cuci sepatu anak. Trainer, sandal, dan sepatu sekolah.",
    },
    {
        "kelompok": KELOMPOK_CUCI,
        "jenis_treatment": "Unyellowing",
        "merk": "Unyellowing",
        "model": "Midsole",
        "harga_cuci": 30000,
        "harga_min": 30000,
        "harga_max": 30000,
        "keterangan_treatment": "Mengembalikan warna yang menguning di bagian midsole.",
    },
    {
        "kelompok": KELOMPOK_CUCI,
        "jenis_treatment": "Slippers",
        "merk": "Slippers",
        "model": "Standar",
        "harga_cuci": 15000,
        "harga_min": 15000,
        "harga_max": 20000,
        "keterangan_treatment": "Cuci sandal dan slipper. Harga menyesuaikan kondisi.",
    },

    # ---------- GRUP 2: BAG, HAT & HELMET ----------
    {
        "kelompok": KELOMPOK_BAG,
        "jenis_treatment": "Bag Cleaning",
        "merk": "Bag Cleaning",
        "model": "Very Small",
        "harga_cuci": 15000,
        "harga_min": 15000,
        "harga_max": 15000,
        "keterangan_treatment": "Untuk tas sangat kecil. Termasuk dompet dan ikat pinggang.",
    },
    {
        "kelompok": KELOMPOK_BAG,
        "jenis_treatment": "Bag Cleaning",
        "merk": "Bag Cleaning",
        "model": "Small",
        "harga_cuci": 20000,
        "harga_min": 20000,
        "harga_max": 20000,
        "keterangan_treatment": "Untuk tas kecil. Termasuk dompet dan ikat pinggang.",
    },
    {
        "kelompok": KELOMPOK_BAG,
        "jenis_treatment": "Bag Cleaning",
        "merk": "Bag Cleaning",
        "model": "Medium",
        "harga_cuci": 30000,
        "harga_min": 30000,
        "harga_max": 30000,
        "keterangan_treatment": "Untuk tas ukuran sedang. Termasuk dompet dan ikat pinggang.",
    },
    {
        "kelompok": KELOMPOK_BAG,
        "jenis_treatment": "Bag Cleaning",
        "merk": "Bag Cleaning",
        "model": "Big",
        "harga_cuci": 40000,
        "harga_min": 40000,
        "harga_max": 40000,
        "keterangan_treatment": "Untuk tas besar. Termasuk dompet dan ikat pinggang.",
    },
    {
        "kelompok": KELOMPOK_BAG,
        "jenis_treatment": "Hat Cleaning",
        "merk": "Hat Cleaning",
        "model": "Standar",
        "harga_cuci": 15000,
        "harga_min": 15000,
        "harga_max": 20000,
        "keterangan_treatment": "Cuci topi. Harga menyesuaikan kondisi dan bahan.",
    },
    {
        "kelompok": KELOMPOK_BAG,
        "jenis_treatment": "Helmet Cleaning",
        "merk": "Helmet Cleaning",
        "model": "Anak-anak",
        "harga_cuci": 15000,
        "harga_min": 15000,
        "harga_max": 15000,
        "keterangan_treatment": "Cuci helm ukuran anak.",
    },
    {
        "kelompok": KELOMPOK_BAG,
        "jenis_treatment": "Helmet Cleaning",
        "merk": "Helmet Cleaning",
        "model": "Dewasa",
        "harga_cuci": 30000,
        "harga_min": 30000,
        "harga_max": 30000,
        "keterangan_treatment": "Cuci helm ukuran dewasa.",
    },
    {
        "kelompok": KELOMPOK_BAG,
        "jenis_treatment": "Helmet Cleaning",
        "merk": "Helmet Cleaning",
        "model": "Fullface",
        "harga_cuci": 40000,
        "harga_min": 40000,
        "harga_max": 50000,
        "keterangan_treatment": "Cuci helm fullface. Harga menyesuaikan kondisi visor dan liner.",
    },

    # ---------- GRUP 3: REPAINT & REGLUE ----------
    {
        "kelompok": KELOMPOK_REPAINT,
        "jenis_treatment": "Shoes Repaint",
        "merk": "Shoes Repaint",
        "model": "Upper Canvas/Mesh",
        "harga_cuci": 80000,
        "harga_min": 80000,
        "harga_max": 150000,
        "keterangan_treatment": "Cat ulang bagian upper berbahan canvas atau mesh.",
    },
    {
        "kelompok": KELOMPOK_REPAINT,
        "jenis_treatment": "Shoes Repaint",
        "merk": "Shoes Repaint",
        "model": "Upper Suede",
        "harga_cuci": 100000,
        "harga_min": 100000,
        "harga_max": 200000,
        "keterangan_treatment": "Cat ulang bagian upper berbahan suede.",
    },
    {
        "kelompok": KELOMPOK_REPAINT,
        "jenis_treatment": "Shoes Repaint",
        "merk": "Shoes Repaint",
        "model": "Upper Leather",
        "harga_cuci": 110000,
        "harga_min": 110000,
        "harga_max": 200000,
        "keterangan_treatment": "Cat ulang bagian upper berbahan kulit (leather).",
    },
    {
        "kelompok": KELOMPOK_REPAINT,
        "jenis_treatment": "Shoes Repaint",
        "merk": "Shoes Repaint",
        "model": "Midsole",
        "harga_cuci": 50000,
        "harga_min": 50000,
        "harga_max": 100000,
        "keterangan_treatment": "Cat ulang bagian midsole.",
    },
    {
        "kelompok": KELOMPOK_REPAINT,
        "jenis_treatment": "Shoes Reglue",
        "merk": "Shoes Reglue",
        "model": "Kerusakan di Bawah 50%",
        "harga_cuci": 50000,
        "harga_min": 50000,
        "harga_max": 60000,
        "keterangan_treatment": "Perekat ulang untuk kerusakan di bawah 50% area sol.",
    },
    {
        "kelompok": KELOMPOK_REPAINT,
        "jenis_treatment": "Shoes Reglue",
        "merk": "Shoes Reglue",
        "model": "Full Press",
        "harga_cuci": 70000,
        "harga_min": 70000,
        "harga_max": 120000,
        "keterangan_treatment": "Perekat ulang dengan press penuh. Untuk kerusakan lebih dari 50%.",
    },
    {
        "kelompok": KELOMPOK_REPAINT,
        "jenis_treatment": "Shoes Reglue",
        "merk": "Jahit Sol",
        "model": "Standar",
        "harga_cuci": 25000,
        "harga_min": 25000,
        "harga_max": 50000,
        "keterangan_treatment": "Jahit ulang sol sepatu yang robek.",
    },
]


# ==============================================================
# DATA DUMMY LAMA (yang harus hilang dari katalog)
# ==============================================================
# Deteksi otomatis: baris yang TIDAK ada di DAFTAR_HARGA berdasarkan
# pasangan (merk, model). Jadi kalau nanti admin tambah layanan sendiri
# lewat panel, jalankan ulang script ini tidak akan menghapusnya --
# hanya baris yang benar-benar tidak ada di daftar harga resmi.
MERC_DUMMY_KNOWN = {
    "Nike",
    "Adidas",
    "Vans",
    "Converse",
    "New Balance",
    "Puma",
}


def db() -> object:
    """Buat koneksi Supabase dari .env."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit(
            "SUPABASE_URL / SUPABASE_KEY tidak ditemukan di .env\n"
            "Copy .env.example jadi .env lalu isi nilainya."
        )
    return create_client(url, key)


def _pasangan(row: dict) -> tuple[str, str]:
    return ((row.get("merk") or "").strip().lower(), (row.get("model") or "").strip().lower())


def upsert_harga(sb: object, dry_run: bool = False) -> None:
    """Sisipkan atau perbarui daftar harga. Idempoten."""
    # Ambil yang sudah ada -> build peta berdasarkan (merk, model)
    existing = sb.from_("shoes").select("id, merk, model, harga_cuci, harga_min, harga_max").execute().data or []
    peta = {_pasangan(r): r for r in existing}

    dibuat, diperbarui, tidak_berubah = 0, 0, 0

    for item in DAFTAR_HARGA:
        key = _pasangan(item)
        lama = peta.get(key)
        if lama:
            # Bandingkan hanya field yang relevan supaya update yang tidak
            # melakukan perubahan tidak menghasilkan versi baru tiap kali.
            berubah = any(
                lama.get(f) != item.get(f)
                for f in ("harga_cuci", "harga_min", "harga_max", "kelompok", "jenis_treatment", "keterangan_treatment")
            )
            if berubah:
                if not dry_run:
                    sb.from_("shoes").update(item).eq("id", lama["id"]).execute()
                diperbarui += 1
                print(f"  [UPDATE] {item['merk']} / {item['model']} -> {item['harga_cuci']}")
            else:
                tidak_berubah += 1
        else:
            payload = dict(item)
            if not dry_run:
                sb.from_("shoes").insert(payload).execute()
            dibuat += 1
            print(f"  [INSERT] {item['merk']} / {item['model']} -> {item['harga_cuci']}")

    print(f"\n  Dibuat: {dibuat} | Diperbarui: {diperbarui} | Tidak berubah: {tidak_berubah}")


def bersihkan_dummy(sb: object, dry_run: bool = False) -> None:
    """
    Nonaktifkan (lalu hapus kalau bisa) master dummy.

    Dua tahap sengaja:
      1. Nonaktifkan dulu (status=False) supaya langsung hilang dari katalog
         publik dan tidak bisa dipilih lagi, walau masih terikat transaksi.
      2. Hapus baris yang TIDAK dipakai transaksi apa pun. Kalau masih dipakai,
         biarkan nonaktif -- database menolak penghapusan dengan FK RESTRICT
         (23503) dan lebih baik riwayat transaksi tetap utuh daripada kehilangan.
    """
    semua = sb.from_("shoes").select("id, merk, model, status").execute().data or []

    # Baris yang sudah ada di daftar harga resmi tidak boleh disentuh
    pasangan_resmi = {_pasangan(item) for item in DAFTAR_HARGA}
    kandidat = [r for r in semua if _pasangan(r) not in pasangan_resmi]

    # Hanya yang kelihatan seperti dummy lama
    kandidat = [r for r in kandidat if (r.get("merk") or "").strip() in MERC_DUMMY_KNOWN]
    if not kandidat:
        print("\n  Tidak ada master dummy yang perlu dibersihkan.")
        return

    print(f"\n  Master dummy ditemukan: {len(kandidat)} baris")
    dinonaktifkan, dihapus, ditahan = 0, 0, 0

    for row in kandidat:
        label = f"{row.get('merk')} / {row.get('model') or '-'}"
        dipakai = sb.from_("transactions").select("id").eq("shoe_id", row["id"]).execute().data or []

        if row.get("status") is not False:
            if not dry_run:
                sb.from_("shoes").update({"status": False}).eq("id", row["id"]).execute()
            dinonaktifkan += 1

        if dipakai:
            ditahan += 1
            print(f"  [NONAKTIF] {label} -- dipakai {len(dipakai)} transaksi, tidak dihapus demi riwayat")
        else:
            if not dry_run:
                sb.from_("shoes").delete().eq("id", row["id"]).execute()
            dihapus += 1
            print(f"  [HAPUS] {label}")

    print(f"\n  Dinonaktifkan: {dinonaktifkan} | Dihapus: {dihapus} | Ditahan (dipakai transaksi): {ditahan}")


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    keep_dummy = "--keep-dummy" in sys.argv

    if dry_run:
        print("MODE DRY-RUN: tidak ada yang ditulis ke database.\n")

    sb = db()

    print(f"Daftar harga resmi: {len(DAFTAR_HARGA)} layanan "
          f"dalam {len({i['kelompok'] for i in DAFTAR_HARGA})} kelompok\n")
    upsert_harga(sb, dry_run=dry_run)

    if keep_dummy:
        print("\n  --keep-dummy: master dummy dibiarkan.")
    else:
        bersihkan_dummy(sb, dry_run=dry_run)

    print("\nSelesai.")


if __name__ == "__main__":
    main()