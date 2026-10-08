-- =============================================================
-- Komang SAC — MIGRASI untuk database yang SUDAH ADA
-- Jalankan di Supabase SQL Editor. Aman diulang (IF NOT EXISTS).
-- -------------------------------------------------------------
-- Menambahkan kolom yang dipakai main.py tapi belum ada:
--   transactions : kode, defect_notes, photo_before, photo_after, updated_at, selesai_at
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
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS photo_defect TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS photo_defect TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
-- Tanggal selesai dicatat teknisi saat status jadi Selesai. Dipakai untuk
-- laporan per bulan/tahun: cucian dihitung masuk periode tanggal SELESAI-nya.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS selesai_at TIMESTAMPTZ;

-- Backfill data lama: transaksi yang sudah final tapi belum punya tanggal
-- selesai masih harus ikut dihitung di dashboard dengan created_at sebagai
-- fallback, supaya data historis tidak menghilang saat migrasi.
UPDATE transactions
SET selesai_at = created_at
WHERE status IN ('Selesai', 'Siap diambil')
  AND selesai_at IS NULL
  AND created_at IS NOT NULL;

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
-- Index untuk laporan per bulan/tahun.
CREATE INDEX IF NOT EXISTS idx_trx_selesai_at ON transactions (selesai_at);

-- ---------- [5] stock: last_updated ----------
ALTER TABLE stock ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE stock ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- =============================================================
-- [6] shoes: DAFTAR HARGA ASLI + RENTANG HARGA
-- -------------------------------------------------------------
-- Tabel `shoes` berubah fungsi: sekarang satu baris = satu VARIAN LAYANAN
-- (bukan satu merk sepatu), karena Komang SAC selling by jenis treatment.
-- Karena itu jenis_treatment harus bisa menyimpan nilai apa saja
-- (Deep Cleaning, Unyellowing, Repaint, ...), bukan cuma 4 enum lama.
--
-- Cek constraint Postgres TIDAK punya "IF NOT EXISTS", jadi pola yang dipakai
-- di sini: DROP dulu (aman, `IF EXISTS`), baru ADD. Aman diulang.
-- =============================================================

ALTER TABLE shoes ADD COLUMN IF NOT EXISTS harga_min  INTEGER;
ALTER TABLE shoes ADD COLUMN IF NOT EXISTS harga_max  INTEGER;
ALTER TABLE shoes ADD COLUMN IF NOT EXISTS kelompok   TEXT;

-- Baris lama belum punya harga_min -> samakan dengan harga_cuci supaya
-- transaksi yang dibuat dari layanan lama tidak mengambil harga NULL.
UPDATE shoes SET harga_min = harga_cuci WHERE harga_min IS NULL;

-- Buang constraint enum lama (Standar|Premium|Steri|Waterproof). Kalau nama
-- constraint-nya berbeda, blok di bawah tidak error, hanya dilewati.
ALTER TABLE shoes DROP CONSTRAINT IF EXISTS shoes_jenis_treatment_check;

-- Pola terbuka: huruf/angka/spasi, maks 40 karakter. Admin bisa menambah
-- layanan baru dari panel tanpa perlu ALTER TABLE.
ALTER TABLE shoes DROP CONSTRAINT IF EXISTS shoes_jenis_treatment_check;
ALTER TABLE shoes
    ADD CONSTRAINT shoes_jenis_treatment_check CHECK (
        jenis_treatment IS NULL OR
        jenis_treatment ~ '^[A-Za-z][A-Za-z0-9 &/.,()-]{0,40}$'
    );

ALTER TABLE shoes DROP CONSTRAINT IF EXISTS shoes_kelompok_check;
ALTER TABLE shoes
    ADD CONSTRAINT shoes_kelompok_check CHECK (
        kelompok IS NULL OR kelompok ~ '^[A-Za-z][A-Za-z0-9 &/,.-]{0,60}$'
    );

ALTER TABLE shoes DROP CONSTRAINT IF EXISTS shoes_harga_rentang_check;
ALTER TABLE shoes
    ADD CONSTRAINT shoes_harga_rentang_check CHECK (
        harga_min IS NULL OR harga_max IS NULL OR harga_max >= harga_min
    );

CREATE INDEX IF NOT EXISTS idx_shoes_kelompok ON shoes (kelompok);

-- =============================================================
-- [7] ISI DATA AWAL (idempoten — aman dijalankan berulang)
-- -------------------------------------------------------------
-- CATATAN: daftar harga asli Komang SAC (3 kelompok, ~27 varian) TIDAK
-- ditulis di sini. Jalankan `seed_pricelist.py` supaya bisa pakai update
-- atau skip per baris. SQL Editor tidak bisa mengulang baris dengan id tetap.
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
-- [9] expenses: PENGELUARAN OPERASIONAL (listrik, PDAM, dll.)
-- -------------------------------------------------------------
-- Satu baris = satu kali pengeluaran (tiap beli token listrik, tiap
-- bayar PDAM). Kategori sengaja bebas supaya admin bisa menambah jenis
-- pengeluaran lain (sewa, internet, gaji) tanpa ALTER TABLE.
-- Dipakai untuk rekap mingguan dan profit bersih di dashboard.
-- =============================================================

