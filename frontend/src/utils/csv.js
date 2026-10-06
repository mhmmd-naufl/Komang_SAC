import { api } from '../services/api'

/**
 * Unduh data tabel sebagai berkas CSV.
 *
 * Tiga hal yang sering bikin CSV rusak dan sengaja ditangani di sini:
 *
 * 1. Pemisah koma. Nilai yang mengandung koma, kutip, atau baris baru
 *    dibungkus tanda kutip dan kutip di dalamnya jadi dua kutip (""),
 *    sesuai RFC 4180. Tanpa ini, nama seperti "Adidas, Ultraboost" membuat
 *    seluruh baris bergeser ke kolom yang salah.
 *
 * 2. Awalan formula. Excel menganggap teks yang diawali =, +, -, atau @
 *    sebagai formula. "=SUM(A1)" di kolom harga akan dieksekusi saat file
 *    dibuka. Awalan ini ditulis dengan prefiks tanda kutip tunggal.
 *
 * 3. BOM UTF-8. Tanpa byte order mark, Excel di Windows salah membaca
 *    karakter non-ASCII seperti "Rp" dan tanda hubung panjang.
 */

const BOM = '\uFEFF'

function selKolom(nilai) {
  if (nilai === null || nilai === undefined) return ''
  let teks = String(nilai)
  // Cegah injeksi formula spreadsheet.
  if (/^[=+\-@]/.test(teks)) teks = `'${teks}`
  if (/["\n\r,;]/.test(teks)) teks = `"${teks.replace(/"/g, '""')}"`
  return teks
}

export function keCsv(kolom, baris) {
  const header = kolom.map((k) => selKolom(k.judul)).join(',')
  const isi = baris.map((barisData) =>
    kolom.map((k) => selKolom(typeof k.nilai === 'function' ? k.nilai(barisData) : barisData[k.kunci])).join(','),
  )
  return BOM + [header, ...isi].join('\r\n')
}

export function unduhCsv(namaBerkas, kolom, baris) {
  const blob = new Blob([keCsv(kolom, baris)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = namaBerkas.endsWith('.csv') ? namaBerkas : `${namaBerkas}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke setelah event selesai, supaya browser sempat mulai mengunduh.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Ambil seluruh baris hasil filter, bukan cuma halaman yang sedang tampil.
 *
 * Endpoint daftar dipaginasikan supaya tabel tidak memuat ribuan baris.
 * Untuk ekspor, admin justru ingin semuanya -- jadi halaman diambil satu per
 * satu sampai habis. Ada batas atas supaya permintaan berat tidak membuat
 * browser menggantung; kalau kena batas, pemanggil diberi tahu lewat
 * `terpotong` supaya bisa menampilkan peringatan, bukan diam-diam memotong.
 */
export async function ambilSemua(path, { perPage = 200, maksBaris = 5000, ...params } = {}) {
  const semua = []
  let halaman = 1
  let total = 0
  let terpotong = false

  for (;;) {
    const res = await api.get(path, { params: { ...params, page: halaman, per_page: perPage } })
    const baris = Array.isArray(res.data) ? res.data : []
    total = Number(res.headers?.['x-total-count']) || semua.length + baris.length

    semua.push(...baris)
    if (semua.length >= total || baris.length === 0) break
    if (semua.length >= maksBaris) {
      terpotong = total > semua.length
      break
    }
    halaman += 1
  }

  return { baris: semua, total, terpotong }
}