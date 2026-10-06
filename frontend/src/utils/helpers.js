export function formatRupiah(amount) {
  if (amount === null || amount === undefined) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Format harga dengan rentang.
 *
 * Layanan seperti Repaint punya harga 80.000 - 150.000. Menampilkan dua angka
 * tanpa penjelasan bikin pelanggan mengira ada dua layanan berbeda, jadi
 * rentang selalu diberi label "mulai dari" supaya jelas harga akhirnya
 * ditentukan setelah shoes dicek di outlet.
 *
 * Kalau min == max (atau max tidak diisi), hasilnya sama persis dengan
 * formatRupiah supaya tampilan tidak bolong-bolong berbeda antara layanan
 * ber-harga-tunggal dan ber-rentang.
 */
export function formatRentang(min, max) {
  const bawah = Number(min)
  const atas = Number(max)
  if (!Number.isFinite(bawah)) return formatRupiah(0)
  if (!Number.isFinite(atas) || atas === bawah) return formatRupiah(bawah)
  return `${formatRupiah(bawah)} - ${formatRupiah(atas)}`
}

/** True kalau layanan punya rentang harga (bukan harga tunggal). */
export function adaRentang(min, max) {
  const bawah = Number(min)
  const atas = Number(max)
  return Number.isFinite(bawah) && Number.isFinite(atas) && atas > bawah
}

/**
 * Harga yang ditampilkan untuk satu layanan.
 *
 * Dipakai bersama oleh katalog dan modal booking supaya keduanya tidak pernah
 * menampilkan angka berbeda untuk baris yang sama.
 */
export function hargaLayanan(layanan) {
  if (!layanan) return { teks: formatRupiah(0), rentang: false, jumlah: 0 }
  const min = layanan.harga_min ?? layanan.harga_cuci
  const maks = layanan.harga_max
  const rentang = adaRentang(min, maks)
  return {
    teks: rentang ? formatRentang(min, maks) : formatRupiah(min),
    rentang,
    jumlah: Number(min) || 0,
  }
}

export function formatDate(dateString) {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(dateString) {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getStatusConfig(status) {
  const configs = {
    'Diterima': { 
      label: 'Diterima', 
      className: 'badge-received', 
      dotClass: 'dot-received',
      color: 'blue',
      step: 0 
    },
    'Diproses': { 
      label: 'Diproses', 
      className: 'badge-processing', 
      dotClass: 'dot-processing',
      color: 'amber',
      step: 1 
    },
    'Diperiksa': { 
      label: 'Diperiksa', 
      className: 'badge-inspected', 
      dotClass: 'dot-inspected',
      color: 'violet',
      step: 2 
    },
    'Selesai': { 
      label: 'Selesai', 
      className: 'badge-completed', 
      dotClass: 'dot-completed',
      color: 'emerald',
      step: 3 
    },
    'Siap diambil': { 
      label: 'Siap Diambil', 
      className: 'badge-ready', 
      dotClass: 'dot-ready',
      color: 'cyan',
      step: 4 
    },
    'Overdue': { 
      label: 'Overdue', 
      className: 'badge-overdue', 
      dotClass: 'dot-rose',
      color: 'rose',
      step: -1 
    },
    'Canceled': { 
      label: 'Dibatalkan', 
      className: 'badge-canceled', 
      dotClass: 'dot-slate',
      color: 'slate',
      step: -1 
    },
  }
  return configs[status] || { 
    label: status, 
    className: 'badge-canceled', 
    dotClass: 'dot-slate',
    color: 'slate',
    step: -1 
  }
}

export function getRoleLabel(role) {
  const labels = {
    admin: 'Admin',
    customer: 'Pelanggan',
    technician: 'Teknisi',
    drop_point: 'Drop Point',
  }
  return labels[role] || role
}

export function getRoleColor(role) {
  const colors = {
    admin: 'bg-purple-100 text-purple-800',
    customer: 'bg-blue-100 text-blue-800',
    technician: 'bg-emerald-100 text-emerald-800',
    drop_point: 'bg-amber-100 text-amber-800',
  }
  return colors[role] || 'bg-slate-100 text-slate-800'
}

export function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}

export function truncate(str, length = 50) {
  if (!str) return ''
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}

export function generateId() {
  return Math.random().toString(36).substring(2, 15)
}