import { extractTextFromImage, parseReceiptText } from './ocrService.js'

const PROXY_URL = 'https://spring-art-d63a.saukanihalim.workers.dev/'

const CATEGORIES = [
  'food','transport','toll','utilities','shopping',
  'healthcare','entertainment','grocery','education','others'
]

// ── Detect mobile ─────────────────────────────────────────────
const isMobile = () => /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

// ── Compress image ────────────────────────────────────────────
export async function compressForUpload(file) {
  if (file.type === 'application/pdf') {
    const b64 = await readFileAsBase64(file)
    return { base64: b64, mimeType: 'application/pdf', blob: file }
  }

  const mobile  = isMobile()
  const maxDim   = mobile ? 600  : 1024
  const maxBytes = mobile ? 80 * 1024 : 350 * 1024  // 80KB mobile!

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      let w = img.width, h = img.height
      if (w > maxDim || h > maxDim) {
        const r = Math.min(maxDim/w, maxDim/h)
        w = Math.round(w*r); h = Math.round(h*r)
      }

      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)

      let quality = mobile ? 0.6 : 0.8
      let dataUrl = canvas.toDataURL('image/jpeg', quality)

      while (dataUrl.length * 0.75 > maxBytes && quality > 0.1) {
        quality -= 0.1
        dataUrl  = canvas.toDataURL('image/jpeg', quality)
      }

      const base64 = dataUrl.split(',')[1]
      const sizeKB  = Math.round(base64.length * 0.75 / 1024)
      console.log(`[Compress] ${Math.round(file.size/1024)}KB → ${sizeKB}KB ${w}×${h} q${quality.toFixed(1)} mobile=${mobile}`)

      // Also create a Blob for FormData upload
      const byteArr = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const blob    = new Blob([byteArr], { type: 'image/jpeg' })

      resolve({ base64, mimeType: 'image/jpeg', blob })
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      readFileAsBase64(file).then(b64 => {
        const byteArr = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
        resolve({ base64: b64, mimeType: file.type || 'image/jpeg', blob: new Blob([byteArr], { type: file.type || 'image/jpeg' }) })
      })
    }
    img.src = url
  })
}

// ── Claude via Worker ─────────────────────────────────────────
async function extractWithClaude(compressed, filename) {
  const mobile = isMobile()
  let response

  if (mobile) {
    // ── Mobile: send as multipart/form-data (bypasses WAF) ──
    console.log('[Claude] Mobile → sending as multipart/form-data')
    const form = new FormData()
    form.append('image',    compressed.blob, filename || 'receipt.jpg')
    form.append('mime',     compressed.mimeType)
    form.append('filename', filename || 'receipt.jpg')

    try {
      response = await fetch(PROXY_URL, { method: 'POST', body: form })
    } catch (e) { throw new Error(`network:${e.message}`) }

  } else {
    // ── Desktop: send as JSON ────────────────────────────────
    console.log('[Claude] Desktop → sending as JSON')
    try {
      response = await fetch(PROXY_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:      'claude-sonnet-4-20250514',
          max_tokens: 800,
          system: `You are a receipt data extractor.
Return ONLY a raw JSON object — no explanation, no markdown, no code fences.
{"merchant":"store","date":"YYYY-MM-DD","amount":12.50,"currency":"MYR","category":"food","description":"desc","confidence":"high"}
category: food|transport|toll|utilities|shopping|healthcare|entertainment|grocery|education|others
Return ONLY JSON.`,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: compressed.mimeType, data: compressed.base64 } },
              { type: 'text',  text: 'Extract receipt data. Return ONLY the JSON object.' }
            ]
          }]
        })
      })
    } catch (e) { throw new Error(`network:${e.message}`) }
  }

  const rawText = await response.text()
  console.log('[Claude] status:', response.status, '| preview:', rawText.slice(0,150))

  if (!response.ok) {
    let msg = `Proxy error ${response.status}: ${response.statusText || 'Not allowed'}`
    try { 
      const parsed = JSON.parse(rawText)
      msg = parsed.error?.message || parsed.error || msg 
    } catch {}
    throw new Error(msg)
  }

  let envelope
  try { envelope = JSON.parse(rawText) } catch {
    throw new Error(`Bad response: ${rawText.slice(0,80)}`)
  }

  if (envelope.type === 'error' || envelope.error) {
    throw new Error(envelope.error?.message || String(envelope.error))
  }

  const aiText = (envelope.content?.[0]?.text || '').trim()
  if (!aiText) throw new Error('Empty AI response')

  const cleaned = aiText.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/,'').trim()
  const match   = cleaned.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`No JSON: "${cleaned.slice(0,60)}"`)

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

function shouldFallback(msg = '') {
  const m = msg.toLowerCase()
  return m.includes('credit') || m.includes('billing') || m.includes('quota') ||
         m.includes('network') || m.includes('502') || m.includes('503') ||
         m.includes('empty') || m.includes('no json') || m.includes('overload')
}

async function extractWithOCR(file, onProgress) {
  const rawText = await extractTextFromImage(file, onProgress)
  return { ...parseReceiptText(rawText), source: 'ocr' }
}

// ── Main ──────────────────────────────────────────────────────
export async function extractReceiptData(base64Data, mimeType, filename = '', file = null, onProgress = null) {
  // Always compress first
  let compressed = { base64: base64Data, mimeType, blob: null }

  if (file && file.type !== 'application/pdf') {
    try {
      compressed = await compressForUpload(file)
    } catch (e) { console.warn('[Compress]', e.message) }
  }

  try {
    return await extractWithClaude(compressed, filename)
  } catch (claudeErr) {
    const msg = claudeErr.message || ''
    console.warn('[Claude] Failed:', msg)
    if (!shouldFallback(msg)) throw claudeErr
    if (!file) throw new Error(`AI unavailable: ${msg.slice(0,80)}`)
    try {
      const r = await extractWithOCR(file, onProgress)
      r._fallbackReason = msg
      return r
    } catch (ocrErr) {
      throw new Error(`AI: ${msg.slice(0,60)} | OCR: ${ocrErr.message}`)
    }
  }
}

function validateDate(str) {
  if (!str) return localDate()
  const m = str.match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? str.slice(0,10) : localDate()
}
function localDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
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
