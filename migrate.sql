-- =============================================================
-- Komang SAC — MIGRASI untuk database yang SUDAH ADA
-- Jalankan di Supabase SQL Editor. Aman diulang (IF NOT EXISTS).
-- -------------------------------------------------------------
-- Menambahkan kolom yang dipakai main.py tapi belum ada:
--   transactions : kode, defect_notes, photo_before, photo_after, updated_at
--   stock        : last_updated
--   profiles     : password_hash
-- =============================================================

-- ---------- [1] profiles: password_hash ----------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- ---------- [2] transactions: kolom yang hilang ----------
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS kode TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS defect_notes TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS photo_before TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS photo_after TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ---------- [3] transactions: trigger updated_at ----------
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transactions_updated_at ON transactions;
CREATE TRIGGER trg_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------- [4] transactions: index untuk tracking ----------
CREATE UNIQUE INDEX IF NOT EXISTS idx_trx_kode ON transactions (kode) WHERE kode IS NOT NULL;

-- ---------- [5] stock: last_updated ----------
ALTER TABLE stock ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE stock ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- =============================================================
-- [6] ISI DATA AWAL (idempoten — aman dijalankan berulang)
-- =============================================================

-- Drop point
INSERT INTO drop_points (nama, alamat, wa_contact, aktif)
SELECT * FROM (VALUES
  ('Outlet Utama',
   'Jl. Cisadane No.3, Lingkungan Mojoroto R, Singonegaran, Kec. Banyuwangi, Kabupaten Banyuwangi, Jawa Timur 68415',
   '628980570911', TRUE),
  ('Dolay Cut',
   'Jl. Kyai Haji Wahid Hasyim No. 76, Kabupaten Banyuwangi',
   '628980570911', TRUE)
) AS v(nama, alamat, wa_contact, aktif)
WHERE NOT EXISTS (SELECT 1 FROM drop_points WHERE drop_points.nama = v.nama);

-- Admin (password: 'admin123' — GANTI setelah login pertama)
INSERT INTO profiles (full_name, phone, role, is_verified)
SELECT 'Admin Komang SAC', '628980570911', 'admin', TRUE
WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE role = 'admin');

-- Stock awal
INSERT INTO stock (nama_item, tipe, jumlah, satuan, batas_minimum)
SELECT * FROM (VALUES
  ('Sabun Netral',      'bahan', 10, 'liter', 5),
  ('Pemutih Kental',    'bahan',  5, 'liter', 3),
  ('Sikat Kasur',       'alat',  20, 'pcs',  10),
  ('Kain Lap Microfiber','bahan',30, 'pcs',  15)
) AS v(nama_item, tipe, jumlah, satuan, batas_minimum)
WHERE NOT EXISTS (SELECT 1 FROM stock WHERE stock.nama_item = v.nama_item);

-- =============================================================
-- [7] RLS (opsional — JANGAN aktifkan sebelum backend pakai
--     service-role key, atau semua request dari frontend akan 401)
-- =============================================================
-- ALTER TABLE profiles     ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE shoes        ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE drop_points  ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE stock        ENABLE ROW LEVEL SECURITY;
--
-- -- contoh: hanya admin/teknisi yang boleh baca & tulis stok
-- CREATE POLICY stock_admin_all ON stock
--   FOR ALL USING (
--     EXISTS (SELECT 1 FROM profiles p
--             WHERE p.id = auth.uid() AND p.role IN ('admin', 'technician'))
--   );
