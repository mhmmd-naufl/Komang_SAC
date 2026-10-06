/**
 * Helper periode laporan (bulan / tahun).
 *
 * Backend menghitung laporan berdasarkan `transactions.selesai_at` -- tanggal
 * teknisi menandai Selesai. Jadi "Omzet Oktober" berarti pekerjaan yang rampung
 * di Oktober, bukan pekerjaan yang masuk di Oktober. Keduanya sering beda jauh
 * kalau ada cucian yang molor.
 *
 * Zona waktu: WIB (UTC+7), sama dengan yang dipakai backend. Kalau frontend
 * menghitung awal bulan di zona browser sementara backend di WIB, ada job yang
 * selesai pagi hari masuk ke bucket yang berbeda. Jadi hitungannya selalu lewat
 * `new Date(year, month - 1, 1)` (waktu lokal) dan tanggal dikirim apa adanya
 * sebagai angka tahun/bulan, bukan sebagai string ISO.
 */

export const NAMA_BULAN = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
]

/**
 * Periode default saat dashboard dibuka: bulan berjalan (minimal 2026).
 */
export function periodeAwal() {
  const sekarang = new Date()
  const tahunSekarang = sekarang.getFullYear()
  return {
    bulan: sekarang.getMonth() + 1,
    tahun: Math.max(sekarang.getFullYear(), 2026),
  }
}

/**
 * Ubah nilai periode jadi parameter query backend.
 *
 * Hasilnya berisi dua kelompok yang harus dikirim ke endpoint berbeda:
 *
 *   - `bulan` / `tahun`  -> /api/stats/admin dan /api/analytics/summary.
 *     Backend yang menghitung batas bulan/tahun, supaya bucket harian dan
 *     bulannya dijamin sama dengan yang dipakai untuk omzet.
 *   - `selesaiDari` / `selesaiSampai` -> /api/transaksi, untuk daftar
 *     transaksi yang akan diekspor.
 *
 * Batas atas pada `selesaiSampai` SENGAJA eksklusif (menunjuk ke 1 pukul 00:00
 * periode berikutnya), karena backend membandingkannya dengan `lt()`. Kalau
 * mengirim tanggal terakhir periode dengan `lt()`, satu transaksi yang selesai
 * tepat tengah malam tanggal 1 akan hilang dari laporan.
 *
 * Tanggalnya cukup `YYYY-MM-DD`, jadi tidak ada involvement zona waktu sama
 * sekali: "Oktober 2026" selalu berarti 1 Oktober sampai 1 November, pada
 * zona waktu mana pun di dunia.
 */
export function keParameter(nilai) {
  const bulan = nilai.bulan
  const tahun = nilai.tahun

  if (!bulan || !tahun) {
    return { periode: 'semua' }
  }

  const selesaiDari = `${tahun}-${String(bulan).padStart(2, '0')}-01`
  const selesaiSampai =
    bulan === 12
      ? `${tahun + 1}-01-01`
      : `${tahun}-${String(bulan + 1).padStart(2, '0')}-01`

  return {
    bulan,
    tahun,
    selesaiDari,
    selesaiSampai,
  }
}

/** Label periode untuk judul dan nama berkas ekspor. */
export function labelPeriode(nilai) {
  const bulan = nilai.bulan || new Date().getMonth() + 1
  const tahun = nilai.tahun || new Date().getFullYear()
  return `${NAMA_BULAN[bulan - 1]} ${tahun}`
}

/**
 * Gridlines sumbu Y untuk grafik batang.
 *
 * Pembulatan ke "angka bulat" (1, 2, 5, 10, ...) supaya labelnya enak dibaca.
 * Pembulatan ke angka acak seperti 3.4283 membuat sumbu Y penuh angka yang
 * tidak masuk akal dan tidak pernah seabanding.
 */
export function garisY(maks, jumlah = 4) {
  if (!Number.isFinite(maks) || maks <= 0) return [0, 1]
  const kasar = maks / jumlah
  const pangkat = Math.pow(10, Math.floor(Math.log10(kasar)))
  const sisa = kasar / pangkat
  const pengali = sisa <= 1 ? 1 : sisa <= 2 ? 2 : sisa <= 5 ? 5 : 10
  const langkah = pengali * pangkat
  const atas = Math.ceil(maks / langkah) * langkah
  const hasil = []
  for (let v = 0; v <= atas + 1e-9; v += langkah) {
    hasil.push(Math.round(v * 1000) / 1000)
  }
  return hasil
}