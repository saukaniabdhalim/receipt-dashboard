// ─────────────────────────────────────────────────────────────
// GitHub Gist Storage — via Cloudflare Worker
// Token and Gist ID are stored as Worker secrets — never in browser
// ─────────────────────────────────────────────────────────────

const WORKER_URL = 'https://spring-art-d63a.saukanihalim.workers.dev'

export async function loadFromGist(token) {
  const headers = {
    'Content-Type': 'application/json',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${WORKER_URL}/gist/load`, {
    method: 'POST',
    headers
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Load failed (${res.status})`)
  }
  const data = await res.json()
  return data.receipts || []
}

export async function saveToGist(receipts, token) {
  const headers = {
    'Content-Type': 'application/json',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${WORKER_URL}/gist/save`, {
    method:  'POST',
    headers,
    body:    JSON.stringify({ receipts })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Save failed (${res.status})`)
  }
  return res.json()
}

export async function getWorkerConfig() {
  const res = await fetch(`${WORKER_URL}/config`)
  if (!res.ok) return {}
  return res.json()
}

// Kept for backward compat — always returns true when worker is set up
export function isConfigured()   { return true }
export function getSettings()    { return {} }
export function saveSettings()   {}
export function clearSettings()  {}
export function getGistUrl()     { return null }
