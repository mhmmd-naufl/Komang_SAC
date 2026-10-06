import { useState } from 'react'
import { Routes, Route, Navigate, Outlet, Link, useLocation } from 'react-router-dom'
import { Menu, LogOut, LayoutDashboard, Footprints, Truck, Settings, Users } from 'lucide-react'
import Navbar from './components/Navbar'
import Catalog from './components/Catalog'
import BookingModal from './components/BookingModal'
import AdminDashboard from './components/AdminDashboard'
import LoginModal from './components/LoginModal'
import StatusTracker from './components/StatusTracker'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Toaster } from './components/Toast'
import { cn } from './utils/helpers'

/* ------------------------------------------------------------------ */
/* Public Layout                                                       */
/* ------------------------------------------------------------------ */

function PublicLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="container-main py-8 text-center text-sm text-slate-500">
          <p className="font-semibold text-slate-700">Komang SAC</p>
          <p className="mt-1">Cuci sepatu profesional dengan tracking real-time.</p>
          <p className="mt-2 text-xs">&copy; 2026 Komang SAC. Semua hak dilindungi.</p>
        </div>
      </footer>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */

const STEPS = [
  { n: '01', title: 'Pilih & Booking', desc: 'Pilih layanan, isi data, tentukan drop point.' },
  { n: '02', title: 'Titip Sepatu', desc: 'Serahkan di drop point, teknisi foto kondisi awal.' },
  { n: '03', title: 'Pantau Real-time', desc: 'Lihat status: Diterima sampai Siap diambil.' },
  { n: '04', title: 'Ambil & Bayar', desc: 'Ambil saat siap, bayar sesuai tipe layanan.' },
]

const DROP_POINTS = [
  {
    name: 'Outlet Utama',
    sub: 'Jl. Cisadane No.3',
    addr: 'Lingkungan Mojoroto R, Singonegaran, Kec. Banyuwangi, Kabupaten Banyuwangi, Jawa Timur 68415',
  },
  {
    name: 'Dolay Cut',
    sub: 'Mitra drop point',
    addr: 'Jl. Kyai Haji Wahid Hasyim No. 76, Kabupaten Banyuwangi',
  },
]

