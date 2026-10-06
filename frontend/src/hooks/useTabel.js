import { useCallback, useEffect, useRef, useState } from 'react'
import { ambilBerpaginan } from '../services/api'

/**
 * State bersama untuk halaman tabel admin: paginasi, filter, dan pemuatan data.
 *
 * Catatan soal `versi`. Filter disimpan di dalam ref, bukan state, karena objek
 * filter tidak bisa jadi dependency useEffect tanpa membuat effect berjalan
 * terus-menerus. Sebagai gantinya setiap perubahan filter menaikkan
 * penghitung `versi`, dan penghitung itulah yang jadi dependency. Semua
 * dependency di effect ini nilai biasa -- bukan objek atau fungsi inline --
 * jadi aman untuk aturan react-hooks/exhaustive-deps.
 *
 * Filter bernilai kosong dibuang sebelum dikirim supaya tidak jadi
 * `?q=&status=` yang membingungkan backend.
 *
 * PENTING: nilai boolean `false` TIDAK boleh ikut dibuang. `aktif_only=false`
 * berarti "tampilkan yang nonaktif", sedangkan `low_stock=false` berarti
 * "jangan difilter". Kalau `false` ikut hilang, permintaan dikirim tanpa
 * parameter itu dan backend memakai default-nya -- jadi tab "Nonaktif"
 * diam-diam menampilkan semua sepatu aktif. Pakai `undefined` untuk
 * benar-benar tidak mengirim parameter.
 */

/** Buang nilai kosong supaya query string tetap rapi. */
function bersihkan(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined),
  )
}

export function useTabel({ endpoint, filterAwal = {}, perHalamanAwal = 25 }) {
  const [halaman, setHalaman] = useState(1)
  const [perHalaman, setPerHalaman] = useState(perHalamanAwal)
  const [versi, setVersi] = useState(0)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [totalHalaman, setTotalHalaman] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const filterRef = useRef(filterAwal)
  // Disimpan di ref supaya resetFilter tetap punya dependency kosong walau
  // pemanggil menuliskan objek filter literal di setiap render.
  const filterAwalRef = useRef(filterAwal)

  /** Ganti sebagian filter lalu kembali ke halaman 1. */
  const setFilter = useCallback((perubahan) => {
    filterRef.current = { ...filterRef.current, ...perubahan }
    setHalaman(1)
    setVersi((v) => v + 1)
  }, [])

  /** Buang semua filter (tombol "Reset"). */
  const resetFilter = useCallback(() => {
    filterRef.current = filterAwalRef.current
    setHalaman(1)
    setVersi((v) => v + 1)
  }, [])

  /** Ubah jumlah baris per halaman, kembali ke halaman 1. */
  const gantiPerHalaman = useCallback((n) => {
    setPerHalaman(n)
    setHalaman(1)
    setVersi((v) => v + 1)
  }, [])

  useEffect(() => {
    let batal = false
    setLoading(true)
    setError(null)

    ambilBerpaginan(endpoint, {
      halaman,
      perHalaman,
      ...bersihkan(filterRef.current),
    })
      .then((res) => {
        if (batal) return
        setRows(res.rows)
        setTotal(res.total)
        setTotalHalaman(res.totalHalaman)
        // Backend meng-clamp halaman ke jangkauan terakhir yang valid. Ikutin,
        // supaya tombol paginasi tidak menampilkan "halaman 9" yang kosong.
        setHalaman(res.halaman)
      })
      .catch((e) => {
        if (!batal) setError(e.friendlyMessage || e.message || 'Gagal memuat data')
      })
      .finally(() => {
        if (!batal) setLoading(false)
      })

    return () => {
      batal = true
    }
  }, [endpoint, halaman, perHalaman, versi])

  return {
    rows,
    total,
    totalHalaman,
    halaman,
    perHalaman,
    loading,
    error,
    setHalaman,
    setFilter,
    resetFilter,
    gantiPerHalaman,
    muatUlang: () => setVersi((v) => v + 1),
  }
}

/**
 * Input pencarian dengan jeda, yang langsung mendorong filter tabel.
 *
 * Tanpa jeda, mengetik "Nike" memicu empat permintaan karena setiap huruf
 * mengubah filter. 400 ms cukup terasa instan tapi hanya mengirim satu
 * permintaan setelah admin berhenti mengetik.
 *
 * Pemakaian:
 *   const [cari, setCari] = useCariTunda(setFilter)
 *   <input value={cari} onChange={(e) => setCari(e.target.value)} />
 *
 * Run pertama sengaja dilewati: pada mount, filter memang sudah kosong dan
 * `useTabel` sudah membuat request pertamanya sendiri.
 */
export function useCariTunda(setFilter, kunci = 'q', jeda = 400) {
  const [teks, setTeks] = useState('')
  const sudahLewat = useRef(false)

  useEffect(() => {
    if (!sudahLewat.current) {
      sudahLewat.current = true
      return undefined
    }
    const timer = setTimeout(() => setFilter({ [kunci]: teks || undefined }), jeda)
    return () => clearTimeout(timer)
  }, [teks, setFilter, kunci, jeda])

  return [teks, setTeks]
}