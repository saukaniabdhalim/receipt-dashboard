// ─────────────────────────────────────────────────────────────
// OneDrive Public Folder Service
// Uses Microsoft Graph API with a public share link — no login required
// ─────────────────────────────────────────────────────────────

export const SHARE_URL = "https://1drv.ms/f/c/073e5aa9950c6d8c/IgDw6oxE2PdvS5XrWfXeuOjOAe_H3KvgJg80jItXggTWtqg?e=1sUWha"

function encodeSharingUrl(url) {
  const base64 = btoa(url).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `u!${base64}`
}

const SHARING_TOKEN = encodeSharingUrl(SHARE_URL)
const GRAPH_ROOT    = `https://graph.microsoft.com/v1.0/shares/${SHARING_TOKEN}/driveItem`

/**
 * List files in the shared folder root (or a child folder by id)
 */
export async function listOneDriveFiles(itemId = null) {
  const url = itemId
    ? `https://graph.microsoft.com/v1.0/drives/${await getDriveId()}/items/${itemId}/children?$select=id,name,size,lastModifiedDateTime,folder,webUrl,file,@microsoft.graph.downloadUrl`
    : `${GRAPH_ROOT}/children?$select=id,name,size,lastModifiedDateTime,folder,webUrl,file,@microsoft.graph.downloadUrl`

  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Graph API error ${res.status}`)
  }
  const data = await res.json()
  return data.value || []
}

// Cache the driveId so we don't fetch it repeatedly
let _driveId = null
export async function getDriveId() {
  if (_driveId) return _driveId
  const res = await fetch(`${GRAPH_ROOT}?$select=id,parentReference`)
  if (!res.ok) throw new Error('Could not get drive ID')
  const data = await res.json()
  _driveId = data.parentReference?.driveId
  return _driveId
}

/**
 * Get a temporary download URL for a file (for sending to Claude AI)
 * The @microsoft.graph.downloadUrl in file listing is already a direct URL
 */
export async function getFileDownloadUrl(item) {
  // First try the field returned directly in listing
  if (item['@microsoft.graph.downloadUrl']) {
    return item['@microsoft.graph.downloadUrl']
  }
  // Fallback: fetch item individually to get download URL
  const driveId = await getDriveId()
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${item.id}?$select=@microsoft.graph.downloadUrl,webUrl`
  )
  if (!res.ok) throw new Error('Could not get download URL')
  const data = await res.json()
  return data['@microsoft.graph.downloadUrl'] || data.webUrl
}

/**
 * Fetch a file as base64 (for sending image to Claude API)
 */
export async function fetchFileAsBase64(downloadUrl) {
  const res = await fetch(downloadUrl)
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export function isImageFile(item) {
  return /\.(jpg|jpeg|png|gif|webp|heic|bmp)$/i.test(item.name || '')
}

export function isPdfFile(item) {
  return /\.pdf$/i.test(item.name || '')
}

export function isReceiptFile(item) {
  return isImageFile(item) || isPdfFile(item)
}
