// ============================================================
// OneDrive / Microsoft Graph API Service
// Reads receipt files from a dedicated OneDrive folder:
//   /Receipts  (created automatically on first use)
// ============================================================

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const RECEIPTS_FOLDER = 'Receipts'

/**
 * Get an access token using MSAL instance
 */
async function getToken(msalInstance, loginRequest) {
  const accounts = msalInstance.getAllAccounts()
  if (!accounts.length) throw new Error('Not authenticated')

  const request = { ...loginRequest, account: accounts[0] }
  const response = await msalInstance.acquireTokenSilent(request)
  return response.accessToken
}

/**
 * Authenticated Graph API fetch helper
 */
async function graphFetch(token, path, options = {}) {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Graph API error: ${res.status}`)
  }
  return res.json()
}

/**
 * Ensure the /Receipts folder exists in OneDrive root, create if not
 */
export async function ensureReceiptsFolder(token) {
  try {
    const folder = await graphFetch(token, `/me/drive/root:/${RECEIPTS_FOLDER}`)
    return folder.id
  } catch {
    // Create folder
    const folder = await graphFetch(token, '/me/drive/root/children', {
      method: 'POST',
      body: JSON.stringify({
        name: RECEIPTS_FOLDER,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'rename',
      }),
    })
    return folder.id
  }
}

/**
 * List all receipt files from OneDrive /Receipts folder
 */
export async function listReceiptFiles(token) {
  try {
    const data = await graphFetch(
      token,
      `/me/drive/root:/${RECEIPTS_FOLDER}:/children?$select=id,name,createdDateTime,size,webUrl,file,@microsoft.graph.downloadUrl`
    )
    return (data.value || []).filter(
      (f) => f.file && /\.(jpg|jpeg|png|pdf|webp|heic)$/i.test(f.name)
    )
  } catch {
    return []
  }
}

/**
 * Upload a file to OneDrive /Receipts folder
 */
export async function uploadReceiptFile(token, file) {
  const name = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`
  const uploadRes = await fetch(
    `${GRAPH_BASE}/me/drive/root:/${RECEIPTS_FOLDER}/${encodeURIComponent(name)}:/content`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: file,
    }
  )
  if (!uploadRes.ok) throw new Error('Upload failed')
  return uploadRes.json()
}

/**
 * Delete a file from OneDrive by item id
 */
export async function deleteReceiptFile(token, itemId) {
  const res = await fetch(`${GRAPH_BASE}/me/drive/items/${itemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok && res.status !== 204) throw new Error('Delete failed')
  return true
}

/**
 * Get current user profile
 */
export async function getUserProfile(token) {
  return graphFetch(token, '/me?$select=displayName,mail,userPrincipalName')
}

export { getToken }