CREATE TABLE IF NOT EXISTS expenses (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kategori    TEXT NOT NULL,
    jumlah      INTEGER NOT NULL CHECK (jumlah > 0),   -- rupiah
    tanggal     DATE NOT NULL DEFAULT CURRENT_DATE,
    keterangan  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ
);

-- Kategori dinormalisasi lowercase di backend; constraint ini pagar terakhir.
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_kategori_check;
ALTER TABLE expenses
    ADD CONSTRAINT expenses_kategori_check CHECK (
        kategori ~ '^[a-z][a-z0-9 &/.,()-]{1,40}$'
    );

DROP TRIGGER IF EXISTS trg_expenses_updated_at ON expenses;
CREATE TRIGGER trg_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_expenses_tanggal  ON expenses (tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_kategori ON expenses (kategori);

-- RLS aktif seperti tabel lain: backend masuk lewat service-role key,
-- anon key tidak bisa membaca data finansial ini sama sekali.
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- [10] transactions: payment_method
-- -------------------------------------------------------------
-- Metode bayar yang dipilih konsumen saat booking. Dulu pilihan ini
-- hanya ada di UI dan tidak pernah tersimpan, jadi admin tidak tahu
-- konsumen mau bayar lewat apa. Nilai divalidasi backend terhadap
-- ACCEPTED_PAYMENTS di .env; constraint ini hanya pagar format.
-- =============================================================

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_method TEXT;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_payment_method_check;
ALTER TABLE transactions
    ADD CONSTRAINT transactions_payment_method_check CHECK (
        payment_method IS NULL OR payment_method ~ '^[a-z_]{2,20}$'
    );

-- =============================================================
-- [11] shoes: estimasi_hari
-- -------------------------------------------------------------
-- Estimasi pengerjaan per layanan. Dulu "2-3 hari kerja" di-hardcode
-- untuk semua layanan, padahal Repaint/Reglue bisa seminggu -- janji
-- yang salah lebih buruk daripada tidak ada janji. NULL = pakai default.
-- =============================================================

ALTER TABLE shoes ADD COLUMN IF NOT EXISTS estimasi_hari INTEGER;

ALTER TABLE shoes DROP CONSTRAINT IF EXISTS shoes_estimasi_hari_check;
ALTER TABLE shoes
    ADD CONSTRAINT shoes_estimasi_hari_check CHECK (
        estimasi_hari IS NULL OR (estimasi_hari >= 1 AND estimasi_hari <= 60)
    );

-- =============================================================
-- [12] transactions: grup_id (booking multi-pasang)
-- -------------------------------------------------------------
-- Satu konsumen sering menitipkan beberapa pasang sekaligus. Tiap
-- pasang TETAP satu baris transaksi (status pengerjaan memang per
-- pasang secara fisik), dan grup_id adalah "benang" yang mengikatnya
-- jadi satu booking. Nilainya UUID yang dibuat frontend saat submit
-- batch; booking tunggal tidak mengisinya (NULL).
-- =============================================================

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS grup_id UUID;

CREATE INDEX IF NOT EXISTS idx_trx_grup ON transactions (grup_id) WHERE grup_id IS NOT NULL;

-- =============================================================
-- [13] ZONA WAKTU: semua kolom waktu jadi TIMESTAMPTZ
-- -------------------------------------------------------------
-- Gejala: jam booking/selesai di web tampil 7 jam lebih awal dari
-- jam sebenarnya. Penyebabnya kolom dibuat sebagai `timestamp
-- without time zone` (database lama). Backend mengirim jam UTC,
-- kolom naive membuang penanda zonanya, dan browser menganggap
-- string tanpa zona itu sebagai jam lokal.
--
-- Semua nilai lama ditulis dari jam UTC (get_now_iso), jadi konversi
-- memakai AT TIME ZONE 'UTC'. Aman diulang: kalau kolom sudah
-- TIMESTAMPTZ, hasilnya instan yang sama.
-- =============================================================

DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN
        SELECT table_name AS tbl, column_name AS col
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('profiles', 'shoes', 'drop_points', 'transactions', 'stock', 'expenses')
          AND column_name IN ('created_at', 'updated_at', 'selesai_at', 'last_updated')
          AND data_type = 'timestamp without time zone'
    LOOP
        EXECUTE format(
            'ALTER TABLE %I ALTER COLUMN %I TYPE TIMESTAMPTZ USING %I AT TIME ZONE ''UTC''',
            t.tbl, t.col, t.col
        );
        RAISE NOTICE 'Dikonversi: %.%', t.tbl, t.col;
    END LOOP;
END $$;

-- =============================================================
-- [8] RLS (opsional — JANGAN aktifkan sebelum backend pakai
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
