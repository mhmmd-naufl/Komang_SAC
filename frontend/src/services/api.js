import axios from "axios";
import { compressImage } from '../utils/compressImage';  
// Port backend Komang SAC = 8001 (port 8000 dipakai aplikasi lain).
// Kosongkan VITE_API_BASE_URL kalau mau memakai proxy Vite (/api -> :8001).
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8001";

export const TOKEN_KEY = "komang_sac_token";

/** Ambil token valid dari localStorage, atau null kalau tidak ada / rusak. */
function ambilToken() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token || token === "null" || token === "undefined") return null;
  return token;
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

// Interceptor Request: tempel token ke SETIAP request.
// Token "null"/"undefined" (string) dianggap tidak ada, header tidak dikirim.
api.interceptors.request.use((config) => {
  const token = ambilToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor Response: handle error
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    if (status === 401 && localStorage.getItem(TOKEN_KEY)) {
      console.warn("⚠️ Token expired/tidak valid, logout...");
      localStorage.removeItem(TOKEN_KEY);
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    error.friendlyMessage =
      error.response?.data?.detail ||
      (error.code === "ERR_NETWORK"
        ? "Backend tidak dapat dihubungi. Pastikan server FastAPI berjalan."
        : error.message);
    return Promise.reject(error);
  },
);

// API Modules
export const configApi = {
  get: () => api.get("/api/config"),
};

export const authApi = {
  login: (phone, password) => api.post("/api/auth/login", { phone, password }),
  register: (data) => api.post("/api/auth/register", data),
  me: () => api.get("/api/auth/me"),
  setPassword: (password) => api.post("/api/auth/set-password", { password }),
  changePassword: (passwordLama, passwordBaru) =>
  api.post("/api/auth/change-password", {
    password_lama: passwordLama,
    password_baru: passwordBaru,
  }),
};

export const shoesApi = {
  list: (params) => api.get("/api/sepatu", { params }),
  get: (id) => api.get(`/api/sepatu/${id}`),
  create: (data) => api.post("/api/sepatu", data),
  update: (id, data) => api.put(`/api/sepatu/${id}`, data),
  remove: (id) => api.delete(`/api/sepatu/${id}`),
};

export const transactionsApi = {
  list: (params) => api.get("/api/transaksi", { params }),
  get: (id) => api.get(`/api/transaksi/${id}`),
  available: () => api.get("/api/transaksi/tersedia"),
  claim: (id) => api.post(`/api/transaksi/${id}/claim`),
  tracking: (kode) =>
    api.get(`/api/transaksi/tracking/${encodeURIComponent(kode)}`),
  grup: (grupId) =>
    api.get(`/api/transaksi/grup/${encodeURIComponent(grupId)}`),
  create: (data) => api.post("/api/transaksi", data),

  // Update status transaksi
  updateStatus: (id, data) => api.put(`/api/transaksi/${id}/status`, data),

  // Update field lain (ganti teknisi, layanan, catatan)
  update: (id, data) => api.put(`/api/transaksi/${id}`, data),

  // Finalisasi harga (admin)
  setHarga: (id, harga, alasan) =>
    api.put(`/api/transaksi/${id}/harga`, { harga, alasan }),

  // Upload foto. Header multipart wajib: default instance adalah JSON, dan
  // axios 1.x akan mengubah FormData jadi JSON kalau header itu terpasang.
  uploadPhoto: async (id, jenis, file) => {
    const compressed = await compressImage(file);
    const formData = new FormData();
    formData.append("file", compressed, "foto.jpg");
    formData.append("jenis", jenis);
    return api.post(`/api/transaksi/${id}/photo`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

export const usersApi = {
  list: (params) => api.get("/api/users", { params }),
  get: (id) => api.get(`/api/users/${id}`),
  create: (data) => api.post("/api/users", data),
  createWithPassword: (data) => api.post("/api/users/with-password", data),
  update: (id, data) => api.put(`/api/users/${id}`, data),
  resetPassword: (id, password) =>
    api.post(`/api/users/${id}/reset-password`, { password }),
  hapus: (id) => api.delete(`/api/users/${id}`),
};

export const dropPointsApi = {
  list: (params) => api.get("/api/drop-points", { params }),
  get: (id) => api.get(`/api/drop-points/${id}`),
  create: (data) => api.post("/api/drop-points", data),
  update: (id, data) => api.put(`/api/drop-points/${id}`, data),
};

export const stockApi = {
  list: (params) => api.get("/api/stock", { params }),
  get: (id) => api.get(`/api/stock/${id}`),
  create: (data) => api.post("/api/stock", data),
  update: (id, data) => api.put(`/api/stock/${id}`, data),
  reduce: (id, jumlah) =>
    api.post(`/api/stock/${id}/kurangi`, null, { params: { jumlah } }),
};

export const expensesApi = {
  list: (params) => api.get("/api/expenses", { params }),
  rekapMingguan: () => api.get("/api/expenses/rekap-mingguan"),
  create: (data) => api.post("/api/expenses", data),
  update: (id, data) => api.put(`/api/expenses/${id}`, data),
  remove: (id) => api.delete(`/api/expenses/${id}`),
};

export const statsApi = {
  admin: (params) => api.get("/api/stats/admin", { params }),
  dashboard: (params) => api.get("/api/dashboard", { params }),
};

export const analyticsApi = {
  summary: (params, config) =>
    api.get("/api/analytics/summary", { params, ...config }),
};

// Pagination helpers
export const HALAMAN_DEFAULT = 25;
export const OPSI_PER_HALAMAN = [10, 25, 50, 100];

const KE_HEADER = {
  total: "x-total-count",
  totalHalaman: "x-total-pages",
  halaman: "x-page",
  perHalaman: "x-per-page",
};

function angkaHeader(headers, kunci, fallback) {
  const mentah = headers?.[KE_HEADER[kunci]];
  const n = Number.parseInt(mentah, 10);
  return Number.isFinite(n) ? n : fallback;
}

export async function ambilBerpaginan(
  path,
  { halaman = 1, perHalaman = HALAMAN_DEFAULT, ...params } = {},
) {
  const res = await api.get(path, {
    params: { ...params, page: halaman, per_page: perHalaman },
  });
  const rows = Array.isArray(res.data) ? res.data : [];
  const perHalamanEfektif = angkaHeader(res.headers, "perHalaman", perHalaman);
  return Object.assign(res, {
    rows,
    total: angkaHeader(res.headers, "total", rows.length),
    totalHalaman: angkaHeader(
      res.headers,
      "totalHalaman",
      Math.max(1, Math.ceil(rows.length / perHalamanEfektif)),
    ),
    halaman: angkaHeader(res.headers, "halaman", halaman),
    perHalaman: perHalamanEfektif,
  });
}