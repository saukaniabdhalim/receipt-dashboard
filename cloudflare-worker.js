// ─────────────────────────────────────────────────────────────
// Resit Dashboard — Cloudflare Worker Proxy
//
// Routes:
//   POST /          → Claude AI proxy
//   POST /telegram  → Telegram bot (send receipt photo + caption)
//
// Secrets to set in Cloudflare Worker:
//   ANTHROPIC_API_KEY   — from console.anthropic.com
//   TELEGRAM_BOT_TOKEN  — from @BotFather on Telegram
//   TELEGRAM_CHAT_ID    — your group chat ID (e.g. -1001234567890)
// ─────────────────────────────────────────────────────────────

const ALLOWED_ORIGIN = 'https://saukaniabdhalim.github.io'
const ANTHROPIC_API  = 'https://api.anthropic.com/v1/messages'

const CORS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age':       '86400',
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  })
}

export default {
  async fetch(request, env) {

    // ── CORS preflight ──────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST requests only' }, 405)
    }

    const url      = new URL(request.url)
    const pathname = url.pathname.replace(/\/+$/, '') || '/'

    // ── Route: /telegram ────────────────────────────────────
    if (pathname === '/telegram') {
      return handleTelegram(request, env)
    }

    // ── Route: / (default) → Claude AI ─────────────────────
    return handleClaude(request, env)
  }
}

// ── Claude AI handler ────────────────────────────────────────
async function handleClaude(request, env) {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: { message: 'ANTHROPIC_API_KEY secret not set' } }, 500)
  }

  let body
  try { body = await request.json() }
  catch { return json({ error: { message: 'Invalid JSON body' } }, 400) }

  let res
  try {
    res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body)
    })
  } catch (e) {
    return json({ error: { message: `Anthropic unreachable: ${e.message}` } }, 502)
  }

  const text = await res.text()
  return new Response(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  })
}

// ── Telegram handler ─────────────────────────────────────────
async function handleTelegram(request, env) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return json({ error: 'TELEGRAM_BOT_TOKEN secret not set in Cloudflare Worker' }, 500)
  }
  if (!env.TELEGRAM_CHAT_ID) {
    return json({ error: 'TELEGRAM_CHAT_ID secret not set in Cloudflare Worker' }, 500)
  }

  let body
  try { body = await request.json() }
  catch { return json({ error: 'Invalid JSON body' }, 400) }

  const { image, mimeType = 'image/jpeg', caption = '🧾 New Receipt' } = body

  if (!image) {
    return json({ error: 'Missing image field (base64 string)' }, 400)
  }

  // Convert base64 → binary blob
  const binaryStr = atob(image)
  const bytes     = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
  const blob = new Blob([bytes], { type: mimeType })

  // Build filename from mime type
  const ext      = mimeType.split('/')[1]?.replace('jpeg','jpg') || 'jpg'
  const filename = `receipt-${Date.now()}.${ext}`

  // Send to Telegram
  const form = new FormData()
  form.append('chat_id',    env.TELEGRAM_CHAT_ID)
  form.append('caption',    caption)
  form.append('parse_mode', 'Markdown')
  form.append('photo',      blob, filename)

  let tgRes
  try {
    tgRes = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`,
      { method: 'POST', body: form }
    )
  } catch (e) {
    return json({ error: `Telegram unreachable: ${e.message}` }, 502)
  }

  const tgData = await tgRes.json()

  if (!tgRes.ok || !tgData.ok) {
    return json({ error: tgData.description || `Telegram error ${tgRes.status}` }, tgRes.status)
  }

  return json({ ok: true, message_id: tgData.result?.message_id })
}
