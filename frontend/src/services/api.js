import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

export const TOKEN_KEY = "komang_sac_token";

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;

    // 401 = token hilang/kedaluwarsa. Jangan reset otomatis saat halaman
    // login mengirim kredensial salah, hanya kalau memang ada token tersimpan.
    if (status === 401 && localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(TOKEN_KEY);
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }

    // Jadikan pesan backend mudah dibaca di UI
    error.friendlyMessage =
      error.response?.data?.detail ||
      (error.code === "ERR_NETWORK"
        ? "Backend tidak dapat dihubungi. Pastikan server FastAPI berjalan."
        : error.message);

    return Promise.reject(error);
  },
);

/* ------------------------------------------------------------------ */

export const authApi = {
  login: (phone, password) => api.post("/api/auth/login", { phone, password }),
  register: (data) => api.post("/api/auth/register", data),
  me: () => api.get("/api/auth/me"),
  setPassword: (password) => api.post("/api/auth/set-password", { password }),
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
  /** Cek status pakai nomor tracking (KS-XXXXXX) — endpoint publik */
  tracking: (kode) =>
    api.get(`/api/transaksi/tracking/${encodeURIComponent(kode)}`),
  create: (data) => api.post("/api/transaksi", data),
  updateStatus: (id, data) => api.put(`/api/transaksi/${id}/status`, data),
  update: (id, data) => api.put(`/api/transaksi/${id}`, data),
  /** Admin-only. Finalisasi harga untuk layanan ber-harga-rentang. */
  setHarga: (id, harga, alasan) =>
    api.put(`/api/transaksi/${id}/harga`, { harga, alasan }),
  /** Upload foto transaksi. */
  uploadPhoto: (id, jenis, file) => {
    const formData = new FormData();
    formData.append('jenis', jenis);
    formData.append('file', file);
    return api.post(`/api/transaksi/${id}/photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export const usersApi = {
  list: (params) => api.get("/api/users", { params }),
  get: (id) => api.get(`/api/users/${id}`),
  create: (data) => api.post("/api/users", data),
  createWithPassword: (data) => api.post("/api/users/with-password", data),
  update: (id, data) => api.put(`/api/users/${id}`, data),
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

export const statsApi = {
  /**
   * Statistik dashboard untuk satu periode.
   *
   * Param `periode` menentukan juga resolusi grafik: 'bulan' -> per hari,
   * 'tahun' -> per bulan, 'semua' -> per bulan. Nilanya dikirim apa adanya
   * sebagai angka (bukan string ISO) supaya batas periode dihitung backend
   * di zona WIB, sama dengan tempat bucket harian/bulanan dihitung.
   */
  admin: (params) => api.get("/api/stats/admin", { params }),
  dashboard: (params) => api.get("/api/dashboard", { params }),
};

/**
 * Ringkasan + saran (AI) beserta fakta deterministik untuk grafik.
 * Admin-only di backend.
 */
export const analyticsApi = {
  summary: (params) => api.get("/api/analytics/summary", { params }),
};

/* ------------------------------------------------------------------ */
/* PAGINASI                                                           */
/* ------------------------------------------------------------------ */
/*
 * Backend mengembalikan JSON list biasa (supaya konsumen lama tidak bongkar)
 * dan menaruh jumlah total di header X-Total-Count / X-Total-Pages.
 * expose_headers di main.py yang membuat header ini terbaca di browser.
 */

export const HALAMAN_DEFAULT = 25;
export const OPSI_PER_HALAMAN = [10, 25, 50, 100];

const KE_HEADER = {
  total: "x-total-count",
  totalHalaman: "x-total-pages",
  halaman: "x-page",
  perHalaman: "x-per-page",
};

/** Ubah string header jadi number, dengan fallback kalau header tidak ada. */
function angkaHeader(headers, kunci, fallback) {
  const mentah = headers?.[KE_HEADER[kunci]];
  const n = Number.parseInt(mentah, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Panggil endpoint daftar dan kembalikan `{ rows, total, totalHalaman, halaman }`
 * di samping respons Axios asli (yang tetap dikembalikan sebagai-is, jadi
 * `res.data` dan `res.headers` tetap bisa dipakai).
 *
 * Backend melakukan clamp halaman: kalau `halaman` di luar jangkauan, server
 * mengirim halaman terakhir yang valid. Nilai itu ikut dikembalikan lewat
 * `halaman` supaya tombol paginasi ikut lompat ikut benar -- bukan menampilkan
 * "halaman 99" yang kosong.
 */
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
