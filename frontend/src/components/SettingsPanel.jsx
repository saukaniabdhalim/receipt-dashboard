import React, { useState, useEffect } from 'react'
import { getWorkerConfig } from '../services/gistStorage.js'
import { Github, Cloud, Send, CheckCircle, XCircle, Loader, ExternalLink, RefreshCw } from 'lucide-react'

const WORKER_URL = 'https://spring-art-d63a.saukanihalim.workers.dev'

export default function SettingsPanel() {
  const [config,  setConfig]  = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const loadConfig = async () => {
    setLoading(true); setError(null)
    try {
      const cfg = await getWorkerConfig()
      setConfig(cfg)
    } catch (e) {
      setError('Cannot reach Cloudflare Worker — check it is deployed')
    }
    setLoading(false)
  }

  useEffect(() => { loadConfig() }, [])

  const items = config ? [
    {
      icon: Github,
      label: 'GitHub Gist Storage',
      description: 'Receipts saved permanently to private Gist',
      secret: 'GITHUB_TOKEN + GITHUB_GIST_ID',
      ok: config.gistConfigured,
    },
    {
      icon: Cloud,
      label: 'OneDrive Upload',
      description: 'Receipt images uploaded to your OneDrive /receipts folder',
      secret: 'AZURE_CLIENT_ID + AZURE_TENANT_ID',
      ok: !!config.azureClientId,
    },
    {
      icon: Send,
      label: 'Telegram Notifications',
      description: 'Receipt photo + details sent to ResitApaHarini group',
      secret: 'TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID',
      ok: config.telegramConfigured,
    },
    {
      icon: () => <span style={{fontSize:14}}>🤖</span>,
      label: 'Claude AI (Receipt Extraction)',
      description: 'AI reads receipt images and extracts data automatically',
      secret: 'ANTHROPIC_API_KEY',
      ok: config.anthropicConfigured,
    },
  ] : []

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, maxWidth:600 }}>

      {/* Header */}
      <div style={{
        padding:'14px 16px', background:'var(--bg-card)',
        border:'1px solid var(--border)', borderRadius:'var(--radius)',
        display:'flex', alignItems:'center', justifyContent:'space-between', gap:12
      }}>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', marginBottom:3 }}>
            ⚙️ All secrets stored in Cloudflare Worker
          </div>
          <div style={{ fontSize:12, color:'var(--text-muted)' }}>
            Zero configuration needed in the browser — just add secrets to your Worker once and it works on every device automatically.
          </div>
        </div>
        <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer"
          style={{ ...btnStyle('#f5a623'), textDecoration:'none', flexShrink:0 }}>
          <ExternalLink size={12}/> Open Worker
        </a>
      </div>

      {/* Status */}
      {loading && (
        <div style={{ display:'flex', alignItems:'center', gap:8, color:'var(--text-muted)', fontSize:13, padding:'16px' }}>
          <Loader size={14} style={{animation:'spin 1s linear infinite'}}/> Checking Worker status…
        </div>
      )}

      {error && (
        <div style={{ padding:'12px 16px', background:'#1a0a0a', border:'1px solid #ef444430', borderRadius:'var(--radius)', fontSize:13, color:'#ef4444' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Config items */}
      {config && items.map((item, i) => {
        const Icon = item.icon
        return (
          <div key={i} style={{
            display:'flex', alignItems:'flex-start', gap:14, padding:'14px 16px',
            background:'var(--bg-card)', border:`1px solid ${item.ok ? '#22c55e20' : '#ef444420'}`,
            borderRadius:'var(--radius)',
          }}>
            <div style={{
              width:36, height:36, borderRadius:8, flexShrink:0,
              background: item.ok ? '#22c55e12' : '#ef444412',
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <Icon size={16} color={item.ok ? '#22c55e' : '#ef4444'} />
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                <span style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>{item.label}</span>
                {item.ok
                  ? <span style={badge('#22c55e')}><CheckCircle size={9}/> Configured</span>
                  : <span style={badge('#ef4444')}><XCircle size={9}/> Missing</span>
                }
              </div>
              <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:4 }}>{item.description}</div>
              {!item.ok && (
                <div style={{ fontSize:11, color:'var(--text-dim)' }}>
                  Add secret: <code style={codeStyle}>{item.secret}</code> in your Cloudflare Worker
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* How to add secrets */}
      {config && items.some(i => !i.ok) && (
        <div style={{ padding:'14px 16px', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius)' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-primary)', marginBottom:8 }}>
            How to add missing secrets
          </div>
          <ol style={{ paddingLeft:18, display:'flex', flexDirection:'column', gap:4, fontSize:12, color:'var(--text-muted)' }}>
            <li>Go to <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer" style={{color:'#f5a623'}}>dash.cloudflare.com</a> → Workers & Pages → your worker</li>
            <li>Click <strong style={{color:'var(--text-primary)'}}>Settings → Variables → Add secret</strong></li>
            <li>Add the missing secret name and value → Deploy</li>
            <li>Come back and click <strong style={{color:'var(--text-primary)'}}>Refresh</strong> below to verify</li>
          </ol>
        </div>
      )}

      {/* Worker URL info */}
      <div style={{ padding:'12px 14px', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', fontSize:11, color:'var(--text-dim)' }}>
        Worker URL: <code style={{...codeStyle, color:'var(--accent)'}}>{WORKER_URL}</code>
      </div>

      <button onClick={loadConfig} style={{ ...btnStyle('#6b82a8'), alignSelf:'flex-start' }}>
        <RefreshCw size={12}/> Refresh Status
      </button>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}

const btnStyle = (color) => ({
  display:'flex', alignItems:'center', gap:5, padding:'8px 14px',
  background:`${color}15`, border:`1px solid ${color}40`, color,
  borderRadius:8, cursor:'pointer', fontFamily:'Sora', fontWeight:600, fontSize:12,
})
const badge = (color) => ({
  display:'inline-flex', alignItems:'center', gap:3,
  fontSize:9, padding:'2px 6px', borderRadius:20, fontWeight:700,
  background:`${color}15`, color, border:`1px solid ${color}25`,
})
const codeStyle = {
  background:'var(--bg-primary)', padding:'1px 5px',
  borderRadius:4, fontSize:10, fontFamily:'JetBrains Mono',
}
