// ─────────────────────────────────────────────────────────────
// AI Receipt Extraction via Cloudflare Worker proxy
// Images compressed client-side before sending (max 500KB / 1024px)
// Fallback: Tesseract.js free OCR
// ─────────────────────────────────────────────────────────────

import { extractTextFromImage, parseReceiptText } from './ocrService.js'

const PROXY_URL    = 'https://spring-art-d63a.saukanihalim.workers.dev/'
const MAX_BYTES    = 500 * 1024   // 500KB max — Cloudflare free tier safe
const MAX_DIMENSION = 1024        // max width/height px

const CATEGORIES = [
  'food','transport','toll','utilities','shopping',
  'healthcare','entertainment','grocery','education','others'
]

const SYSTEM_PROMPT = `You are a receipt data extractor.
Given a receipt image, return ONLY a raw JSON object — no explanation, no markdown, no code fences.

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
- date: YYYY-MM-DD. Use 2026 if year not visible.
- amount: grand total as a plain number, no RM symbol.
- currency: MYR for Malaysian receipts.
- category: one of: food, transport, toll, utilities, shopping, healthcare, entertainment, grocery, education, others.
- confidence: high / medium / low.
- null for unknown fields.
- Return ONLY the JSON object. Nothing else.`

// ── Image compression ─────────────────────────────────────────
export async function compressForUpload(file) {
  if (file.type === 'application/pdf') {
    const b64 = await readFileAsBase64(file)
    return { base64: b64, mimeType: 'application/pdf' }
  }

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      // Calculate dimensions — cap at MAX_DIMENSION
      let w = img.width
      let h = img.height
      if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)

      // Reduce quality until under MAX_BYTES
      let quality = 0.8
      let dataUrl = canvas.toDataURL('image/jpeg', quality)

      while (dataUrl.length * 0.75 > MAX_BYTES && quality > 0.2) {
        quality -= 0.1
        dataUrl = canvas.toDataURL('image/jpeg', quality)
      }

      const base64 = dataUrl.split(',')[1]
      const sizeKB  = Math.round(base64.length * 0.75 / 1024)
      console.log(`[Compress] ${Math.round(file.size/1024)}KB → ${sizeKB}KB (q${quality.toFixed(1)}, ${w}×${h})`)

      resolve({ base64, mimeType: 'image/jpeg' })
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      // Fallback — send original
      readFileAsBase64(file).then(b64 =>
        resolve({ base64: b64, mimeType: file.type || 'image/jpeg' })
      )
    }

    img.src = url
  })
}

// ── Claude via Worker ─────────────────────────────────────────
async function extractWithClaude(base64Data, mimeType, filename) {
  let response
  try {
    response = await fetch(PROXY_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 800,
        system:     SYSTEM_PROMPT,
        messages: [{
          role:    'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } },
            { type: 'text',  text: 'Extract receipt data. Return ONLY the JSON object.' }
          ]
        }]
      })
    })
  } catch (e) {
    throw new Error(`network:${e.message}`)
  }

  const rawText = await response.text()
  console.log('[Claude] status:', response.status, '| preview:', rawText.slice(0, 120))

  if (!response.ok) {
    let errMsg = `Proxy error ${response.status}`
    try { errMsg = JSON.parse(rawText)?.error?.message || errMsg } catch {}
    throw new Error(errMsg)
  }

  let envelope
  try { envelope = JSON.parse(rawText) } catch {
    throw new Error(`Invalid response: ${rawText.slice(0, 80)}`)
  }

  if (envelope.type === 'error' || envelope.error) {
    throw new Error(envelope.error?.message || String(envelope.error))
  }

  const aiText = (envelope.content?.[0]?.text || '').trim()
  if (!aiText) throw new Error('Empty AI response')

  const cleaned = aiText.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/,'').trim()
  const match   = cleaned.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`No JSON in response: "${cleaned.slice(0,60)}"`)

  const p = JSON.parse(match[0])
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

// ── Determine if error should fallback to OCR ─────────────────
function shouldFallback(msg = '') {
  const m = msg.toLowerCase()
  return m.includes('credit') || m.includes('billing') || m.includes('quota') ||
         m.includes('network') || m.includes('502') || m.includes('503') ||
         m.includes('529') || m.includes('402') || m.includes('empty') ||
         m.includes('no json') || m.includes('timed') || m.includes('overload')
}

// ── Free OCR fallback ─────────────────────────────────────────
async function extractWithOCR(file, onProgress) {
  const rawText = await extractTextFromImage(file, onProgress)
  console.log('[OCR] text:', rawText.slice(0, 200))
  const result  = parseReceiptText(rawText)
  return { ...result, source: 'ocr' }
}

// ── Main export ───────────────────────────────────────────────
export async function extractReceiptData(base64Data, mimeType, filename = '', file = null, onProgress = null) {

  // Always compress first — even if caller passed base64 already
  let finalBase64 = base64Data
  let finalMime   = mimeType

  if (file && file.type !== 'application/pdf') {
    try {
      const compressed = await compressForUpload(file)
      finalBase64 = compressed.base64
      finalMime   = compressed.mimeType
    } catch (e) {
      console.warn('[Compress] Failed:', e.message)
    }
  }

  // Try Claude
  try {
    return await extractWithClaude(finalBase64, finalMime, filename)
  } catch (claudeErr) {
    const msg = claudeErr.message || ''
    console.warn('[Claude] Failed:', msg)

    if (!shouldFallback(msg)) throw claudeErr

    // OCR fallback
    if (!file) throw new Error(`AI unavailable: ${msg.slice(0,80)}`)

    console.log('[OCR] Falling back to Tesseract…')
    try {
      const r = await extractWithOCR(file, onProgress)
      r._fallbackReason = msg
      return r
    } catch (ocrErr) {
      throw new Error(`AI: ${msg.slice(0,60)} | OCR: ${ocrErr.message}`)
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
