// ─────────────────────────────────────────────────────────────
// OneDrive Service — via Microsoft Graph API
// Uses the access token from MSAL to access the user's files.
// ─────────────────────────────────────────────────────────────

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

/**
 * Ensures the /receipts folder exists in OneDrive
 * @param {string} token - MSAL Access Token
 */
export async function ensureReceiptsFolder(token) {
  const res = await fetch(`${GRAPH_BASE}/me/drive/root/children`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  const data = await res.json()
  const exists = data.value?.find(f => f.name === 'receipts' && f.folder)
  
  if (!exists) {
    await fetch(`${GRAPH_BASE}/me/drive/root/children`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'receipts',
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail'
      })
    })
  }
}

/**
 * Lists images in the /receipts folder
 */
export async function listReceipts(token) {
  const res = await fetch(`${GRAPH_BASE}/me/drive/root:/receipts:/children`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (!res.ok) return []
  const data = await res.json()
  // Only return images
  return data.value?.filter(f => f.file && f.file.mimeType.startsWith('image/')) || []
}

/**
 * Uploads a file to the /receipts folder
 */
export async function uploadReceipt(file, token) {
  const fileName = `receipt-${Date.now()}-${file.name}`
  const res = await fetch(`${GRAPH_BASE}/me/drive/root:/receipts/${fileName}:/content`, {
    method: 'PUT',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': file.type 
    },
    body: file
  })
  return res.json()
}

/**
 * Gets a download URL for a file
 */
export async function getFileDownloadUrl(fileId, token) {
  const res = await fetch(`${GRAPH_BASE}/me/drive/items/${fileId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  const data = await res.json()
  return data['@microsoft.graph.downloadUrl']
}
