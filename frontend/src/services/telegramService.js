// ─────────────────────────────────────────────────────────────
// Telegram Service
// Sends receipt photo + extracted data to a Telegram group
// Bot token + chat ID are stored safely in Cloudflare Worker secrets
// ─────────────────────────────────────────────────────────────

const TELEGRAM_PROXY = 'https://spring-art-d63a.saukanihalim.workers.dev/telegram'

/**
 * Build a nicely formatted Telegram caption from receipt data
 */
function buildCaption(receipt) {
  const categoryEmoji = {
    food: '🍜', transport: '🚗', toll: '🛣️', utilities: '💡',
    shopping: '🛍️', healthcare: '🏥', entertainment: '🎬',
    grocery: '🛒', education: '📚', others: '📋'
  }
  const emoji = categoryEmoji[receipt.category] || '📋'
  const source = receipt.source === 'ocr' ? ' _(Free OCR)_' : ''

  const lines = [
    `🧾 *New Receipt Added*${source}`,
    ``,
    `🏪 *${receipt.merchant || 'Unknown Merchant'}*`,
    `💰 RM ${Number(receipt.amount || 0).toFixed(2)}`,
    `📅 ${receipt.date || '—'}`,
    `${emoji} ${capitalize(receipt.category || 'others')}`,
  ]

  if (receipt.description) {
    lines.push(`📝 _${receipt.description}_`)
  }

  lines.push(``, `_Sent from Resit Dashboard_`)
  return lines.join('\n')
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str
}

/**
 * Send a receipt image + extracted data to Telegram group
 * @param {string} base64Image  - base64 encoded image (no data: prefix)
 * @param {string} mimeType     - e.g. 'image/jpeg'
 * @param {object} receiptData  - extracted receipt fields
 */
export async function sendReceiptToTelegram(base64Image, mimeType, receiptData) {
  const response = await fetch(TELEGRAM_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image:    base64Image,
      mimeType: mimeType,
      caption:  buildCaption(receiptData),
    })
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error || `Telegram send failed (${response.status})`)
  }

  return data
}
