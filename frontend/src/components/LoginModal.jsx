import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import {
  Footprints,
  LogIn,
  UserPlus,
  Eye,
  EyeOff,
  AlertCircle,
  Check,
  Clock,
  Search,
  Info,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { cn } from '../utils/helpers'

/* ---------------------------------------------------------------- */
/* Akun demo — hanya ditampilkan di mode development (npm run dev).  */
/* Di build produksi blok ini dihilang total oleh Vite.             */
/* ---------------------------------------------------------------- */
const AKUN_DEMO = [
  { role: 'Admin', phone: '628980570911', color: 'text-primary-700 bg-primary-50' },
  { role: 'Teknisi', phone: '628991000001', color: 'text-cyan-700 bg-cyan-50' },
  { role: 'Konsumen', phone: '628981000001', color: 'text-slate-700 bg-slate-100' },
  { role: 'Drop Point', phone: '628991000004', color: 'text-slate-700 bg-slate-100' },
]
const PASSWORD_DEMO = 'password123'

const MANFAAT = [
  { icon: Search, text: 'Cek status cucian kapan saja lewat kode booking' },
  { icon: Clock, text: 'Notifikasi tiap tahap: Diterima sampai Siap diambil' },
  { icon: Check, text: 'Catatan kerusakan dicatat teknisi sebelum dicuci' },
]

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

  const isiOtomatis = (phone) => {
    setFormData((prev) => ({ ...prev, phone, password: PASSWORD_DEMO }))
    setErrors({})
    setApiError(null)
  }

  /* ---------------------------------------------------------------- */
  /* Potongan yang dipakai kedua tampilan                              */
  /* ---------------------------------------------------------------- */

  const tabSwitcher = (
    <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl">
      <button
        type="button"
        onClick={() => switchMode('login')}
        className={cn(
          'py-2 rounded-lg text-sm font-medium transition-colors',
          mode === 'login'
            ? 'bg-white text-primary-700 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        )}
      >
        Masuk
      </button>
      <button
        type="button"
        onClick={() => switchMode('register')}
        className={cn(
          'py-2 rounded-lg text-sm font-medium transition-colors',
          mode === 'register'
            ? 'bg-white text-primary-700 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        )}
      >
        Daftar
      </button>
    </div>
  )

  const notifError = apiError && (
    <div className="flex items-start gap-2 p-3 mb-5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
      <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <span>{apiError}</span>
    </div>
  )

  const fieldNama = (
    <div>
      <label htmlFor="full_name" className="label">
        Nama Lengkap
      </label>
      <input
        id="full_name"
        name="full_name"
        type="text"
        value={formData.full_name}
        onChange={handleChange}
        className={cn('input', errors.full_name && 'input-error')}
        placeholder="Contoh: Budi Santoso"
        autoComplete="name"
      />
      {errors.full_name && <p className="text-xs text-rose-600 mt-1">{errors.full_name}</p>}
    </div>
  )

  const fieldHp = (
    <div>
      <label htmlFor="phone" className="label">
        Nomor WhatsApp
      </label>
      <input
        id="phone"
        name="phone"
        type="tel"
        inputMode="tel"
        value={formData.phone}
        onChange={handleChange}
        className={cn('input', errors.phone && 'input-error')}
        placeholder="08123456789"
        autoComplete="tel"
      />
      {errors.phone && <p className="text-xs text-rose-600 mt-1">{errors.phone}</p>}
    </div>
  )

  const fieldPassword = (
    <div>
      <label htmlFor="password" className="label">
        Password
      </label>
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
  )

  const fieldUlangi = (
    <div>
      <label htmlFor="confirmPassword" className="label">
        Ulangi Password
      </label>
      <input
        id="confirmPassword"
        name="confirmPassword"
        type={showPassword ? 'text' : 'password'}
        value={formData.confirmPassword}
        onChange={handleChange}
        className={cn('input', errors.confirmPassword && 'input-error')}
        placeholder="Ulangi password di atas"
        autoComplete="new-password"
      />
      {errors.confirmPassword && (
        <p className="text-xs text-rose-600 mt-1">{errors.confirmPassword}</p>
      )}
    </div>
  )

  const tombolSubmit = (
    <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2">
      {loading ? (
        <span className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full" />
      ) : mode === 'login' ? (
        <>
          <LogIn className="h-4 w-4" /> Masuk
        </>
      ) : (
        <>
          <UserPlus className="h-4 w-4" /> Buat Akun
        </>
      )}
    </button>
  )

  const linkMode = (
    <p className="mt-5 text-center text-xs text-slate-500">
      {mode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?'}{' '}
      <button
        type="button"
        onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
        className="text-primary-600 font-semibold hover:underline"
      >
        {mode === 'login' ? 'Daftar di sini' : 'Masuk di sini'}
      </button>
    </p>
  )

  const linkBeranda = (
    <p className="text-center mt-6 text-sm">
      <Link to="/" className="text-slate-500 hover:text-primary-600">
        ← Kembali ke beranda
      </Link>
    </p>
  )

  /* ---------------------------------------------------------------- */
  /* Tampilan 1 — MASUK: satu kartu, tenang, fokus                    */
  /* ---------------------------------------------------------------- */

  if (mode === 'login') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="inline-flex h-12 w-12 rounded-2xl bg-primary-600 items-center justify-center mb-3">
              <Footprints className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Masuk</h1>
            <p className="text-sm text-slate-500 mt-1">
              Selamat datang kembali di <span className="font-medium text-slate-700">Komang SAC</span>
            </p>
          </div>

          <div className="card p-6 sm:p-8">
            <div className="mb-6">{tabSwitcher}</div>
            {notifError}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {fieldHp}
              {fieldPassword}
              {tombolSubmit}
            </form>

            {linkMode}
          </div>

          {/*Akun demo: hanya di mode development */}
          {import.meta.env.DEV && (
            <div className="mt-5 rounded-xl border border-dashed border-primary-200 bg-primary-50/50 p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-primary-800 mb-3">
                <Info className="h-3.5 w-3.5" />
                Akun demo — klik untuk isi otomatis
              </p>
              <div className="grid grid-cols-2 gap-2">
                {AKUN_DEMO.map((a) => (
                  <button
                    key={a.phone}
                    type="button"
                    onClick={() => isiOtomatis(a.phone)}
                    className="text-left px-2.5 py-2 rounded-lg bg-white border border-primary-100 hover:border-primary-400 transition-colors"
                  >
                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', a.color)}>
                      {a.role}
                    </span>
                    <p className="text-[11px] text-slate-600 mt-1 font-mono">{a.phone}</p>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-2.5">
                Password semua akun demo:{' '}
                <code className="font-mono font-semibold text-slate-700">{PASSWORD_DEMO}</code>
              </p>
            </div>
          )}

          {linkBeranda}
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------------- */
  /* Tampilan 2 — DAFTAR: dua kolom, panel kiri biru berisi alasan    */
  /* ---------------------------------------------------------------- */

  return (
    // flex-col WAJIB di sini.
    // Tanpa itu, "Kembali ke beranda" menjadi saudara mendatar dari kartu dan
    // ikut terjepit oleh justify-center -- ruangnya habis, link terpotong jadi
    // setengah atau hilang total.
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-5 p-4">
      <div className="w-full max-w-4xl grid md:grid-cols-5 rounded-2xl overflow-hidden shadow-lg border border-slate-200">
        {/* Panel kiri — alasan daftar */}
        <div className="md:col-span-2 bg-primary-700 text-white p-8 flex flex-col">
          <div className="flex items-center gap-2 mb-8">
            <div className="h-9 w-9 rounded-xl bg-white/15 flex items-center justify-center">
              <Footprints className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg">Komang SAC</span>
          </div>

          <h2 className="text-2xl font-bold leading-tight">
            Daftar sekali,
            <br />
            pantau selalu.
          </h2>
          <p className="text-primary-100 text-sm mt-3">
            Cukup 1 menit. Setelah itu kamu bisa cek progres cucian secara real-time dari HP.
          </p>

          <ul className="mt-8 space-y-4">
            {MANFAAT.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 h-5 w-5 flex-shrink-0 rounded-full bg-white/15 flex items-center justify-center">
                  <Icon className="h-3 w-3" />
                </span>
                <span className="text-primary-50">{text}</span>
              </li>
            ))}
          </ul>

          <div className="mt-auto pt-8">
            <p className="text-xs text-primary-200">
              Gratis. Tidak ada biaya pendaftaran.
            </p>
          </div>
        </div>

        {/* Panel kanan — formulir */}
        <div className="md:col-span-3 bg-white p-8">
          <div className="mb-6">{tabSwitcher}</div>

          <h3 className="text-xl font-bold text-slate-900">Data kamu</h3>
          <p className="text-sm text-slate-500 mb-5">
            Gunakan nomor WhatsApp yang aktif — dipakai untuk pemberitahuan.
          </p>

          {notifError}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {fieldNama}
            {fieldHp}
            {fieldPassword}
            {fieldUlangi}
            {tombolSubmit}
          </form>

          {linkMode}
        </div>
      </div>

      {linkBeranda}
    </div>
  )
}