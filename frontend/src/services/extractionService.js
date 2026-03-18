// ─────────────────────────────────────────────────────────────
// AI Receipt Extraction via Cloudflare Worker proxy
// ─────────────────────────────────────────────────────────────

const PROXY_URL = 'https://spring-art-d63a.saukanihalim.workers.dev/'

const CATEGORIES = [
  'food','transport','toll','utilities','shopping',
  'healthcare','entertainment','grocery','education','others'
]

const SYSTEM_PROMPT = `You are a receipt data extractor.
Given a receipt image, extract the key fields and return ONLY a raw JSON object.
No explanation. No markdown. No code fences. Just the JSON object itself.

Return exactly this shape:
{
  "merchant": "store name",
  "date": "YYYY-MM-DD",
  "amount": 12.50,
  "currency": "MYR",
  "category": "food",
  "description": "brief description",
  "confidence": "high"
}

Rules:
- date: YYYY-MM-DD format. Use current year 2026 if not visible.
- amount: grand total as a plain number, no RM symbol.
- currency: MYR for Malaysian receipts.
- category: must be one of: food, transport, toll, utilities, shopping, healthcare, entertainment, grocery, education, others.
- confidence: high / medium / low.
- Use null for any field you cannot determine.
- Return ONLY the JSON. Nothing else before or after it.`

export async function extractReceiptData(base64Data, mimeType, filename = '') {
  let response

  try {
    response = await fetch(PROXY_URL, {
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
              text: 'Extract the receipt data and return ONLY the JSON object. No other text.'
            }
          ]
        }]
      })
    })
  } catch (networkErr) {
    throw new Error(`Cannot reach AI proxy — check your internet connection (${networkErr.message})`)
  }

  // Get raw text first for debugging
  const rawText = await response.text()
  console.log('[Receipt AI] HTTP status:', response.status)
  console.log('[Receipt AI] Raw response:', rawText)

  if (!response.ok) {
    let errMsg = `Proxy error ${response.status}`
    try {
      const errJson = JSON.parse(rawText)
      errMsg = errJson?.error?.message || errJson?.message || errMsg
    } catch {}
    throw new Error(errMsg)
  }

  // Parse the Anthropic API response envelope
  let envelope
  try {
    envelope = JSON.parse(rawText)
  } catch {
    throw new Error(`Invalid response from proxy: ${rawText.slice(0, 100)}`)
  }

  // Check for API-level errors inside the envelope
  if (envelope.type === 'error' || envelope.error) {
    const msg = envelope.error?.message || envelope.error || 'Claude API error'
    throw new Error(msg)
  }

  // Extract the text content
  const aiText = (envelope.content?.[0]?.text || '').trim()
  console.log('[Receipt AI] AI text:', aiText)

  if (!aiText) {
    throw new Error('Empty response from AI — please try again')
  }

  // Strip markdown fences if present (just in case)
  const cleaned = aiText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  // Find JSON object in the response (in case there's any surrounding text)
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error(`AI did not return valid JSON. Got: "${cleaned.slice(0, 80)}"`)
  }

  let parsed
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (parseErr) {
    throw new Error(`Could not parse AI response as JSON: ${parseErr.message}`)
  }

  return {
    merchant:    parsed.merchant    || '',
    date:        validateDate(parsed.date),
    amount:      parseFloat(parsed.amount) || 0,
    currency:    parsed.currency    || 'MYR',
    category:    CATEGORIES.includes(parsed.category) ? parsed.category : 'others',
    description: parsed.description || '',
    confidence:  parsed.confidence  || 'medium',
  }
}

function validateDate(str) {
  if (!str) return new Date().toISOString().split('T')[0]
  const m = str.match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? str.slice(0, 10) : new Date().toISOString().split('T')[0]
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
