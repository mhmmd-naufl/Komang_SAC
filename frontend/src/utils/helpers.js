export function formatRupiah(amount) {
  if (amount === null || amount === undefined) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
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