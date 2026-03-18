// ─────────────────────────────────────────────────────────────
// AI Receipt Extraction
// Primary:  Claude AI via Cloudflare Worker (best accuracy)
// Fallback: Tesseract.js free OCR (no API key, runs in browser)
// ─────────────────────────────────────────────────────────────

import { extractTextFromImage, parseReceiptText } from './ocrService.js'

const PROXY_URL   = 'https://spring-art-d63a.saukanihalim.workers.dev/'
const MAX_SIZE_MB = 1.5   // compress images larger than this before sending

/**
 * Compress an image File to under MAX_SIZE_MB using canvas
 * Returns { base64, mimeType } — always JPEG after compression
 */
async function compressImage(file) {
  // PDFs can't be compressed via canvas — return as-is
  if (file.type === 'application/pdf') {
    const b64 = await readFileAsBase64(file)
    return { base64: b64, mimeType: 'application/pdf' }
  }

  const sizeMB = file.size / 1024 / 1024
  if (sizeMB <= MAX_SIZE_MB) {
    // Small enough — no compression needed
    const b64 = await readFileAsBase64(file)
    return { base64: b64, mimeType: file.type || 'image/jpeg' }
  }

  console.log(`[Compress] ${sizeMB.toFixed(1)}MB → compressing to ~${MAX_SIZE_MB}MB`)

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      // Calculate scale to hit target size
      const scale   = Math.sqrt(MAX_SIZE_MB / sizeMB) * 0.9
      const width   = Math.round(img.width  * scale)
      const height  = Math.round(img.height * scale)

      const canvas  = document.createElement('canvas')
      canvas.width  = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)

      // Try quality 0.85 first, go lower if still too big
      let quality = 0.85
      let dataUrl = canvas.toDataURL('image/jpeg', quality)

      // Rough size check — base64 is ~1.33x the binary size
      while (dataUrl.length > MAX_SIZE_MB * 1024 * 1024 * 1.33 && quality > 0.3) {
        quality -= 0.1
        dataUrl = canvas.toDataURL('image/jpeg', quality)
      }

      const base64 = dataUrl.split(',')[1]
      console.log(`[Compress] Done — quality ${quality.toFixed(1)}, size ~${(base64.length * 0.75 / 1024 / 1024).toFixed(1)}MB`)
      resolve({ base64, mimeType: 'image/jpeg' })
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      // Fallback — send original
      readFileAsBase64(file).then(b64 => resolve({ base64: b64, mimeType: file.type || 'image/jpeg' }))
    }

    img.src = url
  })
}

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

// ── Determine if an error is due to low balance ──────────────
function isBalanceError(msg = '') {
  const m = msg.toLowerCase()
  return m.includes('credit balance') ||
         m.includes('insufficient') ||
         m.includes('billing') ||
         m.includes('quota') ||
         m.includes('rate limit') ||
         m.includes('overloaded') ||
         m.includes('529') ||
         m.includes('402')
}

// ── Primary: Claude AI via Cloudflare Worker ─────────────────
async function extractWithClaude(base64Data, mimeType, filename) {
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
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } },
            { type: 'text', text: 'Extract the receipt data and return ONLY the JSON object. No other text.' }
          ]
        }]
      })
    })
  } catch (networkErr) {
    throw new Error(`network:${networkErr.message}`)
  }

  const rawText = await response.text()
  console.log('[Claude] status:', response.status, '| raw:', rawText.slice(0, 200))

  if (!response.ok) {
    let errMsg = `Proxy error ${response.status}`
    try {
      const e = JSON.parse(rawText)
      errMsg = e?.error?.message || e?.error || e?.message || errMsg
    } catch {}
    // Show the real error — not a generic message
    throw new Error(errMsg)
  }

  let envelope
  try { envelope = JSON.parse(rawText) }
  catch { throw new Error(`Invalid proxy response: ${rawText.slice(0,100)}`) }

  if (envelope.type === 'error' || envelope.error) {
    throw new Error(envelope.error?.message || String(envelope.error))
  }

  const aiText = (envelope.content?.[0]?.text || '').trim()
  if (!aiText) throw new Error('Empty AI response')

  const cleaned   = aiText.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`No JSON found in: "${cleaned.slice(0,80)}"`)

  const p = JSON.parse(jsonMatch[0])
  return {
    merchant:    p.merchant    || '',
    date:        validateDate(p.date),
    amount:      parseFloat(p.amount) || 0,
    currency:    p.currency    || 'MYR',
    category:    CATEGORIES.includes(p.category) ? p.category : 'others',
    description: p.description || '',
    confidence:  p.confidence  || 'medium',
    source:      'claude',
  }
}

// ── Fallback: Free Tesseract OCR ─────────────────────────────
async function extractWithOCR(file, onProgress) {
  const rawText = await extractTextFromImage(file, onProgress)
  console.log('[Tesseract] raw text:', rawText.slice(0, 300))
  const result  = parseReceiptText(rawText)
  return { ...result, source: 'ocr' }
}

// ── Main export: tries Claude, falls back to OCR ─────────────
export async function extractReceiptData(base64Data, mimeType, filename = '', file = null, onProgress = null) {
  // ── Compress image if too large ──
  let finalBase64 = base64Data
  let finalMime   = mimeType

  if (file && file.type !== 'application/pdf') {
    try {
      const compressed = await compressImage(file)
      finalBase64 = compressed.base64
      finalMime   = compressed.mimeType
    } catch (e) {
      console.warn('[Compress] Failed, using original:', e.message)
    }
  }

  // ── Try Claude first ──
  try {
    const result = await extractWithClaude(finalBase64, finalMime, filename)
    console.log('[Extraction] ✓ Claude succeeded')
    return result
  } catch (claudeErr) {
    const msg = claudeErr.message || ''
    console.warn('[Extraction] Claude failed:', msg)

    const shouldFallback =
      isBalanceError(msg)      ||   // low credits
      msg.startsWith('network')  ||   // offline / CORS
      msg.includes('502')        ||   // worker down
      msg.includes('503')        ||   // overloaded
      msg.includes('Empty AI')   ||   // empty response
      msg.includes('No JSON')         // parse failure

    if (!shouldFallback) {
      // Hard error (bad key, wrong config) — surface it directly
      throw claudeErr
    }

    // ── Fallback to free OCR ──
    if (!file) {
      throw new Error(`AI unavailable (${msg.slice(0,60)})`)
    }

    console.log('[Extraction] Falling back to Tesseract OCR…')
    try {
      const ocrResult = await extractWithOCR(file, onProgress)
      ocrResult._fallbackReason = msg   // so UI can show "used OCR"
      return ocrResult
    } catch (ocrErr) {
      throw new Error(`Both AI and OCR failed.\nAI: ${msg.slice(0,80)}\nOCR: ${ocrErr.message}`)
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────
function validateDate(str) {
  if (!str) return new Date().toISOString().split('T')[0]
  const m = str.match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? str.slice(0,10) : new Date().toISOString().split('T')[0]
}

export function getMimeType(filename) {
  const ext = (filename||'').split('.').pop().toLowerCase()
  return { jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',
           gif:'image/gif',webp:'image/webp',heic:'image/heic',
           bmp:'image/bmp',pdf:'application/pdf' }[ext] || 'image/jpeg'
}

export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
