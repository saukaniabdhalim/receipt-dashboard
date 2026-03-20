// ─────────────────────────────────────────────────────────────
// Resit Dashboard — Cloudflare Worker
//
// KEY FIX: Claude extraction endpoint now accepts multipart/form-data
// instead of JSON — bypasses Cloudflare WAF which blocks large
// base64 JSON bodies from mobile user-agents.
//
// Secrets:
//   ANTHROPIC_API_KEY
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_CHAT_ID
//   GITHUB_TOKEN
//   GITHUB_GIST_ID
//   AZURE_CLIENT_ID
//   AZURE_TENANT_ID
// ─────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Origin, Accept, User-Agent, X-Requested-With',
  'Access-Control-Max-Age':       '86400',
}

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const GIST_FILENAME = 'resit-dashboard-data.json'
const GRAPH_AUDIENCE = '00000003-0000-0000-c000-000000000000'

function decodeBase64Url(segment) {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padLength = (4 - (normalized.length % 4)) % 4
  return atob(normalized + '='.repeat(padLength))
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  })
}

// ── JWKS cache (module-level, survives warm Worker instances) ──
let _jwksCache = null
let _jwksCacheTime = 0
const JWKS_TTL_MS = 60 * 60 * 1000 // 1 hour

async function getJwks(tenantId = 'common') {
  const now = Date.now()
  if (_jwksCache && (now - _jwksCacheTime) < JWKS_TTL_MS) return _jwksCache

  const url = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`)

  _jwksCache = await res.json()
  _jwksCacheTime = now
  return _jwksCache
}

function base64UrlToUint8Array(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// ── JWT Verification — full RS256 signature check via JWKS ────
async function verifyToken(request, env) {
  const auth = request.headers.get('Authorization')
  if (!auth || !auth.startsWith('Bearer ')) return false

  const token = auth.split(' ')[1]
  const parts = token.split('.')
  if (parts.length !== 3) return false

  try {
    // 1. Decode header + payload
    const header  = JSON.parse(decodeBase64Url(parts[0]))
    const payload = JSON.parse(decodeBase64Url(parts[1]))

    if (header.alg !== 'RS256') return false

    // 2. Expiry / not-before checks
    const now    = Date.now()
    const skewMs = 5 * 60 * 1000
    if (!payload.exp || payload.exp * 1000 < (now - skewMs)) return false
    if (payload.nbf && payload.nbf * 1000 > (now + skewMs)) return false

    // 3. Audience + caller checks
    // Accept tokens issued directly for this app (aud == AZURE_CLIENT_ID)
    // or Graph-scoped tokens issued by this client app (azp == AZURE_CLIENT_ID)
    const clientId = env.AZURE_CLIENT_ID
    if (!clientId) return false
    const aud = payload.aud
    if (!aud) return false

    if (aud !== clientId && aud !== GRAPH_AUDIENCE) return false
    if (aud === GRAPH_AUDIENCE) {
      const callerAppId = payload.azp || payload.appid
      if (callerAppId !== clientId) return false
    }

    // 4. RS256 signature verification via Microsoft JWKS
    const tenantId = env.AZURE_TENANT_ID || 'common'
    const jwks = await getJwks(tenantId)

    const jwk = jwks.keys?.find(k => k.kid === header.kid && k.use === 'sig')
    if (!jwk) {
      // kid mismatch — keys may have rotated, force a fresh fetch
      _jwksCache = null
      const freshJwks = await getJwks(tenantId)
      const freshJwk = freshJwks.keys?.find(k => k.kid === header.kid && k.use === 'sig')
      if (!freshJwk) return false
      return await verifyRs256(parts, freshJwk)
    }

    return await verifyRs256(parts, jwk)

  } catch (e) {
    console.error('[JWT verify]', e.message)
    return false
  }
}

async function verifyRs256(parts, jwk) {
  // Import the RSA public key
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } },
    false,
    ['verify']
  )

  // Signing input is the raw "header.payload" bytes
  const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  const signature    = base64UrlToUint8Array(parts[2])

  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signingInput)
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    const pathname = new URL(request.url).pathname.replace(/\/+$/, '') || '/'

    // ── Security Guard ──
    // Exempt /config (public) and OPTIONS (CORS preflight)
    if (pathname !== '/config' && request.method !== 'OPTIONS') {
      const isAuth = await verifyToken(request, env)
      if (!isAuth) {
        return json({ error: 'Unauthorized. Please sign in.' }, 401)
      }
    }

    // GET /config
    if (request.method === 'GET' && pathname === '/config') {
      return json({
        azureClientId:       env.AZURE_CLIENT_ID      || '',
        azureTenantId:       env.AZURE_TENANT_ID      || '',
        gistConfigured:      !!(env.GITHUB_TOKEN && env.GITHUB_GIST_ID),
        telegramConfigured:  !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
        anthropicConfigured: !!env.ANTHROPIC_API_KEY,
      })
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405)
    }

    if (pathname === '/telegram')   return handleTelegram(request, env)
    if (pathname === '/gist/load')  return handleGistLoad(env)
    if (pathname === '/gist/save')  return handleGistSave(request, env)

    // Default: Claude extraction
    return handleClaude(request, env)
  }
}

// ── Claude — accepts multipart OR json ───────────────────────
async function handleClaude(request, env) {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: { message: 'ANTHROPIC_API_KEY not set' } }, 500)
  }

  const contentType = (request.headers.get('content-type') || '').toLowerCase()
  let imageBase64, imageMime, filename

  if (contentType.includes('multipart/form-data')) {
    // ── Mobile path: image sent as binary form data ──────────
    let formData
    try { formData = await request.formData() }
    catch (e) { return json({ error: { message: `FormData parse failed: ${e.message}` } }, 400) }

    const imageFile = formData.get('image')
    imageMime       = formData.get('mime')   || 'image/jpeg'
    filename        = formData.get('filename') || 'receipt.jpg'

    if (!imageFile) return json({ error: { message: 'Missing image field in form data' } }, 400)

    // Convert binary blob → base64
    const arrayBuffer = await imageFile.arrayBuffer()
    const bytes       = new Uint8Array(arrayBuffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    imageBase64 = btoa(binary)

  } else {
    // ── Desktop path: full JSON body ─────────────────────────
    let body
    try { body = await request.json() }
    catch { return json({ error: { message: 'Invalid JSON body' } }, 400) }

    // If body is a direct Anthropic request, forward it as-is
    if (body.model && body.messages) {
      try {
        const res = await fetch(ANTHROPIC_API, {
          method: 'POST',
          headers: {
            'Content-Type':      'application/json',
            'x-api-key':         env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body)
        })
        const text = await res.text()
        return new Response(text, {
          status: res.status,
          headers: { 'Content-Type': 'application/json', ...CORS }
        })
      } catch (e) {
        return json({ error: { message: `Anthropic unreachable: ${e.message}` } }, 502)
      }
    }

    // Otherwise extract fields from our custom format
    imageBase64 = body.image
    imageMime   = body.mime     || 'image/jpeg'
    filename    = body.filename || 'receipt.jpg'
    if (!imageBase64) return json({ error: { message: 'Missing image field' } }, 400)
  }

  // Build Anthropic request
  const anthropicBody = {
    model:      'claude-sonnet-4-20250514',
    max_tokens: 800,
    system: `You are a receipt data extractor.
Return ONLY a raw JSON object — no explanation, no markdown, no code fences.
{"merchant":"store","date":"YYYY-MM-DD","amount":12.50,"currency":"MYR","category":"food","description":"desc","confidence":"high"}
category must be one of: food|transport|toll|utilities|shopping|healthcare|entertainment|grocery|education|others
Use null for unknown fields. Return ONLY JSON.`,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: imageMime, data: imageBase64 } },
        { type: 'text',  text: `Extract receipt data from this image (${filename}). Return ONLY the JSON object.` }
      ]
    }]
  }

  let res
  try {
    res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(anthropicBody)
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
  if (!image) return json({ error: 'Missing image' }, 400)

  const bin   = atob(image)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)

  const ext  = mimeType.split('/')[1]?.replace('jpeg','jpg') || 'jpg'
  const form = new FormData()
  form.append('chat_id',    env.TELEGRAM_CHAT_ID)
  form.append('caption',    caption)
  form.append('parse_mode', 'Markdown')
  form.append('photo', new Blob([bytes], { type: mimeType }), `receipt-${Date.now()}.${ext}`)

  let tgRes
  try {
    tgRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`,
      { method: 'POST', body: form })
  } catch (e) {
    return json({ error: `Telegram unreachable: ${e.message}` }, 502)
  }

  const tgData = await tgRes.json()
  if (!tgRes.ok || !tgData.ok) {
    return json({ error: tgData.description || `Telegram error ${tgRes.status}` }, tgRes.status)
  }
  return json({ ok: true, message_id: tgData.result?.message_id })
}

// ── Gist load ─────────────────────────────────────────────────
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
    return json({ error: err.message || `GitHub ${res.status}` }, res.status)
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

// ── Gist save ─────────────────────────────────────────────────
async function handleGistSave(request, env) {
  if (!env.GITHUB_TOKEN)   return json({ error: 'GITHUB_TOKEN not set' }, 500)
  if (!env.GITHUB_GIST_ID) return json({ error: 'GITHUB_GIST_ID not set' }, 500)

  let body
  try { body = await request.json() }
  catch { return json({ error: 'Invalid JSON' }, 400) }

  const { receipts } = body
  if (!Array.isArray(receipts)) return json({ error: 'receipts must be array' }, 400)

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
    return json({ error: err.message || `GitHub ${res.status}` }, res.status)
  }
  return json({ ok: true, count: receipts.length })
}
