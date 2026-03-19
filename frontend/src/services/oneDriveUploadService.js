import { PublicClientApplication } from '@azure/msal-browser'

const WORKER_URL    = 'https://spring-art-d63a.saukanihalim.workers.dev'
const UPLOAD_FOLDER = 'receipts'
const GRAPH_BASE    = 'https://graph.microsoft.com/v1.0'
const SCOPES        = ['Files.ReadWrite', 'User.Read']
const isMobile      = () => /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)

let _app = null

async function getApp() {
  if (_app) return _app

  // Get client ID from worker config
  let clientId = ''
  try {
    const res  = await fetch(`${WORKER_URL}/config`)
    const data = await res.json()
    clientId   = data.azureClientId || ''
  } catch {}

  if (!clientId) throw new Error('AZURE_CLIENT_ID not set in Cloudflare Worker secrets')

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
    system: { allowNativeBroker: false }
  })

  await app.initialize()

  // Always handle redirect promise on init
  try {
    await app.handleRedirectPromise()
  } catch (e) {
    console.warn('[MSAL] handleRedirectPromise:', e.message)
  }

  _app = app
  return app
}

async function getToken() {
  const app      = await getApp()
  const accounts = app.getAllAccounts()

  // Silent first (already logged in)
  if (accounts.length > 0) {
    try {
      const r = await app.acquireTokenSilent({ scopes: SCOPES, account: accounts[0] })
      return r.accessToken
    } catch (e) {
      console.warn('[MSAL] Silent failed:', e.message)
    }
  }

  // Mobile: use redirect (popup blocked by mobile browsers)
  // Desktop: use popup
  if (isMobile()) {
    // Save current scroll position and redirect
    await app.loginRedirect({ scopes: SCOPES })
    // Code below never runs — page redirects away
    return ''
  }

  // Desktop popup
  try {
    const r = await app.loginPopup({ scopes: SCOPES })
    return r.accessToken
  } catch (e) {
    const code = e.errorCode || ''
    const msg  = e.message   || ''

    // user_cancelled can fire after successful redirect close
    if (code === 'user_cancelled' || msg.includes('user_cancelled')) {
      await new Promise(r => setTimeout(r, 600))
      const fresh = app.getAllAccounts()
      if (fresh.length > 0) {
        try {
          const r = await app.acquireTokenSilent({ scopes: SCOPES, account: fresh[0] })
          return r.accessToken
        } catch {}
        try {
          const r = await app.acquireTokenPopup({ scopes: SCOPES, account: fresh[0] })
          return r.accessToken
        } catch {}
      }
      throw new Error('Sign-in cancelled — please try again')
    }

    if (code === 'popup_window_error' || msg.includes('popup')) {
      throw new Error('Popup blocked — allow popups for this site')
    }

    throw new Error(`Sign-in failed: ${msg.slice(0,80)}`)
  }
}

export async function uploadToOneDrive(file, base64Data, mimeType) {
  const token    = await getToken()
  if (!token) throw new Error('No token — please sign in again')

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

export function isUploadConfigured() { return true }
export function getClientId()        { return '' }
export function saveClientId()       {}

export async function signOutOneDrive() {
  if (!_app) return
  try {
    const accounts = _app.getAllAccounts()
    if (accounts.length > 0) await _app.logoutPopup({ account: accounts[0] })
  } catch {}
}
