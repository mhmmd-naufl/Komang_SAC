"""
Isi database dengan DATA DUMMY untuk demo & pengembangan.

PRASYARAT: migrate.sql SUDAH dijalankan di Supabase SQL Editor.
            (butuh kolom profiles.password_hash, transactions.kode,
             transactions.defect_notes, transactions.updated_at,
             stock.last_updated, stock.created_at)

Cara pakai:
    python check_schema.py       # pastikan kolom sudah lengkap
    python seed_dummy.py         # isi data dummy (aman diulang)
    python seed_dummy.py --reset # HAPUS data dummy saja (data asli aman)

Password semua akun dummy: password123
NomorHp dummy memakai prefiks 62899x (teknisi/drop point) dan 62898x (konsumen)
supaya mudah dibedakan dari nomor asli. Nomor admin asli 628980570911 TIDAK
pernah dihapus oleh --reset.
"""

import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, ".")

from main import (  # noqa: E402
    supabase as sb,
    hash_password,
    generate_tracking_code,
    calculate_commission,
    normalize_phone,
)

PASSWORD = "password123"

# Nomor yang dianggap "milik data dummy" — hanya ini yang dihapus saat --reset
DUMMY_PHONES = {
    "628991000001", "628991000002", "628991000003", "628991000004",
    "628981000001", "628981000002", "628981000003", "628981000004", "628981000005",
}
ADMIN_PHONE = "628980570911"  # nomor asli — tidak dihapus oleh --reset


# =============================================================
# Data master
# =============================================================

USERS = [
    # full_name,            phone,          role
    ("Admin Komang SAC",    ADMIN_PHONE,    "admin"),
    ("Agus Setiawan",       "628991000001", "technician"),
    ("Rizal Firmansyah",    "628991000002", "technician"),
    ("Bayu Nugroho",        "628991000003", "technician"),
    ("Sari Drop Point",     "628991000004", "drop_point"),
    ("Budi Santoso",        "628981000001", "customer"),
    ("Siti Aminah",         "628981000002", "customer"),
    ("Andi Wijaya",         "628981000003", "customer"),
    ("Dewi Lestari",        "628981000004", "customer"),
    ("Eko Purnomo",         "628981000005", "customer"),
]

SHOES = [
    # merk,        model,          harga, treatment, keterangan
    ("Nike",        "Air Force 1",  35000, "Premium",    "Cuci + pemutih kental + conditioning + anti bau"),
    ("Adidas",      "Ultraboost",   40000, "Steri",      "Cuci steril + anti bakteri + penjaga warna"),
    ("Vans",        "Old Skool",    25000, "Standar",    "Cuci standar + pengeringan"),
    ("Converse",    "Chuck Taylor", 28000, "Standar",    "Cuci standar + whitening sol yang aman"),
    ("New Balance", "550",          32000, "Steri",      "Cuci steril + anti bakteri"),
    ("Puma",        "Suede",        38000, "Premium",    "Cuci + conditioning khusus bahan suede"),
    ("Nike",        "Pegasus 40",   30000, "Waterproof", "Cuci + coating ulang waterproof"),
    ("Salomon",     "XT-6",         42000, "Premium",    "Cuci + pengeringan + treatment sole"),
]

STOCK = [
    # nama_item,         tipe,  jumlah, satuan, batas_minimum, harga_beli
    ("Sabun Netral",      "bahan",  12, "liter", 5,  45000),
    ("Pemutih Kental",    "bahan",   4, "liter", 3,  38000),
    ("Disinfectan",       "bahan",   2, "liter", 3,  60000),   # sengaja menipis -> alarm
    ("Sikat Kasur",       "alat",   18, "pcs",   10, 15000),
    ("Kain Microfiber",   "bahan",  25, "pcs",   15,  8000),
    ("Mesin Cuci Tekanan", "alat",    2, "pcs",   1, 3500000),
    ("Kabel Pengering",   "alat",    3, "pcs",   2,  75000),
]

