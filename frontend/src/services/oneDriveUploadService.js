// ─────────────────────────────────────────────────────────────
// OneDrive Upload Service
// Uses @azure/msal-browser (npm) — bundled, no CDN
// Fix: handleRedirectPromise on init to prevent timed_out error
// ─────────────────────────────────────────────────────────────

import { PublicClientApplication, BrowserAuthError } from '@azure/msal-browser'

const UPLOAD_FOLDER = 'receipts'
const GRAPH_BASE    = 'https://graph.microsoft.com/v1.0'
const SETTINGS_KEY  = 'resit_od_upload_settings'
const SCOPES        = ['Files.ReadWrite', 'User.Read']

// ── MSAL instance ─────────────────────────────────────────────
let _msalApp    = null
let _clientId   = null
let _initDone   = false

async function getMsalApp(clientId) {
  if (_msalApp && _clientId === clientId && _initDone) return _msalApp

  _msalApp  = null
  _initDone = false
  _clientId = clientId

  const app = new PublicClientApplication({
    auth: {
      clientId,
      authority:   'https://login.microsoftonline.com/consumers',
      redirectUri: window.location.origin + window.location.pathname,
      postLogoutRedirectUri: window.location.origin + window.location.pathname,
      navigateToLoginRequestUrl: false,
    },
    cache: {
      cacheLocation:       'localStorage',
      storeAuthStateInCookie: true,   // needed for some browsers
    },
    system: {
      allowNativeBroker:         false,
      windowHashTimeout:         60000,
      iframeHashTimeout:         6000,
      loadFrameTimeout:          0,
      asyncPopups:               false,
    }
  })

  await app.initialize()

  // ← Critical: must call this on every page load to handle
  //   the redirect back from Microsoft login popup
  try {
    await app.handleRedirectPromise()
  } catch (e) {
    console.warn('[MSAL] handleRedirectPromise error (non-fatal):', e.message)
  }

  _msalApp  = app
  _initDone = true
  return app
}

// ── Settings helpers ──────────────────────────────────────────
export function getClientId() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').clientId || '' }
  catch { return '' }
}

export function saveClientId(id) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ clientId: id.trim() }))
  _msalApp  = null
  _clientId = null
  _initDone = false
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
    console.warn('[MSAL] Sign out:', e.message)
  }
}

// ── Get access token ──────────────────────────────────────────
async function getToken() {
  const clientId = getClientId()
  if (!clientId) throw new Error('Azure Client ID not configured — open Setup OneDrive Upload')

  const app     = await getMsalApp(clientId)
  const request = {
    scopes: SCOPES,
    prompt: 'select_account',
  }
  const accounts = app.getAllAccounts()

  // Try silent first
  if (accounts.length > 0) {
    try {
      const result = await app.acquireTokenSilent({
        scopes:  SCOPES,
        account: accounts[0],
      })
      return result.accessToken
    } catch (silentErr) {
      console.warn('[MSAL] Silent token failed, trying popup:', silentErr.message)
    }
  }

  // Popup login — with retry on timed_out
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await app.loginPopup({ scopes: SCOPES })
      return result.accessToken
    } catch (popupErr) {
      const msg = popupErr.message || ''
      if (msg.includes('timed_out') && attempt === 1) {
        console.warn('[MSAL] Popup timed out, retrying…')
        // Clear any stale state and retry once
        await app.handleRedirectPromise().catch(() => {})
        continue
      }
      if (msg.includes('user_cancelled') || msg.includes('popup_window_error')) {
        throw new Error('Login cancelled — please try again')
      }
      throw new Error(`Microsoft login failed: ${msg}`)
    }
  }

  throw new Error('Microsoft login timed out — please disable popup blocker and try again')
}

// ── Upload to OneDrive ────────────────────────────────────────
export async function uploadToOneDrive(file, base64Data, mimeType) {
  const token    = await getToken()
  const datePart = new Date().toISOString().slice(0, 10)
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filename = `${datePart}_${safeName}`
  const endpoint = `${GRAPH_BASE}/me/drive/root:/${UPLOAD_FOLDER}/${filename}:/content`

  // base64 → binary
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
    throw new Error(err?.error?.message || `Upload failed (${response.status})`)
  }

  const data = await response.json()
  return { webUrl: data.webUrl, name: data.name, id: data.id }
}
