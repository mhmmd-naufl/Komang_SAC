import { useState, useEffect, useMemo } from 'react'
import { Footprints } from 'lucide-react'
import { formatRupiah, hargaLayanan, cn } from '../utils/helpers'
import { shoesApi } from '../services/api'

// Tiga kelompok katalog, sama dengan daftar harga resmi Komang SAC.
// Urutannya tidak boleh diacak: katalog ditampilkan per kelompok, jadi
// daftar ini yang menentukan urutan tampil, bukan urutan baris dari database.
const KELOMPOK = [
  { key: 'Cuci Sepatu', label: 'Cuci Sepatu', ikon: Footprints },
  { key: 'Bag, Hat & Helmet', label: 'Bag, Hat & Helmet', ikon: Footprints },
  { key: 'Repaint & Reglue', label: 'Repaint & Reglue', ikon: Footprints },
]

// Data contoh hanya dipakai kalau backend tidak bisa dihubungi sama sekali.
// Nilainya sudah mengikuti daftar harga asli supaya tampilan frontend tidak
// jauh berbeda dari isi katalog yang sebenarnya.
const CONTOH = [
  {
    id: 'c1',
    kelompok: 'Cuci Sepatu',
    jenis_treatment: 'Fast Cleaning',
    merk: 'Fast Cleaning',
    model: 'Paket Ringan',
    harga_cuci: 15000,
    harga_min: 15000,
    harga_max: 15000,
    keterangan_treatment: 'Upper, mid-sol, dan leces. Paket ringan.',
    status: true,
  },
  {
    id: 'c2',
    kelompok: 'Cuci Sepatu',
    jenis_treatment: 'Deep Cleaning',
    merk: 'Deep Cleaning',
    model: 'White',
    harga_cuci: 30000,
    harga_min: 30000,
    harga_max: 30000,
    keterangan_treatment: 'Upper, midsole, outsole, insole, dan leces.',
    status: true,
  },
  {
    id: 'c3',
    kelompok: 'Repaint & Reglue',
    jenis_treatment: 'Shoes Repaint',
    merk: 'Shoes Repaint',
    model: 'Upper Suede',
    harga_cuci: 100000,
    harga_min: 100000,
    harga_max: 200000,
    keterangan_treatment: 'Cat ulang bagian upper berbahan suede.',
    status: true,
  },
]

// Kelompok yang tidak ada di KELOMPOK (data lama tanpa kolom kelompok, atau
// admin menambah kelompok sendiri di panel). Ditampilkan sebagai tab tambahan
// supaya tidak hilang diam-diam.
function kelompokTersedia(baris) {
  const kunci = []
  for (const b of baris) {
    const k = (b.kelompok || '').trim()
    if (k && !kunci.includes(k)) kunci.push(k)
  }
  return kunci
}