DROP_POINTS = [
    (
        "Outlet Utama",
        "Jl. Cisadane No.3, Lingkungan Mojoroto R, Singonegaran, "
        "Kec. Banyuwangi, Kabupaten Banyuwangi, Jawa Timur 68415",
        ADMIN_PHONE,
    ),
    (
        "Dolay Cut",
        "Jl. Kyai Haji Wahid Hasyim No. 76, Kabupaten Banyuwangi",
        ADMIN_PHONE,
    ),
]

CUSTOMER_NAMES = ("Budi Santoso", "Siti Aminah", "Andi Wijaya", "Dewi Lestari", "Eko Purnomo")
TECH_NAMES = ("Agus Setiawan", "Rizal Firmansyah", "Bayu Nugroho")


# =============================================================
# Preflight — pastikan migrate.sql sudah dijalankan
# =============================================================

REQUIRED_COLUMNS = {
    "profiles":     ["password_hash"],
    "transactions": ["kode", "defect_notes", "updated_at", "photo_before", "photo_after"],
    "stock":        ["last_updated", "created_at"],
}


def preflight() -> None:
    missing = []
    for table, cols in REQUIRED_COLUMNS.items():
        for col in cols:
            # PostgREST memvalidasi kolom saat menyusun query, jadi kolom yang
            # tidak ada akan error walau tabelnya kosong.
            try:
                sb.from_(table).select(col).limit(1).execute()
            except Exception:
                missing.append(f"{table}.{col}")

    if missing:
        print("GAGAL: Kolom database belum lengkap.")
        for m in missing:
            print(f"   - {m}")
        print()
        print("Jalankan migrate.sql di Supabase SQL Editor, lalu ulangi:")
        print("    python check_schema.py")
        sys.exit(1)
    print("Preflight OK — semua kolom yang dibutuhkan sudah ada.\n")


# =============================================================
# Helpers
# =============================================================

def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def ensure(table: str, match: dict, payload: dict):
    """Insert kalau belum ada, UPDATE kalau sudah ada. Return (row, created)."""
    q = sb.from_(table).select("*")
    for k, v in match.items():
        q = q.eq(k, v)
    found = q.execute().data
    if found:
        sb.from_(table).update(payload).eq("id", found[0]["id"]).execute()
        return found[0], False
    created = sb.from_(table).insert({**match, **payload}).execute().data
    if not created:
        raise RuntimeError(f"Gagal insert ke {table}: {match}")
    return created[0], True


def find_shoe(merk: str, model: str):
    for s in sb.from_("shoes").select("*").execute().data or []:
        if s["merk"] == merk and s.get("model") == model:
            return s
    return None


# =============================================================
# Reset — hanya baris dummy
# =============================================================

def reset() -> None:
    print("Menghapus data dummy (data asli tidak disentuh) ...\n")

    # 1. Transaksi milik konsumen dummy saja
    dummy_user_ids = [
        p["id"] for p in sb.from_("profiles").select("id").in_("phone", list(DUMMY_PHONES)).execute().data or []
    ]
    if dummy_user_ids:
        res = sb.from_("transactions").delete().in_("user_id", dummy_user_ids).execute()
        print(f"  transaksi (konsumen dummy) : {len(res.data or [])} dihapus")

    # 2. Stock: hanya nama_item dari daftar di atas
    res = sb.from_("stock").delete().in_("nama_item", [s[0] for s in STOCK]).execute()
    print(f"  stock                       : {len(res.data or [])} dihapus")

    # 3. Shoes: hanya pasangan merk+model dari daftar di atas
    n = 0
    for merk, model, *_ in SHOES:
        row = find_shoe(merk, model)
        if row:
            sb.from_("shoes").delete().eq("id", row["id"]).execute()
            n += 1
    print(f"  master layanan              : {n} dihapus")

    # 4. Drop point: hanya nama dari daftar di atas
    res = sb.from_("drop_points").delete().in_("nama", [d[0] for d in DROP_POINTS]).execute()
    print(f"  drop point                  : {len(res.data or [])} dihapus")

    # 5. Profil dummy saja (nomor admin asli dikecualikan)
    res = sb.from_("profiles").delete().in_("phone", list(DUMMY_PHONES)).execute()
    print(f"  profil dummy                : {len(res.data or [])} dihapus")

    print(f"\n  akun admin {ADMIN_PHONE} TIDAK dihapus.\n")


