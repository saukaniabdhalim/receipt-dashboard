// ─────────────────────────────────────────────────────────────
// Resit Dashboard — Cloudflare Worker Proxy
//
// ALL secrets stored here — zero browser storage needed
//
// Secrets to set in Cloudflare Worker dashboard:
//   ANTHROPIC_API_KEY    — from console.anthropic.com
//   TELEGRAM_BOT_TOKEN   — from @BotFather on Telegram
//   TELEGRAM_CHAT_ID     — your group chat ID e.g. -5100461712
//   GITHUB_TOKEN         — GitHub PAT with Gists read/write
//   GITHUB_GIST_ID       — your resit-dashboard-data.json gist ID
//   AZURE_CLIENT_ID      — daa1d451-4d02-4bc7-a85e-bf0d58372c19
//
// Routes:
//   POST /               → Claude AI (receipt extraction)
//   POST /telegram       → Send photo to Telegram group
//   POST /gist/load      → Load receipts from GitHub Gist
//   POST /gist/save      → Save receipts to GitHub Gist
//   GET  /config         → Return public config (azure client id)
// ─────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age':       '86400',
}

const ANTHROPIC_API  = 'https://api.anthropic.com/v1/messages'
const GRAPH_BASE     = 'https://graph.microsoft.com/v1.0'
const GIST_FILENAME  = 'resit-dashboard-data.json'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  })
}

export default {
  async fetch(request, env) {

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    const pathname = new URL(request.url).pathname.replace(/\/+$/, '') || '/'

    // ── GET /config — returns public config to the app ───────
    if (request.method === 'GET' && pathname === '/config') {
      return json({
        azureClientId: env.AZURE_CLIENT_ID || '',
        gistConfigured: !!(env.GITHUB_TOKEN && env.GITHUB_GIST_ID),
        telegramConfigured: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
        anthropicConfigured: !!env.ANTHROPIC_API_KEY,
      })
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST requests only' }, 405)
    }

    // ── Route requests ───────────────────────────────────────
    if (pathname === '/telegram')   return handleTelegram(request, env)
    if (pathname === '/gist/load')  return handleGistLoad(env)
    if (pathname === '/gist/save')  return handleGistSave(request, env)
    return handleClaude(request, env)
  }
}

// ── Claude AI ─────────────────────────────────────────────────
async function handleClaude(request, env) {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: { message: 'ANTHROPIC_API_KEY not set in Worker secrets' } }, 500)
  }

  // Check content-length if available
  const contentLength = parseInt(request.headers.get('content-length') || '0')
  if (contentLength > 2 * 1024 * 1024) {  // 2MB limit
    return json({ error: { message: `Request too large (${Math.round(contentLength/1024)}KB). Image must be under 2MB.` } }, 413)
  }

  let body
  try { body = await request.json() }
  catch { return json({ error: { message: 'Invalid JSON' } }, 400) }

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

// ── Telegram ──────────────────────────────────────────────────
async function handleTelegram(request, env) {
  if (!env.TELEGRAM_BOT_TOKEN) return json({ error: 'TELEGRAM_BOT_TOKEN not set' }, 500)
  if (!env.TELEGRAM_CHAT_ID)   return json({ error: 'TELEGRAM_CHAT_ID not set' }, 500)

  let body
  try { body = await request.json() }
  catch { return json({ error: 'Invalid JSON' }, 400) }

  const { image, mimeType = 'image/jpeg', caption = '🧾 New Receipt' } = body
  if (!image) return json({ error: 'Missing image field' }, 400)

  const binaryStr = atob(image)
  const bytes     = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

  const ext  = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
  const form = new FormData()
  form.append('chat_id',    env.TELEGRAM_CHAT_ID)
  form.append('caption',    caption)
  form.append('parse_mode', 'Markdown')
  form.append('photo',      new Blob([bytes], { type: mimeType }), `receipt-${Date.now()}.${ext}`)

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

// ── GitHub Gist: Load ─────────────────────────────────────────
async function handleGistLoad(env) {
  if (!env.GITHUB_TOKEN)   return json({ error: 'GITHUB_TOKEN not set' }, 500)
  if (!env.GITHUB_GIST_ID) return json({ error: 'GITHUB_GIST_ID not set' }, 500)

  const res = await fetch(`https://api.github.com/gists/${env.GITHUB_GIST_ID}`, {
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept':        'application/vnd.github+json',
      'User-Agent':    'ResitDashboard/1.0',
    }
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return json({ error: err.message || `GitHub error ${res.status}` }, res.status)
  }

  const data    = await res.json()
  const content = data.files?.[GIST_FILENAME]?.content || '{"receipts":[]}'

  try {
    const parsed = JSON.parse(content)
    return json({ receipts: parsed.receipts || [], updatedAt: parsed.updatedAt })
  } catch {
    return json({ receipts: [] })
  }
}

// ── GitHub Gist: Save ─────────────────────────────────────────
async function handleGistSave(request, env) {
  if (!env.GITHUB_TOKEN)   return json({ error: 'GITHUB_TOKEN not set' }, 500)
  if (!env.GITHUB_GIST_ID) return json({ error: 'GITHUB_GIST_ID not set' }, 500)

  let body
  try { body = await request.json() }
  catch { return json({ error: 'Invalid JSON' }, 400) }

  const { receipts } = body
  if (!Array.isArray(receipts)) return json({ error: 'receipts must be an array' }, 400)

  const res = await fetch(`https://api.github.com/gists/${env.GITHUB_GIST_ID}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept':        'application/vnd.github+json',
      'Content-Type':  'application/json',
      'User-Agent':    'ResitDashboard/1.0',
    },
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify({
            receipts,
            updatedAt: new Date().toISOString(),
            count: receipts.length
          }, null, 2)
        }
      }
    })
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return json({ error: err.message || `GitHub error ${res.status}` }, res.status)
  }

  return json({ ok: true, count: receipts.length })
}
