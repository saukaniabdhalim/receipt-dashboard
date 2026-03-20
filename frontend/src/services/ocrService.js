// ─────────────────────────────────────────────────────────────
// Free OCR fallback using Tesseract.js
// Runs 100% in the browser — no API key needed
// Used when Anthropic balance is low or unavailable
// ─────────────────────────────────────────────────────────────

// Tesseract.js loaded from CDN at runtime (no npm install needed)
let tesseractLoaded = false

async function loadTesseract() {
  if (tesseractLoaded || (typeof window !== 'undefined' && window.Tesseract)) { tesseractLoaded = true; return }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.4/tesseract.min.js'
    script.onload  = () => { tesseractLoaded = true; resolve() }
    script.onerror = () => reject(new Error('Failed to load Tesseract.js'))
    document.head.appendChild(script)
  })
}

/**
 * Extract text from an image file using Tesseract OCR
 * @param {File} file
 * @param {function} onProgress  - optional callback (0-100)
 * @returns {string} raw extracted text
 */
export async function extractTextFromImage(file, onProgress) {
  await loadTesseract()

  const worker = await window.Tesseract.createWorker('eng', 1, {
    logger: m => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100))
      }
    }
  })

  const url = URL.createObjectURL(file)
  const { data: { text } } = await worker.recognize(url)
  await worker.terminate()
  URL.revokeObjectURL(url)
  return text
}

/**
 * Parse raw OCR text into structured receipt data
 * Handles common Malaysian receipt formats
 */
export function parseReceiptText(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  const fullText = rawText.toUpperCase()

  // ── Merchant: first non-empty meaningful line ──
  const merchant = findMerchant(lines)

  // ── Amount: look for TOTAL, GRAND TOTAL, JUMLAH ──
  const amount = findAmount(lines)

  // ── Date ──
  const date = findDate(rawText)

  // ── Category: keyword matching ──
  const category = guessCategory(fullText, merchant)

  // ── Description ──
  const description = merchant ? `Purchase at ${merchant}` : 'Receipt scan'

  return {
    merchant,
    date,
    amount,
    currency: 'MYR',
    category,
    description,
    confidence: assessConfidence(merchant, amount, date),
    ocrRawText: rawText,  // keep for debugging
  }
}

// ── Helpers ───────────────────────────────────────────────────

function findMerchant(lines) {
  // Skip very short lines, lines that are all numbers/symbols
  for (const line of lines.slice(0, 8)) {
    const clean = line.replace(/[^a-zA-Z0-9 &'.-]/g, '').trim()
    if (clean.length > 3 && !/^\d+$/.test(clean)) {
      return clean.slice(0, 60)
    }
  }
  return ''
}

function findAmount(lines) {
  // Priority keywords for total amount
  const totalKeywords = [
    /(?:grand\s*total|jumlah\s*besar|total\s*bayar|total\s*due|amount\s*due)[^\d]*(\d+[.,]\d{2})/i,
    /(?:^|\s)total[^\d]*(\d+[.,]\d{2})/i,
    /(?:jumlah|amount)[^\d]*(\d+[.,]\d{2})/i,
    /(?:rm|myr)\s*(\d+[.,]\d{2})/i,
  ]

  const fullText = lines.join('\n')

  for (const pattern of totalKeywords) {
    const match = fullText.match(pattern)
    if (match) {
      const num = parseFloat(match[1].replace(',', '.'))
      if (num > 0 && num < 100000) return num
    }
  }

  // Fallback: find the largest RM amount on any line
  const amounts = []
  for (const line of lines) {
    const matches = line.matchAll(/(?:rm\s*)?(\d{1,6}[.,]\d{2})/gi)
    for (const m of matches) {
      const val = parseFloat(m[1].replace(',', '.'))
      if (val > 0 && val < 100000) amounts.push(val)
    }
  }
  // Return max (usually the total)
  return amounts.length ? Math.max(...amounts) : 0
}

function findDate(text) {
  const patterns = [
    // DD/MM/YYYY or DD-MM-YYYY
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
    // YYYY-MM-DD
    /(\d{4})-(\d{2})-(\d{2})/,
    // DD MMM YYYY  e.g. 15 Mar 2025
    /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{4})/i,
    // DD/MM/YY
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})\b/,
  ]

  const monthMap = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 }

  for (const p of patterns) {
    const m = text.match(p)
    if (!m) continue

    let year, month, day

    if (p.source.includes('jan|feb')) {
      day   = parseInt(m[1])
      month = monthMap[m[2].toLowerCase().slice(0,3)]
      year  = parseInt(m[3])
    } else if (m[1].length === 4) {
      // YYYY-MM-DD
      year=parseInt(m[1]); month=parseInt(m[2]); day=parseInt(m[3])
    } else {
      day=parseInt(m[1]); month=parseInt(m[2]); year=parseInt(m[3])
      if (year < 100) year += 2000
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000 && year <= 2099) {
      return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    }
  }

  return new Date().toISOString().split('T')[0]
}

function guessCategory(upperText, merchant) {
  const upper = (upperText + ' ' + merchant).toUpperCase()

  const rules = [
    ['toll',          ['PLUS','TOUCH N GO','TNG','HIGHWAY','LEBUHRAYA','TOLL']],
    ['transport',     ['PETRONAS','PETRON','SHELL','CALTEX','BHP','GRAB','MYCAR','TAXI','PETROL','MINYAK','LRT','MRT','KTM','BUS']],
    ['grocery',       ['TESCO','LOTUS','GIANT','AEON','MYDIN','JAYA GROCER','VILLAGE GROCER','COLD STORAGE','SUPERMARKET','PASAR']],
    ['food',          ['MCDONALDS','KFC','PIZZA','MAMAK','RESTAURANT','RESTORAN','CAFE','KEDAI MAKAN','STARBUCKS','SUBWAY','NANDOS']],
    ['utilities',     ['TNB','SYABAS','INDAH WATER','MAXIS','CELCOM','DIGI','UMOBILE','UNIFI','STREAMYX','TELEKOM']],
    ['healthcare',    ['KLINIK','CLINIC','HOSPITAL','PHARMACY','FARMASI','GUARDIAN','WATSONS','CARING']],
    ['shopping',      ['UNIQLO','H&M','ZARA','COTTON ON','MR DIY','PARKSON','JUSCO','SOGO','ISETAN','ZALORA']],
    ['entertainment', ['CINEMA','GSC','TGV','MBO','NETFLIX','SPOTIFY','STEAM','GAMING']],
    ['education',     ['POPULAR','MPH','BOOK','TUITION','SCHOOL','COLLEGE','UNIVERSITY']],
  ]

  for (const [cat, keywords] of rules) {
    if (keywords.some(k => upper.includes(k))) return cat
  }

  return 'others'
}

function assessConfidence(merchant, amount, date) {
  let score = 0
  if (merchant && merchant.length > 3) score++
  if (amount > 0) score++
  if (date && date !== new Date().toISOString().split('T')[0]) score++
  return score === 3 ? 'medium' : score >= 2 ? 'low' : 'low'
}
