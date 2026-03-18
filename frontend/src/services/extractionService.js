// ─────────────────────────────────────────────────────────────
// AI Receipt Extraction
// Routes through Cloudflare Worker proxy to keep API key hidden
// Worker URL: https://spring-art-d63a.saukanihalim.workers.dev/
// ─────────────────────────────────────────────────────────────

const PROXY_URL = 'https://spring-art-d63a.saukanihalim.workers.dev/'

const CATEGORIES = [
  'food','transport','toll','utilities','shopping',
  'healthcare','entertainment','grocery','education','others'
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
- date must be YYYY-MM-DD. If year not visible assume current year 2026.
- amount is a number only (no currency symbol). Use the TOTAL/GRAND TOTAL.
- currency: default MYR for Malaysian receipts. Look for RM symbol.
- category: pick best match from list.
- merchant: business name at top of receipt.
- description: 1 short sentence about what was purchased.
- confidence: "high" if all fields clear, "medium" if some guessed, "low" if image unclear.
- If a field cannot be determined, use null.`

export async function extractReceiptData(base64Data, mimeType, filename = '') {
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
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
            text: `Extract receipt data. Filename hint: "${filename}". Return ONLY valid JSON.`
          }
        ]
      }]
    })
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Proxy error ${response.status} — check Cloudflare Worker logs`)
  }

  const data = await response.json()
  const text = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim()

  try {
    const p = JSON.parse(text)
    return {
      merchant:    p.merchant    || '',
      date:        validateDate(p.date),
      amount:      parseFloat(p.amount) || 0,
      currency:    p.currency    || 'MYR',
      category:    CATEGORIES.includes(p.category) ? p.category : 'others',
      description: p.description || '',
      confidence:  p.confidence  || 'medium',
    }
  } catch {
    throw new Error('AI could not parse this receipt image — try a clearer photo')
  }
}

function validateDate(str) {
  if (!str) return new Date().toISOString().split('T')[0]
  const m = str.match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? str.slice(0,10) : new Date().toISOString().split('T')[0]
}

export function getMimeType(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase()
  return {
    jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png',
    gif:'image/gif',  webp:'image/webp', heic:'image/heic',
    bmp:'image/bmp',  pdf:'application/pdf'
  }[ext] || 'image/jpeg'
}

export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
