// ─────────────────────────────────────────────────────────────
// OneDrive Upload Service
// Uses @azure/msal-browser (npm) — no CDN loading, fully bundled
// Uploads receipt images to /receipts folder in personal OneDrive
// ─────────────────────────────────────────────────────────────

import { PublicClientApplication } from '@azure/msal-browser'

const UPLOAD_FOLDER = 'receipts'
const GRAPH_BASE    = 'https://graph.microsoft.com/v1.0'
const SETTINGS_KEY  = 'resit_od_upload_settings'
const SCOPES        = ['Files.ReadWrite', 'User.Read']

// ── MSAL instance cache ───────────────────────────────────────
let _msalApp   = null
let _clientId  = null

async function getMsalApp(clientId) {
  // Re-create if clientId changed
  if (_msalApp && _clientId === clientId) return _msalApp

  _msalApp  = null
  _clientId = clientId

  const app = new PublicClientApplication({
    auth: {
      clientId,
      authority:   'https://login.microsoftonline.com/consumers',
      redirectUri: window.location.origin + window.location.pathname,
    },
    cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false }
  })

  await app.initialize()
  _msalApp = app
  return app
}

// ── Settings helpers ──────────────────────────────────────────
export function getClientId() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').clientId || '' }
  catch { return '' }
}

export function saveClientId(id) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ clientId: id.trim() }))
  _msalApp  = null  // force re-init with new ID
  _clientId = null
}

export function isUploadConfigured() {
  return !!getClientId()
}

export async function signOutOneDrive() {
  const cid = getClientId()
  if (!cid) return
  try {
    const app      = await getMsalApp(cid)
    const accounts = app.getAllAccounts()
    if (accounts.length > 0) {
      await app.logoutPopup({ account: accounts[0] })
    }
  } catch (e) {
    console.warn('Sign out error:', e)
  }
}

// ── Get access token ──────────────────────────────────────────
async function getToken() {
  const clientId = getClientId()
  if (!clientId) throw new Error('Azure Client ID not configured — open Setup OneDrive Upload in the app')

  const app      = await getMsalApp(clientId)
  const accounts = app.getAllAccounts()
  const request  = { scopes: SCOPES }

  if (accounts.length > 0) {
    try {
      const result = await app.acquireTokenSilent({ ...request, account: accounts[0] })
      return result.accessToken
    } catch {
      // Silent failed — fall through to popup
    }
  }

  // Login popup
  const result = await app.loginPopup(request)
  return result.accessToken
}

// ── Upload file to OneDrive /receipts folder ──────────────────
export async function uploadToOneDrive(file, base64Data, mimeType) {
  const token    = await getToken()
  const datePart = new Date().toISOString().slice(0, 10)
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filename = `${datePart}_${safeName}`
  const endpoint = `${GRAPH_BASE}/me/drive/root:/${UPLOAD_FOLDER}/${filename}:/content`

  // base64 → Uint8Array
  const binary = atob(base64Data)
  const bytes  = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  const response = await fetch(endpoint, {
    method:  'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  mimeType,
    },
    body: bytes
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `OneDrive upload failed (${response.status})`)
  }

  const data = await response.json()
  return { webUrl: data.webUrl, name: data.name, id: data.id }
}
