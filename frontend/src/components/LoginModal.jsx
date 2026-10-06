import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Footprints, LogIn, UserPlus, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { cn } from '../utils/helpers'

export default function LoginModal() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState(null)

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const validate = () => {
    const newErrors = {}
    if (mode === 'register' && !formData.full_name.trim()) {
      newErrors.full_name = 'Nama wajib diisi'
    }

    const digits = formData.phone.replace(/\s/g, '')
    if (!digits) newErrors.phone = 'Nomor WhatsApp wajib diisi'
    else if (!/^(\+62|62|0)8[1-9][0-9]{7,11}$/.test(digits)) {
      newErrors.phone = 'Format tidak valid (contoh: 08123456789)'
    }

    if (!formData.password) newErrors.password = 'Password wajib diisi'
    else if (formData.password.length < 6) newErrors.password = 'Minimal 6 karakter'

    if (mode === 'register' && formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Konfirmasi password tidak sama'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setApiError(null)
    if (!validate()) return

    setLoading(true)
    try {
      if (mode === 'login') {
        const user = await login(formData.phone, formData.password)
        const fallback = user?.role === 'admin' ? '/admin' : '/'
        navigate(location.state?.from || fallback, { replace: true })
      } else {
        await register({
          full_name: formData.full_name.trim(),
          phone: formData.phone,
          password: formData.password,
        })
        navigate('/', { replace: true })
      }
    } catch (err) {
      setApiError(err?.friendlyMessage || 'Gagal memproses. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (next) => {
    setMode(next)
    setErrors({})
    setApiError(null)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-primary-600 items-center justify-center mb-3">
            <Footprints className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Komang SAC</h1>
          <p className="text-sm text-slate-500">
            {mode === 'login' ? 'Masuk untuk mengelola laundrymu' : 'Buat akun pelanggan baru'}
          </p>
        </div>

        <div className="card p-6 sm:p-8">
          {/* Tab switch */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={cn(
                'py-2 rounded-lg text-sm font-medium transition-colors',
                mode === 'login' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={cn(
                'py-2 rounded-lg text-sm font-medium transition-colors',
                mode === 'register' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              Daftar
            </button>
          </div>

          {apiError && (
            <div className="flex items-start gap-2 p-3 mb-5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{apiError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {mode === 'register' && (
              <div>
                <label htmlFor="full_name" className="label">Nama Lengkap</label>
                <input
                  id="full_name"
                  name="full_name"
                  type="text"
                  value={formData.full_name}
                  onChange={handleChange}
                  className={cn('input', errors.full_name && 'input-error')}
                  placeholder="Nama lengkap"
                  autoComplete="name"
                />
                {errors.full_name && <p className="text-xs text-rose-600 mt-1">{errors.full_name}</p>}
              </div>
            )}

            <div>
              <label htmlFor="phone" className="label">Nomor WhatsApp</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                className={cn('input', errors.phone && 'input-error')}
                placeholder="08123456789"
                autoComplete="tel"
              />
              {errors.phone && <p className="text-xs text-rose-600 mt-1">{errors.phone}</p>}
            </div>

            <div>
              <label htmlFor="password" className="label">Password</label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={handleChange}
                  className={cn('input pr-11', errors.password && 'input-error')}
                  placeholder="Minimal 6 karakter"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-rose-600 mt-1">{errors.password}</p>}
            </div>

            {mode === 'register' && (
              <div>
                <label htmlFor="confirmPassword" className="label">Ulangi Password</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className={cn('input', errors.confirmPassword && 'input-error')}
                  placeholder="Ulangi password"
                  autoComplete="new-password"
                />
                {errors.confirmPassword && <p className="text-xs text-rose-600 mt-1">{errors.confirmPassword}</p>}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? (
                <span className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full" />
              ) : mode === 'login' ? (
                <>
                  <LogIn className="h-4 w-4" /> Masuk
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" /> Daftar
                </>
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-slate-500">
            {mode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?'}{' '}
            <button
              type="button"
              onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
              className="text-primary-600 font-medium hover:underline"
            >
              {mode === 'login' ? 'Daftar di sini' : 'Masuk di sini'}
            </button>
          </p>
        </div>

        <p className="text-center mt-6 text-sm">
          <Link to="/" className="text-slate-500 hover:text-primary-600">← Kembali ke beranda</Link>
        </p>
      </div>
    </div>
  )
}
