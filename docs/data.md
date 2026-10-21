# data.md
Data yang Perlu Disiapkan Oleh Partner Sebelum Memulai Project Komang SAC

File ini berisi seluruh master data yang harus diinputkan sebelum atau pada awal fase development (Phase 1). Data ini akan di-import ke database Supabase.

## 1. Identitas Usaha (1 baris)
- `nama_usaha`: nama lengkap usaha (misal: `Komang SAC`)
- `wa_utama`: Nomor WhatsApp utama untuk notifikasi sistem (misal: `6281111111111`)
- `email`: Email kontak (opsional, misal: `contact@komangsac.com`)
- `alamat_usaha`: Alamat lengkap (misal: `Jl. Sudirman No. 5, Kota X`)
- `komisi_teknisi`: Persentase komisi teknisi (standar: `50`)
- `batas_stok_minimum`: Stok minimum sebelum muncul alarm (misal: `10`)
- `metode_pembayaran`: `tunai`, `transfer`, atau `qr`

## 2. Master Data Sepatu (Setiap baris = 1 jenis sepatu)
- `merk`: Nama merk (misal: `Nike`)
- `model`: Model/type (misal: `Air Max`)
- `harga_cuci`: Harga cuci standar (integer, misal: `15000`)
- `jenis_treatment`: Jenis tratamento (`Standar`, `Premium`, `Steri`, `Waterproof`)
- `keterangan_treatment`: Catatan tambahan (bisa kosong, misal: `Cuci + pemutih kental`)
- `status_aktif`: `true` (tampil di katalog) atau `false`

**Contoh Isian (baris per baris):**
| merk | model | harga_cuci | jenis_treatment | keterangan_treatment | status_aktif |
|------|-------|------------|-----------------|----------------------|------------|
| Nike | Air Max | 15000 | Premium | Cuci + pemutih kental | true |
| Adidas | Superstar | 12000 | Standar | - | true |

## 3. Data Drop-point (Jika ada mitra fisik)
- `nama`: Nama drop-point (misal: `Rumah Sehat Shoes`)
- `alamat`: Alamat lengkap
- `wa_contact`: Nomor WA pengelola drop-point
- `aktif`: `true` atau `false`

**Contoh Isian:**
| nama | alamat | wa_contact | aktif |
|------|--------|------------|-------|
| Rumah Sehat Shoes | Jl. Asia Afrika 10 | 6284444444444 | true |

## 4. Stock Awal Alat & Bahan Cuci
- `nama_item`: Nama item (misal: `Spray Pemutih`)
- `tipe`: `alat` atau `bahan`
- `jumlah_awal`: Jumlah stok sekarang (integer)
- `satuan`: `pcs`, `liter`, `kg`, `pack`
- `batas_minimum`: Stok minimum sebelum warning (integer)
- `supplier`: Nama pemasok (opsional)
- `harga_beli`: Harga beli per satuan (numeric)

**Contoh Isian:**
| nama_item | tipe | jumlah_awal | satuan | batas_minimum | supplier | harga_beli |
|-----------|------|-------------|--------|---------------|----------|------------|
| Spray Pemutih | bahan | 50 | liter | 10 | Toko Kimia | 5000 |
| Brush Besar | alat | 20 | pcs | 5 | Distro Alat | 3000 |

## 5. Profil Admin
- `full_name`: Nama pemilik/atasan (misal: `Komang`)
- `wa_admin`: Nomor WA admin (bisa sama dengan wa_utama atau berbeda)

**Catatan Penting:**
- Semua field bertipe teks kecuali numbers/hinteger harus sesuai contoh.
- Kosongkan baris yang tidak digunakan (kosongkan kolom atau isi `null`/kosong).
- File ini akan di-import ke database Supabase pada Phase 1 setelah dikirim.
- Jika data bagian tidak relevan (misal: belum ada stock awal), biarkan kosong atau isi `0`/`false` sesuai konteks.