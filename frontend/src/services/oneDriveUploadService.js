// ─────────────────────────────────────────────────────────────
// OneDrive Upload Service
// Fix: clears stale MSAL state to prevent interaction_in_progress
// ─────────────────────────────────────────────────────────────

import { PublicClientApplication } from '@azure/msal-browser'

const UPLOAD_FOLDER = 'receipts'
const GRAPH_BASE    = 'https://graph.microsoft.com/v1.0'
const SETTINGS_KEY  = 'resit_od_upload_settings'
const SCOPES        = ['Files.ReadWrite', 'User.Read']

let _msalApp  = null
let _clientId = null
let _initDone = false

// ── Clear stale MSAL localStorage keys ───────────────────────
function clearStaleMsalState() {
  try {
    const keys = Object.keys(localStorage).filter(k =>
      k.startsWith('msal.') ||
      k.startsWith('msal|') ||
      k.includes('interaction.status') ||
      k.includes('request.correlationId') ||
      k.includes('request.params')
    )
    keys.forEach(k => {
      // Only remove interaction/request keys, keep token cache
      if (
        k.includes('interaction.status') ||
        k.includes('request.') ||
        k.includes('.interaction.') ||
        k.endsWith('.active')
      ) {
        localStorage.removeItem(k)
      }
    })
    console.log('[MSAL] Cleared stale interaction state')
  } catch (e) {
    console.warn('[MSAL] Could not clear state:', e)
  }
}

// ── Nuclear option: clear ALL MSAL state ─────────────────────
export function clearAllMsalState() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('msal.') || k.startsWith('msal|'))
      .forEach(k => localStorage.removeItem(k))
    _msalApp  = null
    _clientId = null
    _initDone = false
    console.log('[MSAL] All MSAL state cleared')
  } catch (e) {
    console.warn('[MSAL] Could not clear all state:', e)
  }
}

// ── MSAL app init ─────────────────────────────────────────────
async function getMsalApp(clientId) {
  if (_msalApp && _clientId === clientId && _initDone) return _msalApp

  _msalApp  = null
  _initDone = false
  _clientId = clientId

  const app = new PublicClientApplication({
    auth: {
      clientId,
      authority:              'https://login.microsoftonline.com/consumers',
      redirectUri:            window.location.origin + window.location.pathname,
      postLogoutRedirectUri:  window.location.origin + window.location.pathname,
      navigateToLoginRequestUrl: false,
    },
    cache: {
      cacheLocation:          'localStorage',
      storeAuthStateInCookie: true,
    },
    system: {
      allowNativeBroker: false,
      windowHashTimeout: 60000,
      iframeHashTimeout: 6000,
      loadFrameTimeout:  0,
      asyncPopups:       false,
    }
  })

  await app.initialize()

  try {
    await app.handleRedirectPromise()
  } catch (e) {
    console.warn('[MSAL] handleRedirectPromise (non-fatal):', e.message)
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

  const app      = await getMsalApp(clientId)
  const accounts = app.getAllAccounts()

  // Try silent first (uses cached token — no popup)
  if (accounts.length > 0) {
    try {
      const result = await app.acquireTokenSilent({
        scopes:  SCOPES,
        account: accounts[0],
      })
      console.log('[MSAL] Silent token OK')
      return result.accessToken
    } catch (silentErr) {
      console.warn('[MSAL] Silent failed, will use popup:', silentErr.message)
    }
  }

  // Clear stale interaction state before popup
  clearStaleMsalState()

  // Popup — retry once on transient errors
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`[MSAL] Login popup attempt ${attempt}…`)
      const result = await app.loginPopup({ scopes: SCOPES })
      return result.accessToken
    } catch (err) {
      const msg = err.message || ''
      console.warn(`[MSAL] Popup attempt ${attempt} error:`, msg)

      if (msg.includes('interaction_in_progress')) {
        clearStaleMsalState()
        // Re-init MSAL completely on second attempt
        _msalApp  = null
        _initDone = false
        if (attempt === 1) {
          await getMsalApp(clientId)
          continue
        }
        throw new Error('Login blocked by stale session — please refresh the page and try again')
      }

      if (msg.includes('timed_out')) {
        await app.handleRedirectPromise().catch(() => {})
        if (attempt === 1) continue
        throw new Error('Login timed out — please allow popups for this site and try again')
      }

      if (msg.includes('user_cancelled') || msg.includes('popup_window_error')) {
        throw new Error('Login cancelled — please try again')
      }

      throw new Error(`Microsoft login failed: ${msg}`)
    }
  }

  throw new Error('Login failed — please refresh the page and try again')
}

// ── Upload to OneDrive /receipts ──────────────────────────────
export async function uploadToOneDrive(file, base64Data, mimeType) {
  const token    = await getToken()
  const datePart = new Date().toISOString().slice(0, 10)
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filename = `${datePart}_${safeName}`
  const endpoint = `${GRAPH_BASE}/me/drive/root:/${UPLOAD_FOLDER}/${filename}:/content`

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