export default function Catalog({ onSelectShoe }) {
  const [shoes, setShoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [contoh, setContoh] = useState(false)
  const [grupAktif, setGrupAktif] = useState(KELOMPOK[0].key)

  // Daftar tab dihitung setelah data masuk, karena kelompok tambahan dari
  // database hanya bisa diketahui setelah fetch selesai.
  const [grupTersedia, setGrupTersedia] = useState(KELOMPOK.map((k) => k.key))

  useEffect(() => {
    const fetchShoes = async () => {
      try {
        setLoading(true)
        const response = await shoesApi.list({ aktif_only: true })
        const data = response.data
        if (data.length > 0) {
          setShoes(data)
          setContoh(false)
          const ada = kelompokTersedia(data)
          const gabung = [...kelompokTersedia.map((k) => k.key), ...ada.filter((k) => !kelompokTersedia.some((x) => x.key === k))]
          setGrupTersedia(gabung)
        } else {
          setShoes(CONTOH)
          setContoh(true)
          setGrupTersedia(KELOMPOK.map((k) => k.key))
        }
      } catch (err) {
        setError(err.message)
        setShoes(CONTOH)
        setContoh(true)
        setGrupTersedia(KELOMPOK.map((k) => k.key))
      } finally {
        setLoading(false)
      }
    }
    fetchShoes()
  }, [])

  // Tab yang sedang aktif bisa hilang kalau admin menghapus kelompoknya.
  // Jangan sampai katalog kosong tanpa sebab -- fallback ke tab pertama.
  const grup = grupTersedia.includes(grupAktif) ? grupAktif : grupTersedia[0]

  const tampil = useMemo(() => {
    if (!grup) return []
    return shoes.filter((s) => (s.kelompok || '').trim() === grup)
  }, [shoes, grup])

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card animate-pulse">
            <div className="aspect-square bg-slate-200 rounded-xl mb-4" />
            <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
            <div className="h-4 bg-slate-200 rounded w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  if (error && !contoh) {
    return (
      <div className="card p-8 text-center">
        <p className="text-rose-600 mb-4">Gagal memuat data: {error}</p>
        <p className="text-sm text-slate-500">Menampilkan data contoh...</p>
      </div>
    )
  }

  return (
    <section aria-label="Katalog Layanan">
      {contoh && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 flex items-center gap-2">
          <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
          Menampilkan data contoh. Hubungkan ke backend untuk data real.
        </div>
      )}

      {/* Tab kelompok katalog */}
      <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Kelompok layanan">
        {grupTersedia.map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={key === grup}
            onClick={() => setGrupAktif(key)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium transition-colors',
              key === grup
                ? 'bg-primary-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-primary-300 hover:text-primary-700'
            )}
          >
            {key}
          </button>
        ))}
      </div>

      {grup && (
        <p className="text-sm text-slate-500 mb-4">
          {tampil.length} layanan di kelompok {grup}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {tampil.map((shoe) => {
          const harga = hargaLayanan(shoe)
          return (
            <article key={shoe.id} className="card group overflow-hidden animate-fade-in flex flex-col">
              {/* Image Placeholder */}
              <div className="aspect-square bg-gradient-to-br from-primary-50 to-primary-100 relative overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                  <Footprints className="h-16 w-16 text-primary-300" />
                </div>
                <div className="absolute top-3 right-3">
                  <span className={cn(
                    'badge',
                    shoe.status ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                  )}>
                    {shoe.status ? 'Tersedia' : 'Non Aktif'}
                  </span>
                </div>
              </div>

              <div className="p-4 flex flex-col flex-1">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{shoe.merk}</h3>
                    {shoe.model && <p className="text-sm text-slate-500 truncate">{shoe.model}</p>}
                  </div>
                </div>

                {/* Treatment Badge */}
                {shoe.jenis_treatment && (
                  <span className="inline-block self-start mb-3 px-2 py-1 text-xs font-medium bg-primary-50 text-primary-700 rounded-full">
                    {shoe.jenis_treatment}
                  </span>
                )}

                {/* Description */}
                {shoe.keterangan_treatment && (
                  <p className="text-xs text-slate-500 mb-3 line-clamp-2">{shoe.keterangan_treatment}</p>
                )}

                {/* Price & Action */}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 mt-auto">
                  <div className="min-w-0">
                    {harga.rentang ? (
                      <>
                        <p className="text-sm font-semibold text-primary-700 truncate">{harga.teks}</p>
                        <p className="text-xs text-slate-500">mulai dari · final setelah cek</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xl font-bold text-primary-700">{formatRupiah(harga.jumlah)}</p>
                        <p className="text-xs text-slate-500">/ITEM</p>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => onSelectShoe(shoe)}
                    className="btn-primary text-sm px-4 py-2 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    aria-label={`Booking ${shoe.merk} ${shoe.model || ''}`}
                  >
                    Booking
                  </button>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {tampil.length === 0 && (
        <div className="text-center py-12">
          <Footprints className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">Belum ada layanan di kelompok ini</h3>
          <p className="text-slate-500">Silakan hubungi admin untuk menambahkan layanan.</p>
        </div>
      )}
    </section>
  )
}