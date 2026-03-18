// ─────────────────────────────────────────────────────────────
// OneDrive Upload Service
// Fix: handle popup redirect close not being mistaken as cancel
// ─────────────────────────────────────────────────────────────

import { PublicClientApplication } from '@azure/msal-browser'

const UPLOAD_FOLDER = 'receipts'
const GRAPH_BASE    = 'https://graph.microsoft.com/v1.0'
const SETTINGS_KEY  = 'resit_od_upload_settings'
const SCOPES        = ['Files.ReadWrite', 'User.Read']

let _msalApp  = null
let _clientId = null

async function getMsalApp(clientId) {
  if (_msalApp && _clientId === clientId) return _msalApp

  _msalApp  = null
  _clientId = clientId

  const app = new PublicClientApplication({
    auth: {
      clientId,
      authority:                   'https://login.microsoftonline.com/consumers',
      redirectUri:                 window.location.origin + window.location.pathname,
      postLogoutRedirectUri:       window.location.origin + window.location.pathname,
      navigateToLoginRequestUrl:   false,
    },
    cache: {
      cacheLocation:           'localStorage',
      storeAuthStateInCookie:  true,
    },
    system: {
      allowNativeBroker: false,
      asyncPopups:       false,
    }
  })

  await app.initialize()

  // Handle any pending redirect response
  try {
    const redirectResult = await app.handleRedirectPromise()
    if (redirectResult?.accessToken) {
      console.log('[MSAL] Got token from redirect')
    }
  } catch (e) {
    console.warn('[MSAL] handleRedirectPromise (non-fatal):', e.message)
  }

  _msalApp = app
  return app
}

// ── Settings ──────────────────────────────────────────────────
export function getClientId() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').clientId || '' }
  catch { return '' }
}
export function saveClientId(id) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ clientId: id.trim() }))
  _msalApp = null; _clientId = null
}
export function isUploadConfigured() { return !!getClientId() }

// ── Get token ─────────────────────────────────────────────────
async function getToken() {
  const clientId = getClientId()
  if (!clientId) throw new Error('Azure Client ID not configured — open Setup OneDrive Upload')

  const app      = await getMsalApp(clientId)
  const accounts = app.getAllAccounts()

  // 1. Try silent (already signed in)
  if (accounts.length > 0) {
    try {
      const result = await app.acquireTokenSilent({ scopes: SCOPES, account: accounts[0] })
      console.log('[MSAL] Silent token OK')
      return result.accessToken
    } catch (e) {
      console.warn('[MSAL] Silent failed:', e.message)
    }
  }

  // 2. Popup login
  console.log('[MSAL] Opening login popup…')
  try {
    const result = await app.loginPopup({ scopes: SCOPES, prompt: 'select_account' })
    console.log('[MSAL] Popup login OK')
    return result.accessToken
  } catch (popupErr) {
    const msg  = popupErr.message || ''
    const code = popupErr.errorCode || ''
    console.warn('[MSAL] Popup error:', code, msg)

    // "user_cancelled" fires even on SUCCESSFUL redirect close — check if we got an account
    if (code === 'user_cancelled' || msg.includes('user_cancelled')) {
      // Wait briefly then check if login actually succeeded
      await new Promise(r => setTimeout(r, 500))
      const fresh = app.getAllAccounts()
      if (fresh.length > 0) {
        console.log('[MSAL] Account found after popup close — trying silent')
        try {
          const result = await app.acquireTokenSilent({ scopes: SCOPES, account: fresh[0] })
          return result.accessToken
        } catch {}
        // acquireTokenPopup as last resort
        try {
          const result = await app.acquireTokenPopup({ scopes: SCOPES, account: fresh[0] })
          return result.accessToken
        } catch {}
      }
      throw new Error('Sign-in popup closed — please try clicking Save to OneDrive again')
    }

    if (code === 'popup_window_error' || msg.includes('popup_window_error')) {
      throw new Error('Popup was blocked by your browser — allow popups for this site and try again')
    }

    if (code === 'timed_out' || msg.includes('timed_out')) {
      throw new Error('Sign-in timed out — please try again')
    }

    throw new Error(`Microsoft sign-in failed: ${msg.slice(0, 100)}`)
  }
}

// ── Upload ────────────────────────────────────────────────────
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
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': mimeType },
    body:    bytes
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Upload failed (${response.status})`)
  }

  const data = await response.json()
  return { webUrl: data.webUrl, name: data.name, id: data.id }
}

export async function signOutOneDrive() {
  const cid = getClientId()
  if (!cid) return
  try {
    const app      = await getMsalApp(cid)
    const accounts = app.getAllAccounts()
    if (accounts.length > 0) await app.logoutPopup({ account: accounts[0] })
  } catch (e) { console.warn('[MSAL] Logout:', e.message) }
}
