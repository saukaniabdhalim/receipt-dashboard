import React, { useState, useRef, useCallback, useEffect } from 'react'
import { extractReceiptData, getMimeType, readFileAsBase64 } from '../services/extractionService.js'
import { sendReceiptToTelegram }   from '../services/telegramService.js'
import { uploadToOneDrive, isUploadConfigured, getClientId, saveClientId, clearAllMsalState } from '../services/oneDriveUploadService.js'
import { SHARE_URL } from '../services/oneDriveService.js'
import {
  Upload, Image, FileText, Sparkles, CheckCircle,
  AlertTriangle, Loader, ExternalLink, X, RefreshCw,
  Camera, Send, Cloud, Settings, Eye, EyeOff
} from 'lucide-react'

const confColor = { high:'#22c55e', medium:'#f5a623', low:'#ef4444' }
const MAX_FILES = 20
const ACCEPTED  = '.jpg,.jpeg,.png,.gif,.webp,.heic,.bmp,.pdf'
const fileKey   = f => f.name + f.size

// ── Config panel for Azure Client ID ─────────────────────────
function UploadConfigPanel({ onSaved }) {
  const [val, setVal]       = useState(getClientId)
  const [show, setShow]     = useState(false)
  const [saved, setSaved]   = useState(false)

  const handleSave = () => {
    saveClientId(val.trim())
    setSaved(true)
    setTimeout(() => { setSaved(false); onSaved?.() }, 1500)
  }

  return (
    <div style={{ padding:'14px', background:'var(--bg-input)', borderRadius:10, border:'1px solid var(--border)' }}>
      <div style={{ fontSize:12, fontWeight:700, color:'var(--text-primary)', marginBottom:6 }}>
        ⚙️ OneDrive Upload Setup
      </div>
      <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:10, lineHeight:1.6 }}>
        To upload receipts directly to OneDrive you need a free Azure App ID.{' '}
        <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade"
          target="_blank" rel="noopener noreferrer" style={{ color:'#3b82f6' }}>
          Create one here →
        </a>
        <br/>
        Register type: <strong style={{color:'var(--text-primary)'}}>Single-page application</strong> ·
        Redirect URI: <code style={{background:'var(--bg-primary)',padding:'1px 4px',borderRadius:3,fontSize:10}}>{window.location.origin + window.location.pathname}</code>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <div style={{ position:'relative', flex:1 }}>
          <input
            type={show ? 'text' : 'password'}
            value={val}
            onChange={e => setVal(e.target.value)}
            placeholder="Paste Azure Application (client) ID…"
            style={{ ...inputStyle, width:'100%', paddingRight:34, fontFamily:'JetBrains Mono', fontSize:11 }}
          />
          <button onClick={() => setShow(v=>!v)}
            style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer' }}>
            {show ? <EyeOff size={13}/> : <Eye size={13}/>}
          </button>
        </div>
        <button onClick={handleSave}
          style={{ ...actionBtn('#22c55e'), padding:'7px 14px', flexShrink:0 }}>
          {saved ? '✓ Saved' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ── Single file card ──────────────────────────────────────────
function FileCard({ file, state, result, onExtract, onAdd, onRemove, added, progress,
                    onUploadOneDrive, onSendTelegram, uploadState, telegramState }) {
  const isImg      = /image\//.test(file.type)
  const previewUrl = isImg ? URL.createObjectURL(file) : null

  return (
    <div style={{
      border:`1px solid ${state==='done'&&!result?.error?'#22c55e30':state==='error'?'#ef444430':'var(--border)'}`,
      borderRadius:10, overflow:'hidden',
      background: state==='done'&&!result?.error ? '#0a1a0f' : 'var(--bg-card)',
      transition:'all 0.2s',
    }}>
      {/* Top row */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px' }}>
        {previewUrl
          ? <img src={previewUrl} alt="" style={{ width:44, height:44, borderRadius:7, objectFit:'cover', flexShrink:0 }}/>
          : <div style={{ width:44, height:44, borderRadius:7, flexShrink:0, background:'#3b82f615', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <FileText size={20} color="#3b82f6"/>
            </div>
        }
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, color:'var(--text-primary)', fontWeight:500 }} className="truncate">{file.name}</div>
          <div style={{ fontSize:11, color:'var(--text-dim)', marginTop:1 }}>{(file.size/1024).toFixed(0)} KB</div>
        </div>
        <div style={{ flexShrink:0, display:'flex', alignItems:'center', gap:6 }}>
          {state==='idle' && !added && (
            <button onClick={onExtract} style={aiBtn}>
              <Sparkles size={11}/> Extract
            </button>
          )}
          {state==='loading' && (
            <span style={{ fontSize:11, color:'#a78bfa', display:'flex', alignItems:'center', gap:4 }}>
              <Loader size={12} style={{ animation:'spin 1s linear infinite' }}/>
              {progress > 0 ? `OCR ${progress}%…` : 'Scanning…'}
            </span>
          )}
          {state==='done' && !result?.error && !added && (
            <span style={{ fontSize:11, color:'#22c55e', display:'flex', gap:4, alignItems:'center' }}>
              <CheckCircle size={12}/> Done
            </span>
          )}
          {added && <span style={{ fontSize:11, color:'var(--text-dim)' }}>✅ Added</span>}
          {state==='error' && (
            <button onClick={onExtract} style={{ ...aiBtn, borderColor:'#ef444450', color:'#ef4444', background:'#ef444410' }}>
              <RefreshCw size={11}/> Retry
            </button>
          )}
          {!added && (
            <button onClick={onRemove} style={{ background:'none', border:'none', color:'var(--text-dim)', cursor:'pointer', padding:2 }}>
              <X size={14}/>
            </button>
          )}
        </div>
      </div>

      {/* Extracted result */}
      {state==='done' && result && !result.error && !added && (
        <div style={{ borderTop:'1px solid #22c55e20', padding:'10px 12px' }}>
          {/* Source badge */}
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
            <span style={{ fontSize:11, color:'#22c55e', fontWeight:700 }}>✅ Extracted</span>
            {result.source === 'ocr'
              ? <span style={badge('#3b82f6')}>FREE OCR</span>
              : <span style={badge('#a78bfa')}>Claude AI</span>
            }
            {result._fallbackReason && (
              <span style={{ fontSize:9, color:'#f5a623' }} title={result._fallbackReason}>⚡ fallback</span>
            )}
          </div>

          {/* Data grid */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 12px', marginBottom:10 }}>
            {[
              ['Merchant', result.merchant],
              ['Amount',   result.amount != null ? `RM ${Number(result.amount).toFixed(2)}` : null],
              ['Date',     result.date],
              ['Category', result.category],
            ].filter(([,v])=>v).map(([k,v])=>(
              <div key={k}>
                <div style={{ fontSize:9, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{k}</div>
                <div style={{ fontSize:12, color:'var(--text-primary)', fontWeight:600 }}>{v}</div>
              </div>
            ))}
            {result.description && (
              <div style={{ gridColumn:'span 2', marginTop:2 }}>
                <div style={{ fontSize:9, color:'var(--text-dim)', textTransform:'uppercase' }}>Description</div>
                <div style={{ fontSize:11, color:'var(--text-muted)' }}>{result.description}</div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {/* Add to dashboard */}
            <button onClick={onAdd} style={{
              width:'100%', padding:'9px', background:'var(--accent)', color:'#000',
              border:'none', borderRadius:8, cursor:'pointer', fontFamily:'Sora', fontWeight:700, fontSize:13,
            }}>
              ➕ Add to Dashboard
            </button>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              {/* Upload to OneDrive */}
              <button onClick={onUploadOneDrive} disabled={uploadState==='loading'||uploadState==='done'}
                style={{
                  ...actionBtn('#0078d4'),
                  justifyContent:'center', padding:'8px',
                  opacity: uploadState==='done' ? 0.6 : 1,
                }}>
                {uploadState==='loading'
                  ? <><Loader size={12} style={{animation:'spin 1s linear infinite'}}/> Uploading…</>
                  : uploadState==='done'
                  ? <><CheckCircle size={12}/> Saved to OneDrive</>
                  : uploadState==='error'
                  ? <><RefreshCw size={12}/> Retry OneDrive</>
                  : <><Cloud size={12}/> Save to OneDrive</>
                }
              </button>

              {/* Send to Telegram */}
              <button onClick={onSendTelegram} disabled={telegramState==='loading'||telegramState==='done'}
                style={{
                  ...actionBtn('#229ed9'),
                  justifyContent:'center', padding:'8px',
                  opacity: telegramState==='done' ? 0.6 : 1,
                }}>
                {telegramState==='loading'
                  ? <><Loader size={12} style={{animation:'spin 1s linear infinite'}}/> Sending…</>
                  : telegramState==='done'
                  ? <><CheckCircle size={12}/> Sent to Telegram</>
                  : telegramState==='error'
                  ? <><RefreshCw size={12}/> Retry Telegram</>
                  : <><Send size={12}/> Send to Telegram</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {state==='error' && result?.error && (
        <div style={{ borderTop:'1px solid #ef444420', padding:'8px 12px', fontSize:11, color:'#ef4444' }}>
          ⚠️ {result.error}
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────
export default function OneDrivePanel({ onExtracted, cameraFile, onCameraFileConsumed }) {
  const [files,          setFiles]          = useState([])
  const [states,         setStates]         = useState({})
  const [results,        setResults]        = useState({})
  const [addedSet,       setAddedSet]       = useState(new Set())
  const [progress,       setProgress]       = useState({})
  const [dragOver,       setDragOver]       = useState(false)
  const [uploadStates,   setUploadStates]   = useState({}) // key → idle/loading/done/error
  const [telegramStates, setTelegramStates] = useState({})
  const [actionErrors,   setActionErrors]   = useState({}) // key → error message
  const [showODConfig,   setShowODConfig]   = useState(!isUploadConfigured())

  const fileInputRef   = useRef()
  const cameraInputRef = useRef()
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)

  // base64 cache so we don't re-read file for upload/telegram
  const base64Cache = useRef({})

  const addFiles = useCallback((incoming) => {
    const valid = Array.from(incoming)
      .filter(f => /\.(jpg|jpeg|png|gif|webp|heic|bmp|pdf)$/i.test(f.name) || f.type.startsWith('image/') || f.type==='application/pdf')
      .slice(0, MAX_FILES)
    setFiles(prev => {
      const existing = new Set(prev.map(fileKey))
      return [...prev, ...valid.filter(f => !existing.has(fileKey(f)))]
    })
  }, [])

  // Auto-process cameraFile from FAB
  useEffect(() => {
    if (!cameraFile) return
    addFiles([cameraFile])
    setTimeout(() => handleExtract(cameraFile), 300)
    onCameraFileConsumed?.()
  }, [cameraFile])

  const removeFile = f => setFiles(p => p.filter(x => x !== f))
  const handleDrop = e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }

  // ── Extract ─────────────────────────────────────────────────
  const handleExtract = async (file) => {
    const key = fileKey(file)
    setStates(s => ({ ...s, [key]: 'loading' }))
    setProgress(s => ({ ...s, [key]: 0 }))
    try {
      const b64      = await readFileAsBase64(file)
      base64Cache.current[key] = { b64, mime: file.type || getMimeType(file.name) || 'image/jpeg' }
      const mimeType = file.type || getMimeType(file.name) || 'image/jpeg'
      const result   = await extractReceiptData(b64, mimeType, file.name, file,
        pct => setProgress(s => ({ ...s, [key]: pct }))
      )
      setResults(s => ({ ...s, [key]: result }))
      setStates( s => ({ ...s, [key]: 'done' }))
    } catch (e) {
      setStates( s => ({ ...s, [key]: 'error' }))
      setResults(s => ({ ...s, [key]: { error: e.message } }))
    }
  }

  const handleExtractAll = () => {
    files.forEach(f => {
      const k = fileKey(f)
      if (!states[k] || states[k]==='idle' || states[k]==='error') handleExtract(f)
    })
  }

  // ── Add to dashboard ─────────────────────────────────────────
  const handleAdd = (file) => {
    const key = fileKey(file)
    const r   = results[key]
    if (r && !r.error) {
      onExtracted(r)
      setAddedSet(s => new Set([...s, key]))
    }
  }

  // ── Upload to OneDrive ────────────────────────────────────────
  const handleUploadOneDrive = async (file) => {
    const key    = fileKey(file)
    const cached = base64Cache.current[key]
    if (!cached) return

    setUploadStates(s => ({ ...s, [key]: 'loading' }))
    setActionErrors(s => ({ ...s, [key+'_od']: null }))
    try {
      const uploaded = await uploadToOneDrive(file, cached.b64, cached.mime)
      setUploadStates(s => ({ ...s, [key]: 'done' }))
      // Also update imageNote in result
      setResults(s => ({ ...s, [key]: { ...s[key], imageNote: uploaded.webUrl } }))
    } catch (e) {
      setUploadStates(s => ({ ...s, [key]: 'error' }))
      setActionErrors(s => ({ ...s, [key+'_od']: e.message }))
    }
  }

  // ── Send to Telegram ──────────────────────────────────────────
  const handleSendTelegram = async (file) => {
    const key    = fileKey(file)
    const cached = base64Cache.current[key]
    const result = results[key]
    if (!cached || !result) return

    setTelegramStates(s => ({ ...s, [key]: 'loading' }))
    setActionErrors(s => ({ ...s, [key+'_tg']: null }))
    try {
      await sendReceiptToTelegram(cached.b64, cached.mime, result)
      setTelegramStates(s => ({ ...s, [key]: 'done' }))
    } catch (e) {
      setTelegramStates(s => ({ ...s, [key]: 'error' }))
      setActionErrors(s => ({ ...s, [key+'_tg']: e.message }))
    }
  }

  const handleCameraCapture = (e) => {
    const f = Array.from(e.target.files)
    if (!f.length) return
    addFiles(f)
    f.forEach(file => setTimeout(() => handleExtract(file), 200))
    e.target.value = ''
  }

  const pendingCount = files.filter(f => { const k=fileKey(f); return !states[k]||states[k]==='idle'||states[k]==='error' }).length
  const doneCount    = files.filter(f => states[fileKey(f)]==='done').length
  const addedCount   = addedSet.size

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* ── Camera button (mobile) ── */}
      <div style={{
        display:'flex', gap:10, padding:'14px 16px',
        background:'linear-gradient(135deg,#6366f118,#a78bfa12)',
        border:'1px solid #a78bfa30', borderRadius:'var(--radius)',
        alignItems:'center', flexWrap:'wrap'
      }}>
        <div style={{ flex:1, minWidth:160 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', marginBottom:3 }}>
            📸 Scan Receipt with Camera
          </div>
          <div style={{ fontSize:11, color:'var(--text-muted)' }}>
            {isMobile ? 'Tap to open camera — point at receipt, snap, done!' : 'On mobile: opens camera directly. On desktop: use drop zone below.'}
          </div>
        </div>
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
          style={{ display:'none' }} onChange={handleCameraCapture}/>
        <button onClick={() => cameraInputRef.current?.click()} style={{
          display:'flex', alignItems:'center', gap:8,
          background:'linear-gradient(135deg,#6366f1,#a78bfa)', color:'#fff',
          border:'none', borderRadius:10, padding:'11px 20px', cursor:'pointer',
          fontFamily:'Sora', fontWeight:700, fontSize:13,
          boxShadow:'0 4px 16px rgba(99,102,241,0.4)', flexShrink:0,
        }}>
          <Camera size={16}/> Scan Receipt
        </button>
      </div>

      {/* ── OneDrive + drop banner ── */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8,
        padding:'10px 14px', background:'linear-gradient(135deg,#0078d410,#0f1623)',
        border:'1px solid #0078d420', borderRadius:'var(--radius)'
      }}>
        <div style={{ fontSize:12, color:'var(--text-muted)' }}>
          ☁️ <strong style={{color:'var(--text-primary)'}}>From OneDrive:</strong> open folder → download image → drop below
        </div>
        <a href={SHARE_URL} target="_blank" rel="noopener noreferrer"
          style={{ ...actionBtn('#0078d4'), textDecoration:'none', padding:'6px 12px' }}>
          <ExternalLink size={12}/> Open Folder
        </a>
      </div>

      {/* ── Drop zone ── */}
      <div
        onDragOver={e=>{e.preventDefault();setDragOver(true)}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={handleDrop}
        onClick={()=>fileInputRef.current?.click()}
        style={{
          border:`2px dashed ${dragOver?'var(--accent)':'var(--border-light)'}`,
          borderRadius:'var(--radius)', padding: isMobile?'20px':'26px 20px',
          textAlign:'center', cursor:'pointer', transition:'all 0.2s',
          background: dragOver ? 'var(--accent-dim)' : 'var(--bg-card)',
        }}>
        <input ref={fileInputRef} type="file" multiple accept={ACCEPTED}
          style={{ display:'none' }} onChange={e=>{addFiles(e.target.files);e.target.value=''}}/>
        <div style={{ fontSize:isMobile?26:30, marginBottom:7 }}>{dragOver?'📂':'⬆️'}</div>
        <div style={{ fontSize:13, fontWeight:600, color:dragOver?'var(--accent)':'var(--text-primary)', marginBottom:3 }}>
          {isMobile ? 'Tap to choose from gallery' : 'Drop receipt images here or click to browse'}
        </div>
        <div style={{ fontSize:11, color:'var(--text-muted)' }}>JPG, PNG, PDF, HEIC — up to {MAX_FILES} files</div>
      </div>

      {/* ── OneDrive Upload config ── */}
      <div>
        <button onClick={()=>setShowODConfig(v=>!v)}
          style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none',
            color:'var(--text-muted)', cursor:'pointer', fontSize:12, fontFamily:'Sora', padding:'4px 0' }}>
          <Settings size={12}/>
          {showODConfig ? 'Hide' : 'Setup'} OneDrive Upload
          {!isUploadConfigured() && <span style={badge('#f5a623')}>Not configured</span>}
        </button>
        {showODConfig && (
          <div style={{ marginTop:8, animation:'fadeUp 0.2s ease' }}>
            <UploadConfigPanel onSaved={()=>setShowODConfig(false)}/>
          </div>
        )}
      </div>

      {/* ── Telegram info ── */}
      <div style={{ fontSize:11, color:'var(--text-dim)', padding:'8px 12px', background:'var(--bg-card)', borderRadius:8, border:'1px solid var(--border)' }}>
        <strong style={{color:'var(--text-muted)'}}>📱 Telegram:</strong> Add <code style={{background:'var(--bg-primary)',padding:'1px 4px',borderRadius:3}}>TELEGRAM_BOT_TOKEN</code> and <code style={{background:'var(--bg-primary)',padding:'1px 4px',borderRadius:3}}>TELEGRAM_CHAT_ID</code> as secrets in your Cloudflare Worker to enable group notifications.
      </div>

      {/* ── File list ── */}
      {files.length > 0 && (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, flexWrap:'wrap', gap:8 }}>
            <div style={{ fontSize:13, color:'var(--text-muted)' }}>
              <strong style={{color:'var(--text-primary)'}}>{files.length}</strong> file{files.length>1?'s':''}
              {doneCount > 0  && <> · <span style={{color:'#22c55e'}}>{doneCount} extracted</span></>}
              {addedCount > 0 && <> · <span style={{color:'var(--accent)'}}>{addedCount} added</span></>}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              {pendingCount > 0 && (
                <button onClick={handleExtractAll} style={{
                  display:'flex', alignItems:'center', gap:6,
                  background:'linear-gradient(135deg,#6366f1,#a78bfa)', color:'#fff',
                  border:'none', borderRadius:7, padding:'7px 14px',
                  fontFamily:'Sora', fontWeight:700, fontSize:12, cursor:'pointer',
                }}>
                  <Sparkles size={12}/> Extract All ({pendingCount})
                </button>
              )}
              <button onClick={()=>{setFiles([]);setStates({});setResults({});setAddedSet(new Set());setUploadStates({});setTelegramStates({})}}
                style={{ background:'transparent', border:'1px solid var(--border)', color:'var(--text-muted)', borderRadius:7, padding:'7px 12px', fontFamily:'Sora', fontSize:12, cursor:'pointer' }}>
                Clear
              </button>
            </div>
          </div>

          {/* Action errors */}
          {Object.entries(actionErrors).map(([k, msg]) => msg && (
            <div key={k} style={{ fontSize:11, color:'#ef4444', padding:'6px 10px', background:'#1a0a0a', borderRadius:6, border:'1px solid #ef444430', marginBottom:6 }}>
              ⚠️ {k.endsWith('_od') ? 'OneDrive: ' : 'Telegram: '}{msg}
            </div>
          ))}

          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {files.map(file => {
              const key = fileKey(file)
              return (
                <FileCard
                  key={key}
                  file={file}
                  state={states[key] || 'idle'}
                  result={results[key]}
                  added={addedSet.has(key)}
                  progress={progress[key] || 0}
                  uploadState={uploadStates[key] || 'idle'}
                  telegramState={telegramStates[key] || 'idle'}
                  onExtract={() => handleExtract(file)}
                  onAdd={() => handleAdd(file)}
                  onRemove={() => removeFile(file)}
                  onUploadOneDrive={() => handleUploadOneDrive(file)}
                  onSendTelegram={() => handleSendTelegram(file)}
                />
              )
            })}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────
const aiBtn = {
  display:'flex', alignItems:'center', gap:5,
  background:'linear-gradient(135deg,#6366f120,#a78bfa20)',
  border:'1px solid #a78bfa50', color:'#a78bfa',
  borderRadius:6, padding:'5px 10px', cursor:'pointer',
  fontFamily:'Sora', fontSize:11, fontWeight:600,
}
const actionBtn = (color) => ({
  display:'flex', alignItems:'center', gap:5,
  background:`${color}15`, border:`1px solid ${color}40`, color,
  borderRadius:7, cursor:'pointer', fontFamily:'Sora', fontSize:11, fontWeight:600,
})
const badge = (color) => ({
  fontSize:9, padding:'2px 6px', borderRadius:8, fontWeight:700,
  letterSpacing:'0.05em', background:`${color}20`, color,
})
const inputStyle = {
  background:'var(--bg-input)', border:'1px solid var(--border)', color:'var(--text-primary)',
  borderRadius:8, padding:'8px 10px', fontFamily:'Sora,sans-serif', fontSize:13,
  outline:'none', boxSizing:'border-box',
}
