import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import Logo from './Logo'
import { useAuth } from '../contexts/AuthContext'
import LogoutConfirm from './LogoutConfirm'
import { cn, getRoleLabel, getRoleColor } from '../utils/helpers'

/* Halaman beranda tiap peran. Dipakai di navbar supaya setelah login
   teknisi/mitra/konsumen langsung diarahkan ke panelnya, bukan ke Beranda. */
const HALAMAN_PERAN = {
  admin: { path: '/admin', label: 'Panel Admin' },
  technician: { path: '/teknisi', label: 'Panel Teknisi' },
  drop_point: { path: '/mitra', label: 'Panel Mitra' },
  customer: { path: '/akun', label: 'Sepatu Saya' },
}

export default function Navbar() {
  const { user, isAuthenticated } = useAuth()
  const location = useLocation()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [konfirmasiKeluar, setKonfirmasiKeluar] = useState(false)

  const panelPeran = HALAMAN_PERAN[user?.role]

  const navItems = [
    { path: '/', label: 'Beranda' },
    { path: '/status', label: 'Cek Status' },
  ]

  const isActive = (path) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path))

  const navLinkClass = (path) =>
    cn(
      'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
      isActive(path) ? 'bg-primary-50 text-primary-600' : 'text-slate-600 hover:bg-slate-100'
    )

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <nav className="container-main" aria-label="Navigasi utama">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2" aria-label="Komang SAC beranda">
            <Logo className="h-8 w-8" />
            <span className="font-bold text-xl text-slate-900">Komang SAC</span>
          </Link>

          {/* Navigasi desktop */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link key={item.path} to={item.path} className={navLinkClass(item.path)}>
                {item.label}
              </Link>
            ))}
            {panelPeran && (
              <Link to={panelPeran.path} className={navLinkClass(panelPeran.path)}>
                {panelPeran.label}
              </Link>
            )}
          </div>

          {/* Aksi auth */}
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                  aria-expanded={dropdownOpen}
                  aria-haspopup="true"
                >
                  <span className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-semibold shrink-0">
                    {user?.full_name?.charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden sm:inline max-w-[10rem] truncate">{user?.full_name}</span>
                </button>

                {dropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                    <div className="absolute right-0 mt-2 w-60 bg-white rounded-xl border border-slate-200 shadow-lg py-2 z-50 animate-fade-in">
                      <div className="px-4 py-3 border-b border-slate-100">
                        <p className="text-sm font-medium text-slate-900 truncate">{user?.full_name}</p>
                        <p className="text-xs text-slate-500">{user?.phone}</p>
                        <span
                          className={cn(
                            'inline-block mt-1.5 px-2 py-0.5 text-xs font-medium rounded-full',
                            getRoleColor(user?.role)
                          )}
                        >
                          {getRoleLabel(user?.role)}
                        </span>
                      </div>
                      {user?.role === 'admin' && (
                        <Link
                          to="/admin/stock"
                          className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          onClick={() => setDropdownOpen(false)}
                        >
                          Kelola Stok
                        </Link>
                      )}
                      <button
                        onClick={() => {
                          setDropdownOpen(false)
                          setKonfirmasiKeluar(true)
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-slate-50"
                      >
                        Keluar
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Link to="/login" className="btn-primary text-sm px-4 py-2">
                Masuk
              </Link>
            )}
          </div>
        </div>

        {/* Navigasi mobile — disembunyikan di layar lebar */}
        <div className="md:hidden pb-3 border-t border-slate-100 mt-3">
          <div className="flex flex-wrap items-center gap-1 pt-3">
            {navItems.map((item) => (
              <Link key={item.path} to={item.path} className={navLinkClass(item.path)}>
                {item.label}
              </Link>
            ))}
            {panelPeran && (
              <Link to={panelPeran.path} className={navLinkClass(panelPeran.path)}>
                {panelPeran.label}
              </Link>
            )}
          </div>
        </div>
      </nav>
      </header>

      <LogoutConfirm open={konfirmasiKeluar} onClose={() => setKonfirmasiKeluar(false)} />
    </>
  )
}