function HomePage() {
  const [showBooking, setShowBooking] = useState(false)
  const [selectedShoe, setSelectedShoe] = useState(null)

  const openBooking = (shoe = null) => {
    setSelectedShoe(shoe)
    setShowBooking(true)
  }

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="bg-gradient-to-r from-primary-700 to-primary-900 text-white">
        <div className="container-main py-16 sm:py-24">
          <div className="max-w-2xl">
            <span className="inline-block px-3 py-1 rounded-full bg-white/10 text-xs font-medium mb-6">
              Layanan Cuci Sepatu Premium
            </span>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
              Sepatu Anda,<br />
              Pulang Seperti Baru.
            </h1>
            <p className="mt-6 text-lg text-primary-100">
              Titip di drop point terdekat, pantau progres cuci real-time, ambil saat siap.
              Harga transparan, tanpa biaya tersembunyi.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <button
                onClick={() => openBooking()}
                className="btn bg-white text-primary-700 hover:bg-primary-50 text-base px-8 py-3.5"
              >
                Booking Sekarang
              </button>
              <Link
                to="/status"
                className="btn border border-white/30 text-white hover:bg-white/10 text-base px-8 py-3.5"
              >
                Cek Status Sepatu
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="container-main py-16">
        <h2 className="text-2xl font-bold text-slate-900 text-center mb-2">Cara Kerja</h2>
        <p className="text-slate-500 text-center mb-10">
          Empat langkah sederhana, nomor booking jadi bukti.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map((s) => (
            <div key={s.n} className="card p-6">
              <span className="text-sm font-bold text-primary-600">{s.n}</span>
              <h3 className="mt-2 font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-2 text-sm text-slate-500">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Catalog */}
      <section className="container-main pb-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Layanan & Harga</h2>
            <p className="text-slate-500 mt-1">
              Harga per pasang, sudah termasuk perbaikan & workmanship.
            </p>
          </div>
          <button onClick={() => openBooking()} className="btn-primary hidden sm:inline-flex">
            Booking
          </button>
        </div>
        <Catalog onSelectShoe={openBooking} />
      </section>

      {/* Drop points */}
      <section className="bg-white border-y border-slate-200 py-16">
        <div className="container-main">
          <h2 className="text-2xl font-bold text-slate-900 mb-8">Lokasi Drop Point</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {DROP_POINTS.map((dp) => (
              <div key={dp.name} className="card p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-xl bg-primary-50 flex items-center justify-center">
                    <Truck className="h-5 w-5 text-primary-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{dp.name}</h3>
                    <p className="text-xs text-slate-500">{dp.sub}</p>
                  </div>
                </div>
                <p className="text-sm text-slate-600">{dp.addr}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container-main py-16">
        <div className="card-primary p-8 sm:p-12 text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-3">Siap Cuci Sekarang?</h2>
          <p className="text-slate-600 max-w-lg mx-auto mb-8">
            Booking dalam hitungan detik. Status sepatu bisa dipantau kapan saja lewat nomor booking.
          </p>
          <button onClick={() => openBooking()} className="btn-primary text-base px-10 py-3.5">
            Mulai Booking
          </button>
        </div>
      </section>

      {showBooking && (
        <BookingModal
          shoe={selectedShoe}
          onClose={() => setShowBooking(false)}
          onSuccess={() => setShowBooking(false)}
        />
      )}
    </PublicLayout>
  )
}

/* ------------------------------------------------------------------ */
/* Status page                                                         */
/* ------------------------------------------------------------------ */

function StatusPage() {
  return (
    <PublicLayout>
      <div className="container-main py-12">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Cek Status Sepatu</h1>
        <p className="text-slate-500 mb-8">
          Masukkan nomor booking yang kamu terima saat titip sepatu untuk melihat progres terbaru.
        </p>
        <StatusTracker />
      </div>
    </PublicLayout>
  )
}

/* ------------------------------------------------------------------ */
/* Guard                                                               */
/* ------------------------------------------------------------------ */

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

/* ------------------------------------------------------------------ */
/* Admin layout                                                        */
/* ------------------------------------------------------------------ */

function AdminLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navItems = [
    { path: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
    { path: '/admin/sepatu', label: 'Kelola Sepatu', icon: Footprints },
    { path: '/admin/transaksi', label: 'Transaksi', icon: Truck },
    { path: '/admin/stock', label: 'Stok & Bahan', icon: Settings },
    { path: '/admin/users', label: 'Pengguna', icon: Users },
  ]

  const isActive = (item) =>
    item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path)

  return (
    <div className="min-h-screen bg-slate-50">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transition-transform duration-300 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-slate-200">
            <h1 className="text-xl font-bold text-primary-700">Komang SAC</h1>
            <p className="text-xs text-slate-500 mt-0.5">Admin Panel</p>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                  isActive(item)
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="p-4 border-t border-slate-200">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="h-9 w-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-semibold shrink-0">
                {user?.full_name?.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate">{user?.full_name}</p>
                <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
              </div>
              <button
                onClick={logout}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-rose-600"
                title="Keluar"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
          <div className="flex items-center gap-4 h-16 px-4 sm:px-6 lg:px-8">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100"
            >
              <Menu className="h-6 w-6 text-slate-600" />
            </button>
            <h1 className="text-lg font-bold text-slate-900">Komang SAC Admin</h1>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Placeholder pages                                                   */
/* ------------------------------------------------------------------ */

function Placeholder({ title, description }) {
  return (
    <div className="card p-8">
      <h2 className="text-xl font-bold text-slate-900 mb-2">{title}</h2>
      <p className="text-slate-500">{description}</p>
      <p className="mt-4 text-sm text-primary-600">Modul sedang dibangun.</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/status" element={<StatusPage />} />
      <Route path="/login" element={<LoginModal />} />

      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route
          path="sepatu"
          element={<Placeholder title="Kelola Sepatu" description="CRUD master sepatu, harga, dan jenis treatment." />}
        />
        <Route
          path="transaksi"
          element={<Placeholder title="Transaksi" description="Monitor dan kelola seluruh transaksi cuci." />}
        />
        <Route
          path="stock"
          element={<Placeholder title="Stok & Bahan" description="Monitoring stok alat dan bahan cuci." />}
        />
        <Route
          path="users"
          element={<Placeholder title="Pengguna" description="Kelola admin, teknisi, pelanggan, dan drop point." />}
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
      <Toaster />
    </AuthProvider>
  )
}
