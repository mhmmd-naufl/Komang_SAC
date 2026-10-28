# Komang SAC
**Sistem Manajemen Operasional Cuci Sepatu**

[![Live Demo](https://img.shields.io/badge/Live_Demo-komang--sac.pages.dev-000000?style=flat-square&logo=cloudflarepages)](https://komang-sac.pages.dev)

Aplikasi web *full-stack* yang dirancang untuk mendigitalisasi operasional bisnis laundry sepatu lokal. Mengelola alur kerja dari pemesanan pelanggan, progres teknisi, hingga analisis omzet dan inventaris oleh admin dalam satu platform terpusat.

---

## 🎯 Masalah & Solusi

- **Masalah:** Pencatatan manual yang rentan *human error*, tidak adanya transparansi status pengerjaan untuk pelanggan, dan kesulitan memantau omzet serta komisi teknisi secara *real-time*.
- **Solusi:** Sistem terpusat dengan pelacakan status *real-time*, kewajiban unggah foto bukti progres dari teknisi, dan dashboard analitik otomatis untuk admin.

---

## ⚙️ Fitur Berdasarkan Peran

Alur status standar: `Diterima` → `Diproses` → `Diperiksa` → `Selesai` → `Siap Diambil`

| Peran | Fungsi Utama |
| :--- | :--- |
| **Pelanggan** | Katalog harga, booking multi-pasang (`grup_id`), pelacakan status *real-time* + foto bukti, riwayat transaksi. |
| **Teknisi** | Daftar tugas harian, *update* progres, *upload* foto (wajib pada status "Selesai"), pencatatan kondisi/cacat barang. |
| **Admin** | Dashboard analitik (omzet, stok, komisi), manajemen master layanan & harga, kontrol pengeluaran, dan manajemen *user*. |
| **Mitra** | Penerimaan antrean cucian, *input* transaksi outlet, dan pemantauan performa cabang. |

---

## 🛠️ Tech Stack

Pemilihan teknologi berfokus pada efisiensi, keamanan, dan optimalisasi *free-tier* tanpa mengorbankan performa.

| Layer | Teknologi | Alasan Pemilihan |
| :--- | :--- | :--- |
| **Frontend** | React 18 · Vite · Tailwind CSS | SPA yang cepat, reaktif, dan *utility-first styling*. |
| **Backend** | Python 3.12 · FastAPI · Pydantic v2 | *Async native*, validasi tipe data yang ketat, dokumentasi API otomatis. |
| **Database** | Supabase (PostgreSQL) | Skema relasional yang *robust* dengan *Row-Level Security* (RLS) bawaan. |
| **Storage** | Supabase Storage | Penyimpanan terintegrasi untuk bukti foto cucian. |
| **Keamanan** | JWT (HS256) · PBKDF2-SHA256 | Autentikasi *stateless* yang aman dengan minimal *dependency*. |
| **CI/CD** | GitHub Actions | Otomatisasi *linting*, *build*, dan pengujian RBAC sebelum *merge*. |

---

## 🏗️ Arsitektur Sistem

<p align="center">
  <svg width="600" height="380" viewBox="0 0 600 380" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Definitions for shadows and arrows -->
    <defs>
      <filter id="shadow" x="-2" y="-2" width="104%" height="104%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.08"/>
      </filter>
      <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L9,3 z" fill="#64748b" />
      </marker>
    </defs>

    <!-- Background (Optional, ensures visibility in dark mode) -->
    <rect width="600" height="380" fill="#ffffff" rx="8"/>
    <rect width="600" height="380" fill="none" stroke="#e2e8f0" stroke-width="1" rx="8"/>

    <!-- 1. Frontend Layer -->
    <g filter="url(#shadow)">
      <rect x="150" y="30" width="300" height="60" fill="#ffffff" stroke="#3b82f6" stroke-width="2" rx="6"/>
      <text x="300" y="55" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600" fill="#0f172a" text-anchor="middle">Frontend (React 18 + Vite + Tailwind)</text>
      <text x="300" y="75" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">4 Peran Pengguna · SPA · Utility-first Styling</text>
    </g>

    <!-- Arrow 1 -->
    <line x1="300" y1="90" x2="300" y2="120" stroke="#64748b" stroke-width="1.5" marker-end="url(#arrow)"/>
    <text x="308" y="110" font-family="system-ui, -apple-system, sans-serif" font-size="10" fill="#64748b">HTTPS · JWT Bearer</text>

    <!-- 2. Backend Layer -->
    <g filter="url(#shadow)">
      <rect x="150" y="130" width="300" height="70" fill="#ffffff" stroke="#0f172a" stroke-width="2" rx="6"/>
      <text x="300" y="155" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600" fill="#0f172a" text-anchor="middle">Backend (FastAPI · Python 3.12)</text>
      <text x="300" y="175" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">Strict RBAC · Pydantic v2 Validation · Slowapi Rate Limiting</text>
    </g>

    <!-- Arrow 2 (Split Left) -->
    <path d="M300 200 L300 220 L180 220 L180 240" fill="none" stroke="#64748b" stroke-width="1.5" marker-end="url(#arrow)"/>
    
    <!-- Arrow 2 (Split Right) -->
    <path d="M300 200 L300 220 L420 220 L420 240" fill="none" stroke="#64748b" stroke-width="1.5" marker-end="url(#arrow)"/>

    <!-- 3. Database Layer (Left) -->
    <g filter="url(#shadow)">
      <rect x="60" y="250" width="220" height="70" fill="#ffffff" stroke="#10b981" stroke-width="2" rx="6"/>
      <text x="170" y="275" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600" fill="#0f172a" text-anchor="middle">Supabase PostgreSQL</text>
      <text x="170" y="295" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">Relational Data · Row-Level Security (RLS)</text>
      <text x="170" y="310" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">Active on `expenses` & sensitive tables</text>
    </g>

    <!-- 4. Storage & Analytics Layer (Right) -->
    <g filter="url(#shadow)">
      <rect x="320" y="250" width="220" height="70" fill="#ffffff" stroke="#8b5cf6" stroke-width="2" rx="6"/>
      <text x="430" y="275" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600" fill="#0f172a" text-anchor="middle">Storage & Analytics</text>
      <text x="430" y="295" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">Supabase Storage (Shoe Photos)</text>
      <text x="430" y="310" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">Deterministic Rules + AI Fallback</text>
    </g>

    <!-- Security Note at Bottom -->
    <rect x="40" y="340" width="520" height="30" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1" rx="4"/>
    <text x="300" y="360" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-style="italic" fill="#475569" text-anchor="middle">Catatan: Frontend tidak mengakses DB langsung. Validasi bisnis & sekuritas ditegakkan terpusat di backend.</text>
  </svg>
</p>

## 🚀 Local Development

### Prasyarat
- Python 3.12+
- Node.js 18+
- Akun Supabase

### 1. Clone Repository
```bash
git clone https://github.com/mhmmd-naufl/Komang_SAC.git
cd Komang_SAC
```

### 2. Setup Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Untuk Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### 3. Setup Frontend
```bash
cd ../frontend
npm install
npm run dev
```

---

## 📸 Preview

![Dashboard Admin Preview](https://raw.githubusercontent.com/mhmmd-naufl/Komang_SAC/main/docs/dashboard-preview.png)
