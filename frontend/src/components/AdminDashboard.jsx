import { useState, useEffect, useCallback } from 'react'
import { Footprints, TrendingUp, Wallet, Users, AlertTriangle, Loader2 } from 'lucide-react'
import { statsApi, transactionsApi, stockApi } from '../services/api'
import { formatRupiah, formatDate, getStatusConfig, cn } from '../utils/helpers'

const MOCK = {
  ringkasan: {
    total_transaksi: 128,
    shoes_washed: 164,
    total_pendapatan: 4750000,
    total_teknisi: 3,
  },
  per_teknisi: [
    { id: '1', full_name: 'Agus', jumlah_pekerjaan: 54, tech_commission: 1250000 },
    { id: '2', full_name: 'Rizal', jumlah_pekerjaan: 42, tech_commission: 980000 },
    { id: '3', full_name: 'Bayu', jumlah_pekerjaan: 32, tech_commission: 810000 },
  ],
  terbaru: [
    {
      kode: 'KS-7F3K9Q', status: 'Diproses', created_at: '2026-10-05T10:00:00Z',
      harga: 35000, shoes: { merk: 'Nike', model: 'Air Force 1' },
    },
    {
      kode: 'KS-4M2X8T', status: 'Siap diambil', created_at: '2026-10-05T09:00:00Z',
      harga: 40000, shoes: { merk: 'Adidas', model: 'Ultraboost' },
    },
    {
      kode: 'KS-9B1L6R', status: 'Diperiksa', created_at: '2026-10-04T15:00:00Z',
      harga: 25000, shoes: { merk: 'Vans', model: 'Old Skool' },
    },
  ],
  stok_menipis: [
    { id: '1', nama_item: 'Sabun Netral', satuan: 'liter', jumlah: 2, batas_minimum: 5 },
    { id: '2', nama_item: 'Sikat Kasur', satuan: 'pcs', jumlah: 8, batas_minimum: 10 },
  ],
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true)
  const [usingMock, setUsingMock] = useState(false)
  const [data, setData] = useState(MOCK)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [stats, trx, stock] = await Promise.all([
        statsApi.admin(),
        transactionsApi.list({ limit: 8 }),
        stockApi.list({ low_stock: true }),
      ])

      setData({
        ringkasan: stats.data,
        per_teknisi: stats.data.per_teknisi,
        terbaru: trx.data,
        stok_menipis: stock.data,
      })
      setUsingMock(false)
    } catch (err) {
      // 403 = belum login sebagai admin, 401 = token invalid.
      // Selain itu (backend mati / 404 kolom) pakai data contoh biar UI tetap bisa direview.
      console.warn('[AdminDashboard] gagal memuat data, pakai data contoh:', err?.message)
      setUsingMock(true)
      setData(MOCK)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const r = data.ringkasan

  const cards = [
    { label: 'Sepatu Dicuci', value: r.shoes_washed, icon: Footprints, tone: 'blue' },
    { label: 'Total Pendapatan', value: formatRupiah(r.total_pendapatan), icon: Wallet, tone: 'emerald' },
    { label: 'Transaksi', value: r.total_transaksi, icon: TrendingUp, tone: 'violet' },
    { label: 'Teknisi Aktif', value: r.total_teknisi, icon: Users, tone: 'cyan' },
  ]

  const tones = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    violet: 'bg-violet-50 text-violet-600',
    cyan: 'bg-cyan-50 text-cyan-600',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Ringkasan performa laundry.</p>
        </div>
        {usingMock && (
          <span className="badge bg-amber-100 text-amber-800">
            Data contoh — backend belum terhubung
          </span>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-5">
            <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center mb-3', tones[c.tone])}>
              <c.icon className="h-5 w-5" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 truncate">{c.value}</p>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Transaksi terbaru */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Transaksi Terbaru</h2>
            <span className="text-xs text-slate-500">{data.terbaru.length} data</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Kode</th>
                  <th className="px-5 py-3 text-left font-medium">Status</th>
                  <th className="px-5 py-3 text-left font-medium">Biaya</th>
                  <th className="px-5 py-3 text-left font-medium">Masuk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.terbaru.map((t) => (
                  <tr key={t.kode || t.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs font-medium">{t.kode || '—'}</td>
                    <td className="px-5 py-3">
                      <span className={cn(getStatusConfig(t.status).className)}>
                        {getStatusConfig(t.status).label}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-medium">{formatRupiah(t.harga)}</td>
                    <td className="px-5 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {formatDate(t.created_at)}
                    </td>
                  </tr>
                ))}
                {data.terbaru.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-slate-400">
                      Belum ada transaksi.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          {/* Komisi teknisi */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Komisi Teknisi</h2>
              <p className="text-xs text-slate-500">50% dari harga terpasang</p>
            </div>
            <div className="divide-y divide-slate-100">
              {data.per_teknisi.map((t) => (
                <div key={t.id} className="px-5 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.full_name}</p>
                    <p className="text-xs text-slate-500">{t.jumlah_pekerjaan} pekerjaan</p>
                  </div>
                  <p className="text-sm font-semibold text-primary-700 whitespace-nowrap ml-3">
                    {formatRupiah(t.tech_commission)}
                  </p>
                </div>
              ))}
              {data.per_teknisi.length === 0 && (
                <p className="px-5 py-8 text-center text-sm text-slate-400">Belum ada teknisi.</p>
              )}
            </div>
          </div>

          {/* Low stock */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h2 className="font-semibold text-slate-900">Stok Menipis</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {data.stok_menipis.map((s) => (
                <div key={s.id} className="px-5 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.nama_item}</p>
                    <p className="text-xs text-slate-500">min. {s.batas_minimum} {s.satuan}</p>
                  </div>
                  <span className="badge bg-rose-100 text-rose-800 whitespace-nowrap ml-3">
                    {s.jumlah} {s.satuan}
                  </span>
                </div>
              ))}
              {data.stok_menipis.length === 0 && (
                <p className="px-5 py-8 text-center text-sm text-emerald-600">Semua stok aman.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