# =============================================================
# Seed
# =============================================================

def seed() -> None:
    now = datetime.now(timezone.utc)

    # ---------- 1. Drop point ----------
    print("1. Drop point")
    dp_ids = []
    for nama, alamat, wa in DROP_POINTS:
        row, created = ensure(
            "drop_points",
            {"nama": nama},
            {"nama": nama, "alamat": alamat, "wa_contact": wa,
             "aktif": True, "created_at": iso(now)},
        )
        dp_ids.append(row["id"])
        print(f"   {'+ ' if created else '= '} {nama}")

    # ---------- 2. Pengguna ----------
    print("\n2. Pengguna   (password semua: password123)")
    users = {}
    for full_name, phone, role in USERS:
        norm = normalize_phone(phone)
        row, created = ensure(
            "profiles",
            {"phone": norm},
            {
                "full_name": full_name,
                "phone": norm,
                "password_hash": hash_password(PASSWORD),
                "role": role,
                "is_verified": True,
                "created_at": iso(now),
            },
        )
        users[full_name] = row["id"]
        print(f"   {'+ ' if created else '= '} {full_name:20} {norm}  ({role})")

    # ---------- 3. Master layanan + harga ----------
    print("\n3. Master layanan + harga")
    shoe_ids = []
    for merk, model, harga, treatment, keterangan in SHOES:
        payload = {
            "merk": merk,
            "model": model,
            "harga_cuci": harga,
            "jenis_treatment": treatment,
            "keterangan_treatment": keterangan,
            "status": True,
        }
        existing = find_shoe(merk, model)
        if existing:
            sb.from_("shoes").update(payload).eq("id", existing["id"]).execute()
            row, created = existing, False
        else:
            row, created = ensure("shoes", {"merk": merk, "model": model},
                                  {**payload, "created_at": iso(now)})
        shoe_ids.append(row["id"])
        print(f"   {'+ ' if created else '= '} {merk:11} {model:16} Rp{harga:>6,}")

    # ---------- 4. Stock ----------
    print("\n4. Stock alat & bahan")
    for nama_item, tipe, jumlah, satuan, minimum, harga_beli in STOCK:
        row, created = ensure(
            "stock",
            {"nama_item": nama_item},
            {
                "nama_item": nama_item,
                "tipe": tipe,
                "jumlah": jumlah,
                "satuan": satuan,
                "batas_minimum": minimum,
                "harga_beli": harga_beli,
                "tanggal_masuk": (now - timedelta(days=30)).date().isoformat(),
                "last_updated": iso(now),
                "created_at": iso(now),
            },
        )
        flag = "   <- MENIPIS" if jumlah <= minimum else ""
        print(f"   {'+ ' if created else '= '} {nama_item:18} {jumlah:>3} {satuan:<5}{flag}")

    # ---------- 5. Transaksi ----------
    print("\n5. Transaksi (menyebar di 5 status)")
    customers = [users[n] for n in CUSTOMER_NAMES]
    technicians = [users[n] for n in TECH_NAMES]

    # (hari lalu, i_shoes, i_konsumen, i_teknisi, i_drop_point, status, catatan)
    PLAN = [
        (24, 0, 0, 0, 0, "Siap diambil", "Tolong jaga warna putih tetap bersih."),
        (21, 1, 1, 1, 1, "Siap diambil", None),
        (18, 2, 2, 0, 0, "Selesai",     "Noda di sol sudah hilang sebagian."),
        (14, 3, 3, 1, 1, "Selesai",     None),
        (11, 4, 4, 2, 0, "Diperiksa",   "Ada goresan kecil di bagian belakang."),
        (9,  5, 0, 2, 1, "Diperiksa",   "Bahan suede, jangan pakai pelembap."),
        (7,  6, 1, 0, 0, "Diproses",    None),
        (5,  7, 2, 1, 1, "Diproses",    "Sepatu kerja, sering terkena air. Mohon alkali ekstra."),
        (3,  0, 3, 2, 0, "Diterima",    "Tolong diprioritaskan, saya butuh cepat."),
        (2,  1, 4, 0, 1, "Diterima",    None),
        (1,  2, 0, 1, 0, "Diterima",    "Ada tambalan di bagian dalam, hati-hati."),
    ]

    existing_codes = {
        t["kode"] for t in sb.from_("transactions").select("kode").execute().data or []
        if t.get("kode")
    }

    made = 0
    for hari, i_s, i_c, i_t, i_dp, status, catatan in PLAN:
        merk, model, harga, _treatment, _ket = SHOES[i_s]

        kode = generate_tracking_code()
        while kode in existing_codes:
            kode = generate_tracking_code()
        existing_codes.add(kode)

        created_at = now - timedelta(days=hari, hours=(hari * 3) % 12)
        updated_at = created_at + timedelta(hours=(hari % 6) + 1)

        # cacat bawaan dicatat teknisi, hanya di status setelah "Diproses"
        defect = None
        if status in ("Diperiksa", "Selesai", "Siap diambil") and i_c % 2 == 0:
            defect = "Ada goresan bawaan di bagian heel kiri, dicatat sebelum proses."

        sb.from_("transactions").insert({
            "kode": kode,
            "user_id": customers[i_c],
            "shoe_id": shoe_ids[i_s],
            # teknisi baru ditugaskan setelah barang masuk antrean
            "tech_id": None if status == "Diterima" else technicians[i_t],
            "drop_point_id": dp_ids[i_dp],
            "harga": harga,
            "tech_commission": calculate_commission(harga),
            "status": status,
            "catatan_konsumen": catatan,
            "defect_notes": defect,
            # foto sengaja kosong: integrasi Supabase Storage belum dibuat
            "photo_before": None,
            "photo_after": None,
            "created_at": iso(created_at),
            "updated_at": iso(updated_at),
        }).execute()

        made += 1
        print(f"   + {kode}  {status:13} {merk} {model:14} Rp{harga:>6,}")

    print(f"\n   total transaksi dibuat: {made}")

    # ---------- Ringkasan ----------
    print("\n" + "=" * 62)
    print("RINGKASAN")
    print("=" * 62)
    for t in ("profiles", "shoes", "drop_points", "transactions", "stock"):
        n = sb.from_(t).select("id", count="exact").limit(1).execute().count
        print(f"  {t:14} {n:>4} baris")

    print("\nAKUN LOGIN  (password semua: password123)")
    print(f"  Admin     {ADMIN_PHONE}")
    for name, phone, role in USERS:
        if role == "technician":
            print(f"  Teknisi   {phone}   {name}")
    print(f"  Konsumen  628981000001   Budi Santoso")
    print("\n  Coba salah satu kode tracking di atas di halaman /status.")

    print("\nCatatan:")
    print("  - Hapus data dummy : python seed_dummy.py --reset")
    print("  - Foto sengaja kosong karena integrasi Supabase Storage belum dibuat")
    print("  - Kolom photo_after masih kosong, jadi transaksi 'Selesai'/'Siap diambil'")
    print("    akan ditolak backend. Ini normal untuk data demo - isi lewat UI teknisi.")


if __name__ == "__main__":
    args = sys.argv[1:]

    if "--reset" in args:
        reset()
        if "--seed" not in args:
            sys.exit(0)

    preflight()
    seed()