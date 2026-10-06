import { useState, useEffect } from 'react'
import { Footprints } from 'lucide-react'
import { formatRupiah, cn } from '../utils/helpers'
import { shoesApi } from '../services/api'

// Mock data for development
const mockShoes = [
  { id: '1', merk: 'Nike', model: 'Air Force 1', harga_cuci: 15000, jenis_treatment: 'Premium', keterangan_treatment: 'Cuci + pemutih kental + anti bau', status: true },
  { id: '2', merk: 'Adidas', model: 'Ultraboost', harga_cuci: 18000, jenis_treatment: 'Steri', keterangan_treatment: 'Cuci steril + anti bakteri', status: true },
  { id: '3', merk: 'Vans', model: 'Old Skool', harga_cuci: 12000, jenis_treatment: 'Standar', keterangan_treatment: 'Cuci standar + pengeringan', status: true },
  { id: '4', merk: 'Converse', model: 'Chuck Taylor', harga_cuci: 10000, jenis_treatment: 'Standar', keterangan_treatment: 'Cuci standar + pengeringan', status: true },
  { id: '5', merk: 'New Balance', model: '550', harga_cuci: 16000, jenis_treatment: 'Waterproof', keterangan_treatment: 'Cuci + coating waterproof', status: true },
  { id: '6', merk: 'Puma', model: 'Suede Classic', harga_cuci: 13000, jenis_treatment: 'Premium', keterangan_treatment: 'Cuci + pemutih + conditioning', status: true },
]

export default function Catalog({ onSelectShoe }) {
  const [shoes, setShoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [useMock, setUseMock] = useState(false)

  useEffect(() => {
    const fetchShoes = async () => {
      try {
        setLoading(true)
        const response = await shoesApi.list({ aktif_only: true })
        if (response.data.length > 0) {
          setShoes(response.data)
          setUseMock(false)
        } else {
          setShoes(mockShoes)
          setUseMock(true)
        }
      } catch (err) {
        setError(err.message)
        setShoes(mockShoes)
        setUseMock(true)
      } finally {
        setLoading(false)
      }
    }
    fetchShoes()
  }, [])

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

  if (error && !useMock) {
    return (
      <div className="card p-8 text-center">
        <p className="text-rose-600 mb-4">Gagal memuat data: {error}</p>
        <p className="text-sm text-slate-500">Menampilkan data contoh...</p>
      </div>
    )
  }

  return (
    <section aria-label="Katalog Sepatu">
      {useMock && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 flex items-center gap-2">
          <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
          Menampilkan data contoh. Hubungkan ke backend untuk data real.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {shoes.map((shoe) => (
          <article key={shoe.id} className="card group overflow-hidden animate-fade-in">
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

            <div className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900 truncate">{shoe.merk}</h3>
                  {shoe.model && <p className="text-sm text-slate-500 truncate">{shoe.model}</p>}
                </div>
              </div>

              {/* Treatment Badge */}
              {shoe.jenis_treatment && (
                <span className="inline-block mb-3 px-2 py-1 text-xs font-medium bg-primary-50 text-primary-700 rounded-full">
                  {shoe.jenis_treatment}
                </span>
              )}

              {/* Description */}
              {shoe.keterangan_treatment && (
                <p className="text-xs text-slate-500 mb-3 line-clamp-2">{shoe.keterangan_treatment}</p>
              )}

              {/* Price & Action */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <div>
                  <p className="text-xl font-bold text-primary-700">{formatRupiah(shoe.harga_cuci)}</p>
                  <p className="text-xs text-slate-500">/pasang</p>
                </div>
                <button
                  onClick={() => onSelectShoe(shoe)}
                  className="btn-primary text-sm px-4 py-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Booking ${shoe.merk} ${shoe.model || ''}`}
                >
                  Booking
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {shoes.length === 0 && (
        <div className="text-center py-12">
          <Footprints className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">Belum ada layanan tersedia</h3>
          <p className="text-slate-500">Silakan hubungi admin untuk menambahkan layanan cuci sepatu.</p>
        </div>
      )}
    </section>
  )
}