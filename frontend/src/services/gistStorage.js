// ─────────────────────────────────────────────────────────────
// GitHub Gist Storage
// Stores all receipts as a single JSON file in a private Gist.
// Free, requires only a GitHub Personal Access Token (PAT).
// ─────────────────────────────────────────────────────────────

const GIST_FILENAME  = 'resit-dashboard-data.json'
const SETTINGS_KEY   = 'resit_gist_settings'   // localStorage key for token + gist id
const LOCAL_DATA_KEY = 'resit_dashboard_data'   // existing localStorage key

// ── Settings helpers ──────────────────────────────────────────
export function getSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') } 
  catch { return {} }
}
export function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}
export function isConfigured() {
  const { token, gistId } = getSettings()
  return !!(token && gistId)
}
export function clearSettings() {
  localStorage.removeItem(SETTINGS_KEY)
}

// ── GitHub API helpers ────────────────────────────────────────
async function ghFetch(path, options = {}) {
  const { token } = getSettings()
  if (!token) throw new Error('No GitHub token configured')
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message || `GitHub API error ${res.status}`)
  }
  return res.json()
}

// ── Create a new private Gist ─────────────────────────────────
export async function createGist() {
  const data = await ghFetch('/gists', {
    method: 'POST',
    body: JSON.stringify({
      description: '🧾 Resit Dashboard — Receipt Data',
      public: false,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify({ receipts: [], updatedAt: new Date().toISOString() }, null, 2)
        }
      }
    })
  })
  return data.id
}

// ── Load receipts from Gist ───────────────────────────────────
export async function loadFromGist() {
  const { gistId } = getSettings()
  if (!gistId) throw new Error('No Gist ID configured')
  const data   = await ghFetch(`/gists/${gistId}`)
  const raw    = data.files?.[GIST_FILENAME]?.content || '{}'
  const parsed = JSON.parse(raw)
  return Array.isArray(parsed.receipts) ? parsed.receipts : []
}

// ── Save receipts to Gist ─────────────────────────────────────
export async function saveToGist(receipts) {
  const { gistId } = getSettings()
  if (!gistId) throw new Error('No Gist ID configured')
  await ghFetch(`/gists/${gistId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify({
            receipts,
            updatedAt: new Date().toISOString(),
            count: receipts.length
          }, null, 2)
        }
      }
    })
  })
}

// ── Validate token + optional gistId ─────────────────────────
export async function validateToken(token) {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
    }
  })
  if (!res.ok) throw new Error('Invalid token or insufficient permissions')
  return res.json() // returns { login, avatar_url, ... }
}

// ── List existing Resit Gists for the user ────────────────────
export async function findExistingGist(token) {
  const res = await fetch('https://api.github.com/gists?per_page=100', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
    }
  })
  if (!res.ok) return null
  const gists = await res.json()
  const found = gists.find(g => g.files?.[GIST_FILENAME])
  return found?.id || null
}

// ── Get Gist URL for viewing ──────────────────────────────────
export function getGistUrl() {
  const { gistId } = getSettings()
  return gistId ? `https://gist.github.com/${gistId}` : null
}
