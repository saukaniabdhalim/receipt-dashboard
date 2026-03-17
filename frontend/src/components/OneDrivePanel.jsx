import React, { useState, useCallback, useEffect } from 'react'
import {
  listOneDriveFiles, getFileDownloadUrl, fetchFileAsBase64,
  isReceiptFile, isImageFile, SHARE_URL
} from '../services/oneDriveService.js'
import { extractReceiptData, getMimeType } from '../services/extractionService.js'
import {
  FolderOpen, FileImage, FileText, File, RefreshCw,
  ExternalLink, AlertCircle, ChevronRight, Home,
  Loader, Sparkles, CheckCircle, AlertTriangle, CloudOff
} from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────
function fileIcon(item) {
  if (item.folder) return <FolderOpen size={15} color="#f5a623" />
  const n = item.name?.toLowerCase() || ''
  if (/\.(jpg|jpeg|png|gif|webp|heic)$/.test(n)) return <FileImage size={15} color="#22c55e" />
  if (/\.pdf$/.test(n)) return <FileText size={15} color="#ef4444" />
  return <File size={15} color="#6b82a8" />
}
function fmtSize(b) {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b/1024).toFixed(0)} KB`
  return `${(b/1048576).toFixed(1)} MB`
}
function fmtDate(s) {
  if (!s) return ''
  return new Date(s).toLocaleDateString('en-MY', { day:'numeric', month:'short', year:'numeric' })
}
const confColor = { high:'#22c55e', medium:'#f5a623', low:'#ef4444' }

// ─────────────────────────────────────────────────────────────
export default function OneDrivePanel({ onExtracted }) {
  const [files,        setFiles]        = useState([])
  const [loading,      setLoading]      = useState(false)
  const [syncError,    setSyncError]    = useState(null)
  const [loaded,       setLoaded]       = useState(false)
  const [lastSync,     setLastSync]     = useState(null)
  const [breadcrumb,   setBreadcrumb]   = useState([{ name: 'Receipts Folder', id: null }])
  const [extractState, setExtractState] = useState({}) // id → 'idle'|'loading'|'done'|'error'
  const [extractResult,setExtractResult]= useState({}) // id → extracted data or {error}
  const [addedIds,     setAddedIds]     = useState(new Set())

  // ── Auto-load on mount ────────────────────────────────────
  const loadFiles = useCallback(async (itemId = null) => {
    setLoading(true)
    setSyncError(null)
    try {
      const items = await listOneDriveFiles(itemId)
      setFiles(items)
      setLoaded(true)
      setLastSync(new Date())
    } catch (e) {
      setSyncError(e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadFiles(null)
  }, [loadFiles])

  // ── Folder navigation ─────────────────────────────────────
  const openFolder = (item) => {
    setBreadcrumb(p => [...p, { name: item.name, id: item.id }])
    loadFiles(item.id)
    setFiles([])
  }
  const navCrumb = (idx) => {
    setBreadcrumb(p => p.slice(0, idx + 1))
    loadFiles(breadcrumb[idx].id)
    setFiles([])
  }

  // ── AI Extraction ─────────────────────────────────────────
  const handleExtract = async (item) => {
    setExtractState(s => ({ ...s, [item.id]: 'loading' }))
    try {
      const dlUrl  = await getFileDownloadUrl(item)
      if (!dlUrl) throw new Error('No download URL available for this file. The folder permissions may need to be set to "Anyone with the link".')
      const base64  = await fetchFileAsBase64(dlUrl)
      const mime    = getMimeType(item.name)
      const result  = await extractReceiptData(base64, mime, item.name)
      result.imageNote = item.webUrl || dlUrl
      setExtractResult(s => ({ ...s, [item.id]: result }))
      setExtractState( s => ({ ...s, [item.id]: 'done' }))
    } catch (e) {
      setExtractState( s => ({ ...s, [item.id]: 'error' }))
      setExtractResult(s => ({ ...s, [item.id]: { error: e.message } }))
    }
  }

  const handleAdd = (item) => {
    const r = extractResult[item.id]
    if (r && !r.error) {
      onExtracted(r)
      setAddedIds(s => new Set([...s, item.id]))
    }
  }

  // ── Stats ─────────────────────────────────────────────────
  const receiptFiles = files.filter(f => !f.folder && isReceiptFile(f))
  const folders      = files.filter(f => f.folder)

  // ─────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* ── Status bar ── */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10,
        padding:'12px 16px', background:'var(--bg-card)', borderRadius:'var(--radius)',
        border:'1px solid var(--border)'
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {/* Status dot */}
          <div style={{
            width:8, height:8, borderRadius:'50%',
            background: loading ? '#f5a623' : syncError ? '#ef4444' : loaded ? '#22c55e' : '#6b82a8',
            animation: loading ? 'pulse-dot 1s infinite' : 'none'
          }} />
          <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>
            {loading ? 'Connecting to OneDrive…'
              : syncError ? 'Connection failed'
              : loaded ? `${files.length} item${files.length!==1?'s':''} loaded`
              : 'Not connected'}
          </span>
          {lastSync && !loading && (
            <span style={{ fontSize:11, color:'var(--text-dim)' }}>
              · synced {lastSync.toLocaleTimeString('en-MY', { hour:'2-digit', minute:'2-digit' })}
            </span>
          )}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => loadFiles(breadcrumb[breadcrumb.length-1].id)}
            disabled={loading}
            style={{ ...btnStyle('#6b82a8'), opacity: loading ? 0.5 : 1 }}>
            <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Syncing…' : 'Refresh'}
          </button>
          <a href={SHARE_URL} target="_blank" rel="noopener noreferrer"
            style={{ ...btnStyle('#0078d4'), textDecoration:'none' }}>
            <ExternalLink size={12} /> Open in OneDrive
          </a>
        </div>
      </div>

      {/* ── Sync error ── */}
      {syncError && (
        <div style={{
          padding:'14px 16px', background:'#1a0a0a', border:'1px solid #ef444430',
          borderRadius:'var(--radius)', display:'flex', gap:10
        }}>
          <CloudOff size={16} color="#ef4444" style={{ flexShrink:0, marginTop:1 }} />
          <div>
            <div style={{ fontSize:13, color:'#ef4444', fontWeight:600, marginBottom:4 }}>
              Could not reach OneDrive folder
            </div>
            <div style={{ fontSize:12, color:'var(--text-dim)', marginBottom:8 }}>{syncError}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:10, lineHeight:1.6 }}>
              <strong style={{ color:'var(--text-primary)' }}>To fix:</strong> Open your OneDrive folder →
              Right-click → Share → change to <strong style={{ color:'var(--text-primary)' }}>Anyone with the link can view</strong> → Save.
              Then click Refresh above.
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => loadFiles(null)} style={btnStyle('#f5a623')}>
                <RefreshCw size={12} /> Try again
              </button>
              <a href={SHARE_URL} target="_blank" rel="noopener noreferrer"
                style={{ ...btnStyle('#0078d4'), textDecoration:'none' }}>
                <ExternalLink size={12} /> Open OneDrive
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{
              height:52, borderBottom:'1px solid var(--border)',
              background: `linear-gradient(90deg, var(--bg-card) 0%, var(--bg-card-hover) 50%, var(--bg-card) 100%)`,
              backgroundSize:'200% 100%', animation:`shimmer 1.5s infinite ${i*0.1}s`
            }} />
          ))}
          <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
        </div>
      )}

      {/* ── File browser ── */}
      {loaded && !loading && (
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>

          {/* Breadcrumb + stats */}
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'10px 14px', borderBottom:'1px solid var(--border)',
            background:'var(--bg-primary)', flexWrap:'wrap', gap:8
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:4, flexWrap:'wrap' }}>
              {breadcrumb.map((c,i) => (
                <React.Fragment key={i}>
                  {i > 0 && <ChevronRight size={12} color="var(--text-dim)" />}
                  <button onClick={() => navCrumb(i)} style={{
                    background:'none', border:'none',
                    cursor: i < breadcrumb.length-1 ? 'pointer' : 'default',
                    color: i === breadcrumb.length-1 ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize:12, fontFamily:'Sora', fontWeight: i===breadcrumb.length-1 ? 600 : 400,
                    padding:'2px 4px', borderRadius:4,
                    textDecoration: i < breadcrumb.length-1 ? 'underline' : 'none',
                  }}>
                    {i === 0
                      ? <span style={{display:'flex',alignItems:'center',gap:4}}><Home size={11}/>{c.name}</span>
                      : c.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
            <div style={{ display:'flex', gap:12, fontSize:11, color:'var(--text-dim)' }}>
              {folders.length > 0      && <span>📁 {folders.length} folder{folders.length>1?'s':''}</span>}
              {receiptFiles.length > 0 && <span>🧾 {receiptFiles.length} receipt{receiptFiles.length>1?'s':''}</span>}
            </div>
          </div>

          {/* Empty */}
          {files.length === 0 && (
            <div style={{ padding:'40px', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
              This folder is empty. Upload your receipt photos to your OneDrive receipts folder.
            </div>
          )}

          {/* Items */}
          <div style={{ maxHeight:480, overflowY:'auto' }}>
            {files.map(item => {
              const state  = extractState[item.id]  || 'idle'
              const result = extractResult[item.id]
              const added  = addedIds.has(item.id)
              const canAI  = !item.folder && isReceiptFile(item)

              return (
                <div key={item.id}>
                  {/* Row */}
                  <div
                    onClick={() => item.folder ? openFolder(item) : null}
                    style={{
                      display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                      cursor: item.folder ? 'pointer' : 'default',
                      borderBottom: (state === 'done' && !result?.error) ? 'none' : '1px solid var(--border)',
                      transition:'background 0.15s',
                    }}
                    onMouseEnter={e => { if (item.folder) e.currentTarget.style.background='var(--bg-card-hover)' }}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}
                  >
                    <div style={{ flexShrink:0 }}>{fileIcon(item)}</div>

                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, color:'var(--text-primary)', fontWeight: item.folder ? 600 : 400 }}
                        className="truncate">{item.name}</div>
                      {!item.folder && (
                        <div style={{ fontSize:11, color:'var(--text-dim)', marginTop:1 }}>
                          {fmtSize(item.size)}{item.size && item.lastModifiedDateTime ? ' · ' : ''}{fmtDate(item.lastModifiedDateTime)}
                        </div>
                      )}
                    </div>

                    {/* Right side actions */}
                    <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                      {item.folder && <ChevronRight size={13} color="var(--text-dim)" />}

                      {canAI && state === 'idle' && !added && (
                        <button onClick={() => handleExtract(item)} style={{
                          display:'flex', alignItems:'center', gap:5,
                          background:'linear-gradient(135deg,#6366f120,#a78bfa20)',
                          border:'1px solid #a78bfa50', color:'#a78bfa',
                          borderRadius:6, padding:'5px 10px', cursor:'pointer',
                          fontFamily:'Sora', fontSize:11, fontWeight:600,
                        }}>
                          <Sparkles size={11}/> Extract with AI
                        </button>
                      )}

                      {state === 'loading' && (
                        <span style={{ fontSize:11, color:'#a78bfa', display:'flex', alignItems:'center', gap:4 }}>
                          <Loader size={12} style={{ animation:'spin 1s linear infinite' }}/> Reading…
                        </span>
                      )}

                      {state === 'done' && !result?.error && !added && (
                        <span style={{ fontSize:11, color:'#22c55e', display:'flex', alignItems:'center', gap:4 }}>
                          <CheckCircle size={12}/> Extracted
                        </span>
                      )}

                      {added && (
                        <span style={{ fontSize:11, color:'var(--text-dim)', display:'flex', alignItems:'center', gap:4 }}>
                          ✅ Added
                        </span>
                      )}

                      {state === 'error' && (
                        <span style={{ fontSize:11, color:'#ef4444', display:'flex', alignItems:'center', gap:4 }}>
                          <AlertTriangle size={12}/> Failed
                          <button onClick={() => setExtractState(s=>({...s,[item.id]:'idle'}))}
                            style={{ marginLeft:4, background:'none', border:'none', color:'#f5a623', cursor:'pointer', fontSize:11 }}>
                            Retry
                          </button>
                        </span>
                      )}

                      {item.webUrl && (
                        <a href={item.webUrl} target="_blank" rel="noopener noreferrer"
                          onClick={e=>e.stopPropagation()}
                          style={{ color:'var(--text-dim)' }} title="Open in OneDrive">
                          <ExternalLink size={12}/>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Extracted data card */}
                  {state === 'done' && result && !result.error && !added && (
                    <div style={{
                      margin:'0 14px 8px', padding:'12px 14px', animation:'fadeUp 0.3s ease',
                      background:'linear-gradient(135deg,#0a1a0f,#0f1a18)',
                      border:'1px solid #22c55e25', borderRadius:8, borderTop:'2px solid #22c55e40'
                    }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                        <span style={{ fontSize:12, fontWeight:700, color:'#22c55e' }}>✅ AI Extracted</span>
                        <span style={{
                          fontSize:10, padding:'2px 7px', borderRadius:10,
                          background:`${confColor[result.confidence]||'#6b82a8'}20`,
                          color: confColor[result.confidence]||'#6b82a8', fontWeight:700, letterSpacing:'0.05em'
                        }}>
                          {(result.confidence||'medium').toUpperCase()}
                        </span>
                      </div>

                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 16px', marginBottom:12 }}>
                        {[
                          ['Merchant', result.merchant],
                          ['Amount',   result.amount != null ? `RM ${Number(result.amount).toFixed(2)}` : null],
                          ['Date',     result.date],
                          ['Category', result.category],
                        ].filter(([,v]) => v).map(([k,v]) => (
                          <div key={k}>
                            <div style={{ fontSize:10, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{k}</div>
                            <div style={{ fontSize:13, color:'var(--text-primary)', fontWeight:600 }}>{v}</div>
                          </div>
                        ))}
                        {result.description && (
                          <div style={{ gridColumn:'span 2' }}>
                            <div style={{ fontSize:10, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Description</div>
                            <div style={{ fontSize:12, color:'var(--text-muted)' }}>{result.description}</div>
                          </div>
                        )}
                      </div>

                      <button onClick={() => handleAdd(item)} style={{
                        width:'100%', padding:'9px', background:'var(--accent)', color:'#000',
                        border:'none', borderRadius:8, cursor:'pointer',
                        fontFamily:'Sora', fontWeight:700, fontSize:13,
                      }}>
                        ➕ Add to Dashboard
                      </button>
                    </div>
                  )}

                  {/* Error card */}
                  {state === 'error' && result?.error && (
                    <div style={{
                      margin:'0 14px 8px', padding:'10px 12px', borderRadius:8,
                      background:'#1a0a0a', border:'1px solid #ef444430',
                      fontSize:12, color:'#ef4444'
                    }}>
                      ⚠️ {result.error}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin    { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  )
}

const btnStyle = (color) => ({
  display:'flex', alignItems:'center', gap:5,
  background:`${color}15`, border:`1px solid ${color}30`, color,
  borderRadius:6, padding:'5px 10px', cursor:'pointer',
  fontFamily:'Sora', fontSize:11, fontWeight:600,
})
