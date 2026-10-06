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

-- ---------- 2. shoes (Master Layanan / Price List) ----------
-- CATATAN: tabel ini bukan "master sepatu" per-merk lagi. Satu baris = satu
-- VARIAN LAYANAN (cth. "Deep Cleaning / White"), karena daftar harga Komang SAC
-- selling by jenis TREATMENT, bukan by brand. Kolom merk dipakai untuk nama
-- layanannya dan model untuk variannya, supaya struktur lama tetap kepakai.
--
-- Harga bisa berupa rentang (mis. Repaint 80.000 - 150.000). Transaksi dicatat
-- memakai harga_min sebagai harga awal, sisamntinya dikonfirmasi admin di outlet
-- lewat endpoint finalisasi harga.
CREATE TABLE IF NOT EXISTS shoes (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merk                  TEXT        NOT NULL,
    model                 TEXT,
    harga_cuci            INTEGER     NOT NULL CHECK (harga_cuci >= 0),
    harga_min             INTEGER              CHECK (harga_min  IS NULL OR harga_min  >= 0),
    harga_max             INTEGER              CHECK (harga_max  IS NULL OR harga_max  >= 0),
    -- kelompok katalog: 'Cuci Sepatu' | 'Bag, Hat & Helmet' | 'Repaint & Reglue'
    kelompok              TEXT        CHECK (
                                   kelompok IS NULL OR
                                   kelompok ~ '^[A-Za-z][A-Za-z0-9 &/,.-]{0,60}$'
                               ),
    -- POLA BUKA, bukan enum. Daftar layanan terus berkembang (Repaint, Reglue,
    -- Unyellowing, Helmet, ...) dan admin harus bisa menambah yang baru tanpa
    -- perlu ALTER TABLE dulu. Yang tetap dijaga: tidak kosong, maksimal 40 huruf.
    jenis_treatment       TEXT        CHECK (
                                   jenis_treatment IS NULL OR
                                   jenis_treatment ~ '^[A-Za-z][A-Za-z0-9 &/.,()-]{0,40}$'
                               ),
    keterangan_treatment  TEXT,
    status                BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- harga_max tidak boleh lebih kecil dari harga_min
    CONSTRAINT shoes_harga_rentang_check CHECK (
        harga_min IS NULL OR harga_max IS NULL OR harga_max >= harga_min
    )
);

CREATE INDEX IF NOT EXISTS idx_shoes_status   ON shoes (status);
CREATE INDEX IF NOT EXISTS idx_shoes_merk     ON shoes (merk);
CREATE INDEX IF NOT EXISTS idx_shoes_kelompok ON shoes (kelompok);

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
    photo_defect     TEXT,
    photo_defect     TEXT,

    -- Diisi backend saat teknisi menandai status Selesai. Ini yang dipakai
    -- untuk laporan bulanan/tahunan: transaksi dihitung masuk bulan yang mana
    -- berdasarkan tanggal SELESAI-nya, bukan tanggal masuk. Kalau dihitung dari
    -- created_at, cucian yang masuk tanggal 31 dan selesai tanggal 2 akan
    -- terpotong dua bulan dan omzet bulan tersebut jadi salah.
    selesai_at       TIMESTAMPTZ,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trx_status       ON transactions (status);
CREATE INDEX IF NOT EXISTS idx_trx_user         ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_trx_tech         ON transactions (tech_id);
CREATE INDEX IF NOT EXISTS idx_trx_drop_point   ON transactions (drop_point_id);
CREATE INDEX IF NOT EXISTS idx_trx_created_at   ON transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trx_selesai_at   ON transactions (selesai_at);
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
