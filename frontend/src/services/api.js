import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

export const TOKEN_KEY = 'komang_sac_token'

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status

    // 401 = token hilang/kedaluwarsa. Jangan reset otomatis saat halaman
    // login mengirim kredensial salah, hanya kalau memang ada token tersimpan.
    if (status === 401 && localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(TOKEN_KEY)
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }

    // Jadikan pesan backend mudah dibaca di UI
    error.friendlyMessage =
      error.response?.data?.detail ||
      (error.code === 'ERR_NETWORK'
        ? 'Backend tidak dapat dihubungi. Pastikan server FastAPI berjalan.'
        : error.message)

    return Promise.reject(error)
  },
)

/* ------------------------------------------------------------------ */

export const authApi = {
  login: (phone, password) => api.post('/api/auth/login', { phone, password }),
  register: (data) => api.post('/api/auth/register', data),
  me: () => api.get('/api/auth/me'),
  setPassword: (password) => api.post('/api/auth/set-password', { password }),
}

export const shoesApi = {
  list: (params) => api.get('/api/sepatu', { params }),
  get: (id) => api.get(`/api/sepatu/${id}`),
  create: (data) => api.post('/api/sepatu', data),
  update: (id, data) => api.put(`/api/sepatu/${id}`, data),
  remove: (id) => api.delete(`/api/sepatu/${id}`),
}

export const transactionsApi = {
  list: (params) => api.get('/api/transaksi', { params }),
  get: (id) => api.get(`/api/transaksi/${id}`),
  /** Cek status pakai nomor tracking (KS-XXXXXX) — endpoint publik */
  tracking: (kode) => api.get(`/api/transaksi/tracking/${encodeURIComponent(kode)}`),
  create: (data) => api.post('/api/transaksi', data),
  updateStatus: (id, data) => api.put(`/api/transaksi/${id}/status`, data),
}

export const usersApi = {
  list: (params) => api.get('/api/users', { params }),
  get: (id) => api.get(`/api/users/${id}`),
  create: (data) => api.post('/api/users', data),
  createWithPassword: (data) => api.post('/api/users/with-password', data),
  update: (id, data) => api.put(`/api/users/${id}`, data),
}

export const dropPointsApi = {
  list: (params) => api.get('/api/drop-points', { params }),
  get: (id) => api.get(`/api/drop-points/${id}`),
  create: (data) => api.post('/api/drop-points', data),
  update: (id, data) => api.put(`/api/drop-points/${id}`, data),
}

export const stockApi = {
  list: (params) => api.get('/api/stock', { params }),
  get: (id) => api.get(`/api/stock/${id}`),
  create: (data) => api.post('/api/stock', data),
  update: (id, data) => api.put(`/api/stock/${id}`, data),
  reduce: (id, jumlah) => api.post(`/api/stock/${id}/kurangi`, null, { params: { jumlah } }),
}

export const statsApi = {
  admin: () => api.get('/api/stats/admin'),
}
