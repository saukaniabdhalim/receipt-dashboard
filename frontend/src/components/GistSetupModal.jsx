import React, { useState } from 'react'
import {
  validateToken, findExistingGist, createGist,
  saveSettings, getSettings
} from '../services/gistStorage.js'
import { X, Github, Check, AlertCircle, Loader, ExternalLink, Eye, EyeOff } from 'lucide-react'

const STEPS = [
  {
    title: '1. Create a GitHub Token',
    body: (
      <div style={{ fontSize:13, color:'var(--text-muted)', lineHeight:1.8 }}>
        <ol style={{ paddingLeft:18, display:'flex', flexDirection:'column', gap:8 }}>
          <li>Go to <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer" style={linkStyle}>
            GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
          </a></li>
          <li>Set <strong style={{color:'var(--text-primary)'}}>Token name</strong>: <code style={codeStyle}>resit-dashboard</code></li>
          <li>Set <strong style={{color:'var(--text-primary)'}}>Expiration</strong>: No expiration (or 1 year)</li>
          <li>Under <strong style={{color:'var(--text-primary)'}}>Permissions → Account permissions</strong> → set <strong style={{color:'var(--text-primary)'}}>Gists</strong> to <strong style={{color:'#22c55e'}}>Read and write</strong></li>
          <li>Click <strong style={{color:'var(--text-primary)'}}>Generate token</strong> → copy it</li>
        </ol>
        <div style={{ marginTop:10, padding:'8px 12px', background:'#0a1a0f', borderRadius:6, border:'1px solid #22c55e30', fontSize:12 }}>
          💡 Only the <strong style={{color:'#22c55e'}}>Gists</strong> permission is needed — no access to your code repos.
        </div>
      </div>
    )
  }
]

