// ─────────────────────────────────────────────────────────────
// OneDrive Public Folder Service
// Uses Microsoft Graph API with a public share link — no login required
// Share link: https://1drv.ms/f/c/073e5aa9950c6d8c/...
// ─────────────────────────────────────────────────────────────

const SHARE_URL = "https://1drv.ms/f/c/073e5aa9950c6d8c/IgDw6oxE2PdvS5XrWfXeuOjOAe_H3KvgJg80jItXggTWtqg?e=1sUWha"

// Encode share URL to Graph API sharing token format
function encodeSharingUrl(url) {
  const base64 = btoa(url).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `u!${base64}`
}

const SHARING_TOKEN = encodeSharingUrl(SHARE_URL)
const GRAPH_BASE = `https://graph.microsoft.com/v1.0/shares/${SHARING_TOKEN}`

/**
 * List files in the shared OneDrive folder (or subfolder)
 * @param {string|null} itemId - null for root, or a driveItem ID for subfolder
 */
export async function listOneDriveFiles(itemId = null) {
  const url = itemId
    ? `https://graph.microsoft.com/v1.0/shares/${SHARING_TOKEN}/driveItem/children`
    : `${GRAPH_BASE}/driveItem/children`

  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' }
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Graph API error: ${res.status}`)
  }

  const data = await res.json()
  return data.value || []
}

/**
 * Get root folder metadata
 */
export async function getOneDriveRoot() {
  const res = await fetch(`${GRAPH_BASE}/driveItem`, {
    headers: { 'Content-Type': 'application/json' }
  })
  if (!res.ok) throw new Error(`Graph API error: ${res.status}`)
  return res.json()
}

/**
 * Get direct download URL for a file
 */
export async function getDownloadUrl(itemId) {
  const url = `https://graph.microsoft.com/v1.0/shares/${SHARING_TOKEN}/driveItem/children`
  // For publicly shared items, @microsoft.graph.downloadUrl is returned directly in list
  return null
}

export const ONEDRIVE_FOLDER_URL = SHARE_URL
