-- =============================================================
-- Komang SAC — Schema PostgreSQL (Supabase)
-- Jalankan file ini di Supabase SQL Editor untuk instalasi BARU.
-- Sudah punya database? Gunakan migrate.sql, bukan file ini.
-- =============================================================

-- ---------- 1. profiles (Admin / Customer / Teknisi / Drop Point) ----------
CREATE TABLE IF NOT EXISTS profiles (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name    TEXT        NOT NULL,
    phone        TEXT        NOT NULL UNIQUE,
    password_hash TEXT,
    role         TEXT        NOT NULL DEFAULT 'customer'
                 CHECK (role IN ('admin', 'customer', 'technician', 'drop_point')),
    is_verified  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role  ON profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles (phone);

-- ---------- 2. shoes (Master Sepatu + Price List + Treatment) ----------
CREATE TABLE IF NOT EXISTS shoes (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merk                  TEXT        NOT NULL,
    model                 TEXT,
    harga_cuci            INTEGER     NOT NULL CHECK (harga_cuci >= 0),
    jenis_treatment       TEXT        CHECK (jenis_treatment IN ('Standar', 'Premium', 'Steri', 'Waterproof')),
    keterangan_treatment  TEXT,
    status                BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shoes_status ON shoes (status);
CREATE INDEX IF NOT EXISTS idx_shoes_merk   ON shoes (merk);

-- ---------- 3. drop_points (Outlet + Mitra) ----------
CREATE TABLE IF NOT EXISTS drop_points (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama       TEXT        NOT NULL,
    alamat     TEXT,
    wa_contact TEXT,
    aktif      BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drop_points_aktif ON drop_points (aktif);

-- ---------- 4. transactions (Transaksi Cuci) ----------
-- CATATAN: transactions dibuat SETELAH profiles & shoes & drop_points
-- karena kolomnya memakai FK ke tabel-tabel tersebut.
CREATE TABLE IF NOT EXISTS transactions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode              TEXT        UNIQUE,                 -- nomor tracking untuk konsumen, cth. KS-7F3K9Q
    user_id           UUID        NOT NULL REFERENCES profiles (id)    ON DELETE RESTRICT,
    shoe_id           UUID        NOT NULL REFERENCES shoes (id)        ON DELETE RESTRICT,
    tech_id           UUID                  REFERENCES profiles (id)    ON DELETE SET NULL,
    drop_point_id     UUID                  REFERENCES drop_points (id) ON DELETE SET NULL,

    -- snapshot finansial (tidak berubah walau harga master berubah)
    harga            INTEGER     NOT NULL CHECK (harga >= 0),
    tech_commission  INTEGER     NOT NULL DEFAULT 0 CHECK (tech_commission >= 0),

    status           TEXT        NOT NULL DEFAULT 'Diterima'
                     CHECK (status IN ('Diterima', 'Diproses', 'Diperiksa', 'Selesai', 'Siap diambil')),

    catatan_konsumen TEXT,                                 -- diisi konsumen saat titip
    defect_notes     TEXT,                                 -- cacat bawaan, diisi teknisi

    -- hanya 2 foto: sebelum & sesudah (TIDAK ada foto proses)
    photo_before     TEXT,
    photo_after      TEXT,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trx_status       ON transactions (status);
CREATE INDEX IF NOT EXISTS idx_trx_user         ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_trx_tech         ON transactions (tech_id);
CREATE INDEX IF NOT EXISTS idx_trx_drop_point   ON transactions (drop_point_id);
CREATE INDEX IF NOT EXISTS idx_trx_created_at   ON transactions (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trx_kode ON transactions (kode) WHERE kode IS NOT NULL;

-- ---------- 5. stock (Alat & Bahan Cuci) ----------
CREATE TABLE IF NOT EXISTS stock (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_item     TEXT        NOT NULL,
    tipe          TEXT        NOT NULL CHECK (tipe IN ('alat', 'bahan')),
    jumlah        INTEGER     NOT NULL DEFAULT 0 CHECK (jumlah >= 0),
    satuan        TEXT        NOT NULL CHECK (satuan IN ('pcs', 'liter', 'kg', 'pack')),
    batas_minimum INTEGER     NOT NULL DEFAULT 5,
    supplier      TEXT,
    harga_beli    NUMERIC(12,2) NOT NULL DEFAULT 0,
    tanggal_masuk DATE,
    last_updated  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_tipe  ON stock (tipe);
CREATE INDEX IF NOT EXISTS idx_stock_nama  ON stock (nama_item);

-- ---------- 6. Trigger auto-update updated_at ----------
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

-- =============================================================
-- CATATAN KEAMANAN
-- RLS belum diaktifkan (semua tabel terbuka untuk anon key).
-- WAJIB aktifkan RLS + policy sebelum deploy ke publik, atau
-- pindahkan pemanggilan DB ke service-role key di backend saja.
-- Lihat migrate.sql bagian [7] untuk contoh policy.
-- =============================================================
