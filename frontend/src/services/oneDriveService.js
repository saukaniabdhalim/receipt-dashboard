// ─────────────────────────────────────────────────────────────
// OneDrive Public Folder Service
// Microsoft Graph API — anonymous access via public share link
// ─────────────────────────────────────────────────────────────

export const SHARE_URL = "https://1drv.ms/f/c/073e5aa9950c6d8c/IgDw6oxE2PdvS5XrWfXeuOjOAe_H3KvgJg80jItXggTWtqg?e=688nJN"

/**
 * Properly encode a OneDrive share URL to Graph API sharing token
 * Uses TextEncoder for safe UTF-8 → base64 conversion (handles all chars)
 */
function encodeSharingUrl(url) {
  // Convert string to UTF-8 bytes then to base64
  const bytes = new TextEncoder().encode(url)
  let binary = ''
  bytes.forEach(b => binary += String.fromCharCode(b))
  const base64 = btoa(binary)
  // base64url encoding: remove padding, replace + with -, / with _
  return 'u!' + base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

const SHARING_TOKEN = encodeSharingUrl(SHARE_URL)

// ── Graph API helpers ───────────────────────────────────────

async function graphFetch(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' }
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const msg = body?.error?.message || body?.error?.code || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return res.json()
}

// ── Root drive item ─────────────────────────────────────────

let _rootMeta = null

async function getRootMeta() {
  if (_rootMeta) return _rootMeta
  const data = await graphFetch(
    `https://graph.microsoft.com/v1.0/shares/${SHARING_TOKEN}/driveItem` +
    `?$select=id,name,parentReference`
  )
  _rootMeta = data
  return data
}

// ── List files ──────────────────────────────────────────────

const FIELDS = 'id,name,size,lastModifiedDateTime,folder,webUrl,file,@microsoft.graph.downloadUrl'

/**
 * List files in the shared folder root, or a subfolder by itemId
 */
export async function listOneDriveFiles(itemId = null) {
  let url

  if (itemId) {
    // Navigate into a subfolder: need driveId from root meta
    const root = await getRootMeta()
    const driveId = root.parentReference?.driveId
    if (!driveId) throw new Error('Could not determine drive ID')
    url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/children?$select=${FIELDS}`
  } else {
    // Root of the shared folder
    url = `https://graph.microsoft.com/v1.0/shares/${SHARING_TOKEN}/driveItem/children?$select=${FIELDS}`
  }

  const data = await graphFetch(url)
  const items = data.value || []

  // Sort: folders first, then by name
  items.sort((a, b) => {
    if (a.folder && !b.folder) return -1
    if (!a.folder && b.folder) return 1
    return a.name.localeCompare(b.name)
  })

  return items
}

// ── Download URL ─────────────────────────────────────────────

/**
 * Get a direct download URL for a file item
 * @microsoft.graph.downloadUrl is included in the listing $select above
 */
export async function getFileDownloadUrl(item) {
  // Already included in listing response
  if (item['@microsoft.graph.downloadUrl']) {
    return item['@microsoft.graph.downloadUrl']
  }
  // Fallback: fetch item individually
  const root = await getRootMeta()
  const driveId = root.parentReference?.driveId
  if (!driveId) throw new Error('Could not determine drive ID')
  const data = await graphFetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${item.id}?$select=@microsoft.graph.downloadUrl,webUrl`
  )
  return data['@microsoft.graph.downloadUrl'] || null
}

// ── Fetch file as base64 ─────────────────────────────────────

export async function fetchFileAsBase64(downloadUrl) {
  const res = await fetch(downloadUrl)
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// ── File type helpers ────────────────────────────────────────

export const isImageFile  = (item) => /\.(jpg|jpeg|png|gif|webp|heic|bmp)$/i.test(item.name || '')
export const isPdfFile    = (item) => /\.pdf$/i.test(item.name || '')
export const isReceiptFile = (item) => isImageFile(item) || isPdfFile(item)
