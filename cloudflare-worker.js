// ─────────────────────────────────────────────────────────────
// Resit Dashboard — Cloudflare Worker Proxy
// Paste this into your Cloudflare Worker editor
// Add secret: ANTHROPIC_API_KEY = your Anthropic key
// ─────────────────────────────────────────────────────────────

const ALLOWED_ORIGIN = 'https://saukaniabdhalim.github.io'
const ANTHROPIC_API  = 'https://api.anthropic.com/v1/messages'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age':       '86400',
}

export default {
  async fetch(request, env) {

    // ── CORS preflight ──
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    // ── Only allow POST ──
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed — send POST requests only' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      })
    }

    // ── Validate API key is configured ──
    if (!env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: { message: 'ANTHROPIC_API_KEY secret not set in Cloudflare Worker' } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      })
    }

    // ── Parse request body ──
    let body
    try {
      body = await request.json()
    } catch {
      return new Response(JSON.stringify({ error: { message: 'Invalid JSON in request body' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      })
    }

    // ── Forward to Anthropic ──
    let anthropicResponse
    try {
      anthropicResponse = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body)
      })
    } catch (fetchErr) {
      return new Response(JSON.stringify({ error: { message: `Failed to reach Anthropic: ${fetchErr.message}` } }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      })
    }

    // ── Pass response back to client ──
    const responseText = await anthropicResponse.text()

    return new Response(responseText, {
      status: anthropicResponse.status,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      }
    })
  }
}
