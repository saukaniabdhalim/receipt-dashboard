// ─────────────────────────────────────────────────────────────
// OneDrive Upload Service
// Azure Client ID fetched from Cloudflare Worker /config
// No client-side secrets needed
// ─────────────────────────────────────────────────────────────

import { PublicClientApplication } from '@azure/msal-browser'

const WORKER_URL    = 'https://spring-art-d63a.saukanihalim.workers.dev'
const UPLOAD_FOLDER = 'receipts'
const GRAPH_BASE    = 'https://graph.microsoft.com/v1.0'
const SCOPES        = ['Files.ReadWrite', 'User.Read']

let _msalApp   = null
let _clientId  = null

// Fetch client ID from worker /config
async function fetchClientId() {
  try {
    const res  = await fetch(`${WORKER_URL}/config`)
    const data = await res.json()
    return data.azureClientId || ''
  } catch {
    return ''
  }
}

async function getMsalApp() {
  const clientId = await fetchClientId()
  if (!clientId) throw new Error('AZURE_CLIENT_ID not set in Cloudflare Worker secrets')

  if (_msalApp && _clientId === clientId) return _msalApp

  _msalApp  = null
  _clientId = clientId

  const app = new PublicClientApplication({
    auth: {
      clientId,
      authority:              'https://login.microsoftonline.com/consumers',
      redirectUri:            window.location.origin + window.location.pathname,
      navigateToLoginRequestUrl: false,
    },
    cache: {
      cacheLocation:          'localStorage',
      storeAuthStateInCookie: true,
    },
    system: {
      allowNativeBroker: false,
      asyncPopups:       false,
    }
  })

  await app.initialize()

  try {
    await app.handleRedirectPromise()
  } catch (e) {
    console.warn('[MSAL] handleRedirectPromise:', e.message)
  }

  _msalApp = app
  return app
}

export async function isUploadConfigured() {
  const cid = await fetchClientId()
  return !!cid
}

// Keep sync version for UI checks
export function isUploadConfiguredSync() {
  return !!_clientId
}

async function getToken() {
  const app      = await getMsalApp()
  const accounts = app.getAllAccounts()

  if (accounts.length > 0) {
    try {
      const result = await app.acquireTokenSilent({ scopes: SCOPES, account: accounts[0] })
      return result.accessToken
    } catch (e) {
      console.warn('[MSAL] Silent failed:', e.message)
    }
  }

  try {
    const result = await app.loginPopup({ scopes: SCOPES, prompt: 'select_account' })
    return result.accessToken
  } catch (popupErr) {
    const code = popupErr.errorCode || ''
    const msg  = popupErr.message  || ''

    if (code === 'user_cancelled' || msg.includes('user_cancelled')) {
      await new Promise(r => setTimeout(r, 500))
      const fresh = app.getAllAccounts()
      if (fresh.length > 0) {
        try {
          const result = await app.acquireTokenSilent({ scopes: SCOPES, account: fresh[0] })
          return result.accessToken
        } catch {}
        try {
          const result = await app.acquireTokenPopup({ scopes: SCOPES, account: fresh[0] })
          return result.accessToken
        } catch {}
      }
      throw new Error('Sign-in popup closed — please try again')
    }

    if (code === 'popup_window_error' || msg.includes('popup_window_error')) {
      throw new Error('Popup blocked — allow popups for this site and try again')
    }

    throw new Error(`Microsoft sign-in failed: ${msg.slice(0, 100)}`)
  }
}

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
  if (!_msalApp) return
  try {
    const accounts = _msalApp.getAllAccounts()
    if (accounts.length > 0) await _msalApp.logoutPopup({ account: accounts[0] })
  } catch (e) { console.warn('[MSAL] Logout:', e.message) }
}

// Backward compat stubs
export function getClientId()    { return _clientId || '' }
export function saveClientId()   {}
