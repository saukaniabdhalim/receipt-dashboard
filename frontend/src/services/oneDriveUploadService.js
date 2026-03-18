// ─────────────────────────────────────────────────────────────
// OneDrive Upload Service
// Uploads receipt images to /receipts folder in the user's OneDrive
// Uses MSAL (loaded from CDN) for Microsoft login — no backend needed
// ─────────────────────────────────────────────────────────────

const UPLOAD_FOLDER  = 'receipts'   // folder name in OneDrive root
const SETTINGS_KEY   = 'resit_od_upload_settings'
const GRAPH_BASE     = 'https://graph.microsoft.com/v1.0'

// ── Load MSAL from CDN ────────────────────────────────────────
let msalApp = null

async function getMsal() {
  if (msalApp) return msalApp

  // Load MSAL if not already loaded
  if (!window.msal) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js'
      s.onload  = resolve
      s.onerror = () => reject(new Error('Failed to load MSAL'))
      document.head.appendChild(s)
    })
  }

  const clientId = getClientId()
  if (!clientId) throw new Error('NO_CLIENT_ID')

  msalApp = new window.msal.PublicClientApplication({
    auth: {
      clientId,
      authority: 'https://login.microsoftonline.com/consumers',
      redirectUri: window.location.origin + window.location.pathname,
    },
    cache: { cacheLocation: 'localStorage' }
  })

  await msalApp.initialize()
  return msalApp
}

// ── Settings helpers ──────────────────────────────────────────
export function getClientId() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').clientId || '' }
  catch { return '' }
}
export function saveClientId(id) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ clientId: id }))
  msalApp = null // reset so next call re-initialises with new client ID
}
export function isUploadConfigured() { return !!getClientId() }

// ── Get access token (login popup if needed) ──────────────────
async function getAccessToken() {
  const app      = await getMsal()
  const accounts = app.getAllAccounts()
  const request  = { scopes: ['Files.ReadWrite', 'Files.ReadWrite.All'] }

  if (accounts.length > 0) {
    try {
      const result = await app.acquireTokenSilent({ ...request, account: accounts[0] })
      return result.accessToken
    } catch {}
  }

  // Popup login
  const result = await app.loginPopup(request)
  return result.accessToken
}

// ── Upload file to OneDrive /receipts ─────────────────────────
/**
 * @param {File}   file        - original File object
 * @param {string} base64Data  - base64 encoded content
 * @param {string} mimeType
 * @returns {object} { webUrl, name }
 */
export async function uploadToOneDrive(file, base64Data, mimeType) {
  const token    = await getAccessToken()
  const filename = `${new Date().toISOString().slice(0,10)}_${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`
  const endpoint = `${GRAPH_BASE}/me/drive/root:/${UPLOAD_FOLDER}/${filename}:/content`

  // Convert base64 → binary
  const binaryStr = atob(base64Data)
  const bytes     = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

  const response = await fetch(endpoint, {
    method: 'PUT',
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

// ── Sign out ──────────────────────────────────────────────────
export async function signOutOneDrive() {
  try {
    const app      = await getMsal()
    const accounts = app.getAllAccounts()
    if (accounts.length > 0) await app.logoutPopup({ account: accounts[0] })
  } catch {}
}
