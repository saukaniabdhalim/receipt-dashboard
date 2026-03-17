// ============================================================
// Local Receipt Storage Service
// Uses localStorage as fallback when OneDrive is not connected.
// Receipts are stored as JSON with base64 image previews.
// ============================================================

const STORAGE_KEY = 'resit_dashboard_receipts'
const CATEGORIES_KEY = 'resit_dashboard_categories'

export const DEFAULT_CATEGORIES = [
  { id: 'food', label: 'Makanan & Minuman', color: '#f59e0b', icon: '🍜' },
  { id: 'transport', label: 'Pengangkutan', color: '#3b82f6', icon: '🚗' },
  { id: 'utilities', label: 'Bil & Utiliti', color: '#8b5cf6', icon: '💡' },
  { id: 'shopping', label: 'Membeli-belah', color: '#ec4899', icon: '🛍️' },
  { id: 'medical', label: 'Kesihatan', color: '#10b981', icon: '🏥' },
  { id: 'entertainment', label: 'Hiburan', color: '#f97316', icon: '🎬' },
  { id: 'education', label: 'Pendidikan', color: '#06b6d4', icon: '📚' },
  { id: 'other', label: 'Lain-lain', color: '#6b7280', icon: '📁' },
]

export function getCategories() {
  const stored = localStorage.getItem(CATEGORIES_KEY)
  return stored ? JSON.parse(stored) : DEFAULT_CATEGORIES
}

export function saveCategories(cats) {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(cats))
}

export function getReceipts() {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored ? JSON.parse(stored) : []
}

export function saveReceipts(receipts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(receipts))
}

export function addReceipt(receipt) {
  const receipts = getReceipts()
  const newReceipt = {
    id: `local_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    source: 'local',
    createdAt: new Date().toISOString(),
    ...receipt,
  }
  receipts.unshift(newReceipt)
  saveReceipts(receipts)
  return newReceipt
}

export function updateReceipt(id, updates) {
  const receipts = getReceipts()
  const idx = receipts.findIndex((r) => r.id === id)
  if (idx === -1) return null
  receipts[idx] = { ...receipts[idx], ...updates, updatedAt: new Date().toISOString() }
  saveReceipts(receipts)
  return receipts[idx]
}

export function deleteReceipt(id) {
  const receipts = getReceipts().filter((r) => r.id !== id)
  saveReceipts(receipts)
}

/**
 * Generate summary stats from receipts array
 */
export function computeStats(receipts) {
  const now = new Date()
  const thisMonth = now.getMonth()
  const thisYear = now.getFullYear()

  const monthlyReceipts = receipts.filter((r) => {
    const d = new Date(r.date || r.createdAt)
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear
  })

  const total = receipts.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const monthTotal = monthlyReceipts.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)

  // By category
  const byCategory = {}
  receipts.forEach((r) => {
    const cat = r.category || 'other'
    byCategory[cat] = (byCategory[cat] || 0) + (parseFloat(r.amount) || 0)
  })

  // Monthly trend (last 6 months)
  const trend = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(thisYear, thisMonth - i, 1)
    const month = d.toLocaleString('default', { month: 'short' })
    const year = d.getFullYear()
    const m = d.getMonth()
    const y = d.getFullYear()
    const amount = receipts
      .filter((r) => {
        const rd = new Date(r.date || r.createdAt)
        return rd.getMonth() === m && rd.getFullYear() === y
      })
      .reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
    trend.push({ month: `${month} ${year}`, amount: parseFloat(amount.toFixed(2)) })
  }

  return { total, monthTotal, byCategory, trend, count: receipts.length, monthCount: monthlyReceipts.length }
}

/**
 * Format MYR currency
 */
export function formatMYR(amount) {
  return new Intl.NumberFormat('ms-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 2,
  }).format(amount || 0)
}

/**
 * Read file as base64 for preview
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
