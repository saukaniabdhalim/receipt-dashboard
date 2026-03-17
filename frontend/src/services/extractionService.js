// ─────────────────────────────────────────────────────────────
// AI Receipt Extraction Service
// Sends receipt image to Claude API → returns structured data
// ─────────────────────────────────────────────────────────────

const CATEGORIES = [
  'food', 'transport', 'toll', 'utilities', 'shopping',
  'healthcare', 'entertainment', 'grocery', 'education', 'others'
]

const SYSTEM_PROMPT = `You are a receipt data extractor. 
Given a receipt image, extract the key fields and return ONLY a JSON object — no explanation, no markdown, no extra text.

Return this exact shape:
{
  "merchant": "store or vendor name",
  "date": "YYYY-MM-DD",
  "amount": 12.50,
  "currency": "MYR",
  "category": "one of: food|transport|toll|utilities|shopping|healthcare|entertainment|grocery|education|others",
  "description": "brief description of purchase",
  "confidence": "high|medium|low"
}

Rules:
- date must be YYYY-MM-DD. If year not visible, assume current year.
- amount is a number (no currency symbol). Use the TOTAL amount.
- currency: default MYR for Malaysian receipts. Look for RM symbol.
- category: pick the best match from the list.
- merchant: use the business name at the top of the receipt.
- description: 1 short sentence describing what was purchased.
- If a field is not visible, use null.`

/**
 * Extract receipt data from a base64 image using Claude API
 * @param {string} base64Data - base64 encoded image
 * @param {string} mimeType   - e.g. "image/jpeg", "image/png"
 * @param {string} filename   - original filename (helps with context)
 */
export async function extractReceiptData(base64Data, mimeType, filename = '') {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: base64Data }
          },
          {
            type: 'text',
            text: `Extract receipt data from this image. Filename: "${filename}". Return ONLY the JSON object.`
          }
        ]
      }]
    })
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Claude API error: ${response.status}`)
  }

  const data = await response.json()
  const text = data.content?.[0]?.text || ''

  // Strip any markdown fences just in case
  const cleaned = text.replace(/```json|```/g, '').trim()

  try {
    const parsed = JSON.parse(cleaned)
    // Validate and clean up
    return {
      merchant:    parsed.merchant    || '',
      date:        validateDate(parsed.date),
      amount:      parseFloat(parsed.amount) || 0,
      currency:    parsed.currency    || 'MYR',
      category:    CATEGORIES.includes(parsed.category) ? parsed.category : 'others',
      description: parsed.description || '',
      confidence:  parsed.confidence  || 'medium',
    }
  } catch {
    throw new Error('Could not parse AI response as JSON')
  }
}

function validateDate(str) {
  if (!str) return new Date().toISOString().split('T')[0]
  // Ensure YYYY-MM-DD format
  const match = str.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (match) return str.slice(0, 10)
  return new Date().toISOString().split('T')[0]
}

/**
 * Get MIME type from filename
 */
export function getMimeType(filename) {
  const ext = filename.split('.').pop().toLowerCase()
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png',  gif: 'image/gif',
    webp: 'image/webp', heic: 'image/heic',
    bmp: 'image/bmp',  pdf: 'application/pdf'
  }
  return map[ext] || 'image/jpeg'
}
