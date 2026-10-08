"""Cek kolom tabel dengan mencoba select per kolom (berguna saat tabel masih kosong)."""
import main as m

TABLES = {
    "profiles": ["id", "full_name", "phone", "password_hash", "role", "is_verified", "created_at"],
    "shoes": ["id", "merk", "model", "harga_cuci", "jenis_treatment", "keterangan_treatment", "estimasi_hari", "status", "created_at"],
    "drop_points": ["id", "nama", "alamat", "wa_contact", "aktif", "created_at"],
    "transactions": [
        "id", "kode", "user_id", "shoe_id", "tech_id", "drop_point_id", "harga", "tech_commission",
        "status", "catatan_konsumen", "defect_notes", "photo_before", "photo_after",
        "payment_method", "grup_id", "created_at", "updated_at",
    ],
    "stock": [
        "id", "nama_item", "tipe", "jumlah", "satuan", "batas_minimum", "supplier",
        "harga_beli", "tanggal_masuk", "last_updated", "created_at",
    ],
    "expenses": ["id", "kategori", "jumlah", "tanggal", "keterangan", "created_at", "updated_at"],
}

s = m.supabase
needs_migration = False

for table, cols in TABLES.items():
    missing = []
    for col in cols:
        try:
            s.from_(table).select(col).limit(1).execute()
        except Exception:
            missing.append(col)

    if missing:
        needs_migration = True
        print(f"{table:14} HILANG -> {', '.join(missing)}")
    else:
        print(f"{table:14} lengkap ({len(cols)} kolom)")

print()
print("=> Jalankan migrate.sql di Supabase SQL Editor." if needs_migration else "=> Semua kolom sudah ada.")