export default function GistSetupModal({ onClose, onConnected }) {
  const [token,   setToken]   = useState('')
  const [showTok, setShowTok] = useState(false)
  const [status,  setStatus]  = useState(null)  // null | 'validating' | 'creating' | 'done' | 'error'
  const [error,   setError]   = useState('')
  const [user,    setUser]    = useState(null)

  const handleConnect = async () => {
    if (!token.trim()) return
    setStatus('validating')
    setError('')
    try {
      // 1. Validate token
      const ghUser = await validateToken(token.trim())
      setUser(ghUser)

      // 2. Look for existing Resit Gist
      setStatus('creating')
      let gistId = await findExistingGist(token.trim())

      if (gistId) {
        // Found existing — reuse it
      } else {
        // Create new private Gist
        // Temporarily save token to use in createGist
        saveSettings({ token: token.trim() })
        gistId = await createGist()
      }

      // 3. Save settings
      saveSettings({ token: token.trim(), gistId })
      setStatus('done')

      setTimeout(() => {
        onConnected({ user: ghUser, gistId })
        onClose()
      }, 1500)

    } catch (e) {
      setStatus('error')
      setError(e.message)
    }
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:300,
      display:'flex', alignItems:'center', justifyContent:'center',
      background:'rgba(0,0,0,0.75)', backdropFilter:'blur(4px)',
      padding:16, animation:'fadeIn 0.2s ease'
    }} onClick={e => { if (e.target===e.currentTarget) onClose() }}>
      <div style={{
        background:'var(--bg-card)', border:'1px solid var(--border)',
        borderRadius:16, width:'100%', maxWidth:520, maxHeight:'92vh',
        overflow:'auto', boxShadow:'var(--shadow-lg)', animation:'fadeUp 0.25s ease'
      }}>
        {/* Header */}
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
              <Github size={20} color="var(--text-primary)" />
              <h2 style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)' }}>
                Connect GitHub Gist Storage
              </h2>
            </div>
            <p style={{ fontSize:12, color:'var(--text-muted)' }}>
              Your receipts will be saved to a <strong style={{color:'var(--text-primary)'}}>private Gist</strong> — free forever, syncs across all your devices.
            </p>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', padding:4, flexShrink:0 }}>
            <X size={18}/>
          </button>
        </div>

        <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:20 }}>
          {/* Step instructions */}
          <div style={{ padding:'14px 16px', background:'var(--bg-input)', borderRadius:10, border:'1px solid var(--border)' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--text-primary)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>
              How to get your token
            </div>
            <div style={{ fontSize:13, color:'var(--text-muted)', lineHeight:1.8 }}>
              <ol style={{ paddingLeft:18, display:'flex', flexDirection:'column', gap:6 }}>
                <li>Open <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                  github.com/settings/tokens <ExternalLink size={10} style={{display:'inline',verticalAlign:'middle'}}/>
                </a></li>
                <li>Click <strong style={{color:'var(--text-primary)'}}>Generate new token (fine-grained)</strong></li>
                <li>Name: <code style={codeStyle}>resit-dashboard</code> · Expiration: <code style={codeStyle}>No expiration</code></li>
                <li>Scroll to <strong style={{color:'var(--text-primary)'}}>Account permissions</strong> → <strong style={{color:'var(--text-primary)'}}>Gists</strong> → set to <strong style={{color:'#22c55e'}}>Read and write</strong></li>
                <li>Click <strong style={{color:'var(--text-primary)'}}>Generate token</strong> → copy and paste below</li>
              </ol>
            </div>
            <div style={{ marginTop:10, padding:'8px 10px', background:'#0a1a0f', borderRadius:6, border:'1px solid #22c55e25', fontSize:11, color:'var(--text-muted)' }}>
              🔒 Only <strong style={{color:'#22c55e'}}>Gists</strong> permission needed — no access to your code repositories.
            </div>
          </div>

          {/* Token input */}
          <div>
            <label style={labelStyle}>Paste your GitHub Token</label>
            <div style={{ position:'relative' }}>
              <input
                type={showTok ? 'text' : 'password'}
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="github_pat_xxxxxxxxxxxxxxxxxxxx"
                style={{ ...inputStyle, width:'100%', paddingRight:40, fontFamily:'JetBrains Mono', fontSize:12 }}
              />
              <button onClick={() => setShowTok(v=>!v)}
                style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', padding:2 }}>
                {showTok ? <EyeOff size={14}/> : <Eye size={14}/>}
              </button>
            </div>
            <p style={{ fontSize:11, color:'var(--text-dim)', marginTop:5 }}>
              Stored only in your browser's localStorage — never sent anywhere except GitHub.
            </p>
          </div>

          {/* Error */}
          {status === 'error' && (
            <div style={{ display:'flex', gap:8, padding:'10px 12px', background:'#1a0a0a', border:'1px solid #ef444430', borderRadius:8 }}>
              <AlertCircle size={14} color="#ef4444" style={{ flexShrink:0, marginTop:1 }}/>
              <div style={{ fontSize:12, color:'#ef4444' }}>{error}</div>
            </div>
          )}

          {/* Success */}
          {status === 'done' && user && (
            <div style={{ display:'flex', gap:8, padding:'12px', background:'#0a1a0f', border:'1px solid #22c55e30', borderRadius:8, alignItems:'center' }}>
              <Check size={16} color="#22c55e"/>
              <div>
                <div style={{ fontSize:13, color:'#22c55e', fontWeight:600 }}>Connected as @{user.login}</div>
                <div style={{ fontSize:11, color:'var(--text-muted)' }}>Private Gist created — receipts will sync automatically</div>
              </div>
            </div>
          )}

          {/* Connect button */}
          <button
            onClick={handleConnect}
            disabled={!token.trim() || status === 'validating' || status === 'creating' || status === 'done'}
            style={{
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              padding:'11px', borderRadius:9, border:'none', cursor: (!token.trim() || status) ? 'not-allowed' : 'pointer',
              background: status === 'done' ? '#22c55e' : 'var(--accent)',
              color:'#000', fontFamily:'Sora', fontWeight:700, fontSize:14,
              opacity: (!token.trim() && status !== 'done') ? 0.5 : 1,
              transition:'all 0.2s'
            }}
          >
            {status === 'validating' && <><Loader size={14} style={{animation:'spin 1s linear infinite'}}/> Validating token…</>}
            {status === 'creating'   && <><Loader size={14} style={{animation:'spin 1s linear infinite'}}/> Creating Gist…</>}
            {status === 'done'       && <><Check size={14}/> Connected!</>}
            {(!status || status === 'error') && <><Github size={14}/> Connect GitHub Gist</>}
          </button>
        </div>

        <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      </div>
    </div>
  )
}

const labelStyle  = { display:'block', fontSize:12, fontWeight:600, color:'var(--text-muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.04em' }
const inputStyle  = { background:'var(--bg-input)', border:'1px solid var(--border)', color:'var(--text-primary)', borderRadius:8, padding:'9px 12px', fontFamily:'Sora,sans-serif', fontSize:13, outline:'none', boxSizing:'border-box' }
const linkStyle   = { color:'#3b82f6', textDecoration:'none' }
const codeStyle   = { background:'var(--bg-primary)', padding:'1px 5px', borderRadius:4, fontSize:11, fontFamily:'JetBrains Mono', color:'var(--accent)' }
