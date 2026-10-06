import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LogOut, Footprints } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { cn, getRoleLabel, getRoleColor } from '../utils/helpers'

export default function Navbar() {
  const { user, logout, isAuthenticated, isAdmin } = useAuth()
  const location = useLocation()
  const [dropdownOpen, setDropdownOpen] = useState(false)

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
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200">
      <nav className="container-main" aria-label="Navigasi utama">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2" aria-label="Komang SAC beranda">
            <div className="h-8 w-8 rounded-xl bg-primary-600 flex items-center justify-center shrink-0">
              <Footprints className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-xl text-slate-900">Komang SAC</span>
          </Link>

          {/* Navigasi desktop */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link key={item.path} to={item.path} className={navLinkClass(item.path)}>
                {item.label}
              </Link>
            ))}
            {isAdmin && (
              <Link to="/admin" className={navLinkClass('/admin')}>
                Panel Admin
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
                      {isAdmin && (
                        <Link
                          to="/admin/stock"
                          className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          onClick={() => setDropdownOpen(false)}
                        >
                          Kelola Stok
                        </Link>
                      )}
                      <button
                        onClick={logout}
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
            {isAdmin && (
              <Link to="/admin" className={navLinkClass('/admin')}>
                Panel Admin
              </Link>
            )}
          </div>
        </div>
      </nav>
    </header>
  )
}
