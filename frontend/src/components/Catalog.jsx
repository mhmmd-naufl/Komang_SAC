import { useState, useEffect, useMemo } from 'react'
import { ChevronDown, Footprints, X } from 'lucide-react'
import { formatRupiah, cn } from '../utils/helpers'
import { shoesApi } from '../services/api'

// Logo biru sebagai default image untuk layanan
const LOGO_LAYANAN = '/assets/logo-biru.png'

// Tiga kelompok katalog, sama dengan daftar harga resmi Komang SAC.
// Urutannya tidak boleh diacak: katalog ditampilkan per kelompok, jadi
// daftar ini yang menentukan urutan tampil, bukan urutan baris dari database.
const KELOMPOK = [
  { key: 'Cuci Sepatu', label: 'Cuci Sepatu', ikon: Footprints },
  { key: 'Bag, Hat & Helmet', label: 'Bag, Hat & Helmet', ikon: Footprints },
  { key: 'Repaint & Reglue', label: 'Repaint & Reglue', ikon: Footprints },
]

// Kelompok yang tidak ada di KELOMPOK (data lama tanpa kolom kelompok, atau
// admin menambah kelompok sendiri di panel). Ditampilkan sebagai tab tambahan
// supaya tidak hilang diam-diam.
function getKelompokTersedia(baris) {
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
  const [grupAktif, setGrupAktif] = useState(KELOMPOK[0].key)
  // Kartu layanan yang sedang membuka daftar variannya. Pemilihan varian
  // berada DI DALAM kartu (bukan modal terpisah) supaya di HP langkahnya
  // terasa seperti membuka lipatan: tap kartu -> daftar varian -> booking.
  const [kartuTerbuka, setKartuTerbuka] = useState(null)

  // Daftar tab dihitung setelah data masuk, karena kelompok tambahan dari
  // database hanya bisa diketahui setelah fetch selesai.
  const [grupTersedia, setGrupTersedia] = useState(KELOMPOK.map((k) => k.key))

  useEffect(() => {
    const fetchShoes = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await shoesApi.list({ aktif_only: true })
        const data = response.data
        setShoes(data)
        const ada = getKelompokTersedia(data)
        const gabung = [...KELOMPOK.map((k) => k.key), ...ada.filter((k) => !KELOMPOK.some((x) => x.key === k))]
        setGrupTersedia(gabung)
      } catch (err) {
        setError(err.message)
        setShoes([])
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

  /**
   * Satu kartu menampung semua baris master yang bertipe sama
   * (jenis_treatment; tanpa tipe, nama layanannya sendiri). Baris-baris itu
   * adalah variannya -- model kolom master menyimpan bedanya, misalnya
   * Deep Cleaning -> "White" dan "Non White", atau Bag Cleaning -> "Small",
   * "Medium", "Big". Pemilihan varian yang sebelumnya dua kartu terpisah
   * kini jadi satu kartu dengan daftar pilihan di dalamnya.
   */
  const kartu = useMemo(() => {
    const map = new Map()
    for (const s of tampil) {
      const kunci = (s.jenis_treatment || s.merk || '').trim() || 'Layanan'
      if (!map.has(kunci)) map.set(kunci, [])
      map.get(kunci).push(s)
    }
    return [...map.entries()]
      .map(([nama, varian]) => ({
        nama,
        varian: [...varian].sort((a, b) =>
          (a.harga_cuci ?? 0) - (b.harga_cuci ?? 0) ||
          String(a.model || '').localeCompare(String(b.model || '')),
        ),
        // Keterangan diambil dari varian pertama yang menuliskannya.
        keterangan: varian.map((v) => v.keterangan_treatment).find(Boolean) || null,
        treatment: varian[0]?.jenis_treatment || null,
        // Rentang harga: varian termurah vs termahal di kartu ini.
        termurah: Math.min(...varian.map((v) => v.harga_cuci ?? 0)),
        termahal: Math.max(...varian.map((v) => v.harga_cuci ?? 0)),
      }))
      .sort((a, b) => a.nama.localeCompare(b.nama))
  }, [tampil])

  const bukaKartu = (nama) => setKartuTerbuka((aktif) => (aktif === nama ? null : nama))

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

  if (error) {
    return (
      <div className="card p-8 text-center">
        <p className="text-rose-600 mb-2">Gagal memuat data layanan</p>
        <p className="text-sm text-slate-500">{error}</p>
      </div>
    )
  }

  return (
    <section aria-label="Katalog Layanan">

      {/* Tab kelompok katalog */}
      <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Kelompok layanan">
        {grupTersedia.map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={key === grup}
            onClick={() => {
              setGrupAktif(key)
              setKartuTerbuka(null)
            }}
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
          {kartu.length} layanan di kelompok {grup}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {kartu.map((k) => {
          const terbuka = kartuTerbuka === k.nama
          const banyakHarga = k.termurah !== k.termahal
          return (
            <article
              key={k.nama}
              onClick={terbuka ? undefined : () => bukaKartu(k.nama)}
              onKeyDown={
                terbuka
                  ? undefined
                  : (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        bukaKartu(k.nama)
                      }
                    }
              }
              role={terbuka ? undefined : 'button'}
              tabIndex={terbuka ? -1 : 0}
              className={cn(
                'card group overflow-hidden animate-fade-in flex flex-col',
                !terbuka && 'cursor-pointer',
              )}
              aria-label={`Layanan ${k.nama}, ${k.varian.length} varian. Aktifkan untuk memilih varian.`}
            >
              {/* Image Placeholder - Logo Biru */}
              <div className="aspect-square bg-gradient-to-br from-primary-50 to-primary-100 relative overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center p-6">
                  <img
                    src={LOGO_LAYANAN}
                    alt={k.nama}
                    className="max-h-full max-w-full object-contain opacity-80"
                    loading="lazy"
                  />
                </div>
              </div>

              <div className="p-4 flex flex-col flex-1">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-slate-900 truncate">{k.nama}</h3>
                  <span className="shrink-0 badge bg-slate-100 text-slate-600">
                    {k.varian.length} varian
                  </span>
                </div>

                {k.treatment && (
                  <span className="inline-block self-start mb-3 px-2 py-1 text-xs font-medium bg-primary-50 text-primary-700 rounded-full">
                    {k.treatment}
                  </span>
                )}

                {k.keterangan && (
                  <p className="text-xs text-slate-500 mb-3 line-clamp-2">{k.keterangan}</p>
                )}

                {terbuka ? (
                  /* ---------- Daftar varian: satu kartu bisa langsung dipilih di sini ---------- */
                  <div className="mt-auto pt-3 border-t border-slate-100">
                    <p className="text-xs text-slate-500 mb-2">Pilih varian untuk booking:</p>
                    <div className="space-y-1.5 mb-2">
                      {k.varian.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => {
                            setKartuTerbuka(null)
                            onSelectShoe(v)
                          }}
                          className="w-full flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-left transition-colors hover:border-primary-300 hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                        >
                          <span className="min-w-0 text-sm font-medium text-slate-800 truncate">
                            {v.model || k.nama}
                          </span>
                          <span className="shrink-0 text-sm font-semibold text-primary-700">
                            {formatRupiah(v.harga_cuci)}
                          </span>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setKartuTerbuka(null)}
                      className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 py-1.5 hover:text-slate-700"
                    >
                      <X className="h-3.5 w-3.5" />
                      Tutup pilihan
                    </button>
                  </div>
                ) : (
                  /* ---------- Ringkasan: kartu dalam keadaan normal ---------- */
                  <div
                    className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between gap-3"
                    aria-hidden="true"
                  >
                    <div className="min-w-0">
                      {banyakHarga ? (
                        <>
                          <p className="text-sm font-semibold text-primary-700 truncate">
                            {formatRupiah(k.termurah)} - {formatRupiah(k.termahal)}
                          </p>
                          <p className="text-xs text-slate-500">tergantung varian</p>
                        </>
                      ) : (
                        <>
                          <p className="text-xl font-bold text-primary-700">
                            {formatRupiah(k.termurah)}
                          </p>
                          <p className="text-xs text-slate-500">/ITEM · semua varian</p>
                        </>
                      )}
                    </div>
                    <span className="shrink-0 flex items-center gap-1 text-xs font-medium text-primary-700">
                      Booking
                      <ChevronDown className="h-4 w-4" />
                    </span>
                  </div>
                )}
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
