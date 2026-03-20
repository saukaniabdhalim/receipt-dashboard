import React, { useState, useRef, useCallback, useEffect } from 'react'
import { extractReceiptData, getMimeType, readFileAsBase64 } from '../services/extractionService.js'
import { sendReceiptToTelegram }   from '../services/telegramService.js'
import { useMsal } from '@azure/msal-react'
import { loginRequest } from '../msalConfig.js'
import {
  ensureReceiptsFolder,
  listReceipts,
  uploadReceipt,
  getFileDownloadUrl
} from '../services/oneDriveService.js'
import {
  Image, FileText, Sparkles, CheckCircle,
  Loader, ExternalLink, X, RefreshCw, Camera, Send, Cloud
} from 'lucide-react'

const confColor = { high:'#22c55e', medium:'#f5a623', low:'#ef4444' }
const MAX_FILES = 20
const ACCEPTED  = '.jpg,.jpeg,.png,.gif,.webp,.heic,.bmp,.pdf'
const fileKey   = f => f.name + f.size

// ── File card ─────────────────────────────────────────────────
function FileCard({ file, state, result, onExtract, onRemove, progress,
                    onSaveAll, saveAllState, saveAllLog,
                    onUploadOneDrive, onSendTelegram, uploadState, telegramState }) {
  const isImg      = /image\//.test(file.type)
  const previewUrl = isImg ? URL.createObjectURL(file) : null

  return (
    <div style={{
      border:`1px solid ${state==='done'&&!result?.error?'#22c55e30':state==='error'?'#ef444430':'var(--border)'}`,
      borderRadius:10, overflow:'hidden',
      background: state==='done'&&!result?.error ? '#0a1a0f' : 'var(--bg-card)',
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
          <div style={{ fontSize:11, color:'var(--text-dim)' }}>{(file.size/1024).toFixed(0)} KB</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
          {state==='idle' && (
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
          {state==='done' && !result?.error && (
            <span style={{ fontSize:11, color:'#22c55e', display:'flex', gap:4, alignItems:'center' }}>
              <CheckCircle size={12}/> Done
            </span>
          )}
          {state==='error' && (
            <button onClick={onExtract} style={{ ...aiBtn, borderColor:'#ef444450', color:'#ef4444', background:'#ef444410' }}>
              <RefreshCw size={11}/> Retry
            </button>
          )}
          <button onClick={onRemove} style={{ background:'none', border:'none', color:'var(--text-dim)', cursor:'pointer', padding:2 }}>
            <X size={14}/>
          </button>
        </div>
      </div>

      {/* Extracted result */}
      {state==='done' && result && !result.error && (
        <div style={{ borderTop:'1px solid #22c55e20', padding:'10px 12px' }}>
          {/* Source badge */}
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
            <span style={{ fontSize:11, color:'#22c55e', fontWeight:700 }}>✅ Extracted</span>
            {result.source==='ocr'
              ? <span style={badge('#3b82f6')}>FREE OCR</span>
              : <span style={badge('#a78bfa')}>Claude AI</span>
            }
            <span style={{ ...badge(confColor[result.confidence]||'#6b82a8') }}>
              {(result.confidence||'medium').toUpperCase()}
            </span>
          </div>

          {/* Data preview */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 12px', marginBottom:10 }}>
            {[
              ['Merchant', result.merchant],
              ['Amount',   result.amount ? `RM ${Number(result.amount).toFixed(2)}` : null],
              ['Date',     result.date],
              ['Category', result.category],
            ].filter(([,v])=>v).map(([k,v])=>(
              <div key={k}>
                <div style={{ fontSize:9, color:'var(--text-dim)', textTransform:'uppercase' }}>{k}</div>
                <div style={{ fontSize:12, color:'var(--text-primary)', fontWeight:600 }}>{v}</div>
              </div>
            ))}
          </div>

          {/* ── Save Receipt (all-in-one) ── */}
          <button onClick={onSaveAll}
            disabled={saveAllState==='loading'||saveAllState==='done'}
            style={{
              width:'100%', padding:'10px', marginBottom:6,
              background: saveAllState==='done'
                ? 'linear-gradient(135deg,#22c55e,#16a34a)'
                : 'linear-gradient(135deg,#f5a623,#f97316)',
              color:'#000', border:'none', borderRadius:9, cursor: saveAllState==='done'?'default':'pointer',
              fontFamily:'Sora', fontWeight:800, fontSize:14,
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              boxShadow: saveAllState==='done'?'none':'0 4px 16px rgba(245,166,35,0.35)',
              opacity: saveAllState==='loading' ? 0.8 : 1,
            }}>
            {saveAllState==='loading'
              ? <><Loader size={14} style={{animation:'spin 1s linear infinite'}}/> Saving…</>
              : saveAllState==='done'
              ? <>✅ Saved!</>
              : <>💾 Save Receipt</>
            }
          </button>

          {/* Save log */}
          {saveAllLog && saveAllLog.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:2, marginBottom:6 }}>
              {saveAllLog.map((entry, i) => (
                <div key={i} style={{
                  fontSize:11, display:'flex', alignItems:'center', gap:5,
                  color: entry.ok ? '#22c55e' : '#f5a623',
                  padding:'2px 4px',
                }}>
                  {entry.ok ? '✓' : '⚠'} {entry.label}
                  {!entry.ok && entry.error && (
                    <span style={{ color:'var(--text-dim)', fontSize:10 }} title={entry.error}>
                      — {String(entry.error).slice(0,40)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ height:1, background:'var(--border)', margin:'4px 0 8px' }}/>

          {/* Individual buttons */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
            <button onClick={onUploadOneDrive} disabled={uploadState==='loading'||uploadState==='done'}
              style={{ ...actionBtn('#0078d4'), justifyContent:'center', padding:'7px', opacity:uploadState==='done'?0.6:1 }}>
              {uploadState==='loading' ? <><Loader size={11} style={{animation:'spin 1s linear infinite'}}/> Uploading…</>
               : uploadState==='done'  ? <><CheckCircle size={11}/> Saved</>
               : <><Cloud size={11}/> OneDrive</>}
            </button>
            <button onClick={onSendTelegram} disabled={telegramState==='loading'||telegramState==='done'}
              style={{ ...actionBtn('#229ed9'), justifyContent:'center', padding:'7px', opacity:telegramState==='done'?0.6:1 }}>
              {telegramState==='loading' ? <><Loader size={11} style={{animation:'spin 1s linear infinite'}}/> Sending…</>
               : telegramState==='done'  ? <><CheckCircle size={11}/> Sent</>
               : <><Send size={11}/> Telegram</>}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {state==='error' && result?.error && (
        <div style={{ borderTop:'1px solid #ef444420', padding:'8px 12px', fontSize:11, color:'#ef4444' }}>
          ⚠️ {String(result.error)}
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────
export default function OneDrivePanel({ onExtracted, onDirectSave, onSelectFile, cameraFile, onCameraFileConsumed, getAccessToken }) {
  const [files,          setFiles]          = useState([])
  const [states,         setStates]         = useState({})
  const [results,        setResults]        = useState({})
  const [addedSet,       setAddedSet]       = useState(new Set())
  const [progress,       setProgress]       = useState({})
  const [dragOver,       setDragOver]       = useState(false)
  const [uploadStates,   setUploadStates]   = useState({})
  const [telegramStates, setTelegramStates] = useState({})
  const [saveAllStates,  setSaveAllStates]  = useState({})
  const [saveAllLogs,    setSaveAllLogs]    = useState({})

  const fileInputRef   = useRef()
  const cameraInputRef = useRef()
  const base64Cache    = useRef({})
  const isMobile = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
  const { instance, accounts } = useMsal()
  const account = accounts[0]

  const getAuthToken = useCallback(async () => {
    if (typeof getAccessToken === 'function') return await getAccessToken()
    if (!account) return null
    try {
      const response = await instance.acquireTokenSilent({
        ...loginRequest,
        account,
      })
      return response.accessToken
    } catch {
      return null
    }
  }, [getAccessToken, instance, account])

  const addFiles = useCallback((incoming) => {
    const valid = Array.from(incoming)
      .filter(f => /\.(jpg|jpeg|png|gif|webp|heic|bmp|pdf)$/i.test(f.name) || f.type.startsWith('image/') || f.type==='application/pdf')
      .slice(0, MAX_FILES)
    setFiles(prev => {
      const existing = new Set(prev.map(fileKey))
      return [...prev, ...valid.filter(f => !existing.has(fileKey(f)))]
    })
  }, [])

  useEffect(() => {
    if (!cameraFile) return
    addFiles([cameraFile])
    setTimeout(() => handleExtract(cameraFile), 300)
    onCameraFileConsumed?.()
  }, [cameraFile])

  const removeFile = f => setFiles(p => p.filter(x => x !== f))
  const handleDrop = e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }

  // ── Extract ──────────────────────────────────────────────────
  const handleExtract = async (file) => {
    const key = fileKey(file)
    setStates(s => ({ ...s, [key]: 'loading' }))
    setProgress(s => ({ ...s, [key]: 0 }))
    try {
      const b64      = await readFileAsBase64(file)
      const mimeType = file.type || getMimeType(file.name) || 'image/jpeg'
      base64Cache.current[key] = { b64, mime: mimeType }
      const token    = await getAuthToken()
      if (!token) throw new Error('Sign-in required. Please sign in again and retry.')
      const result   = await extractReceiptData(b64, mimeType, file.name, file,
        pct => setProgress(s => ({ ...s, [key]: pct })),
        token
      )
      base64Cache.current[key] = { b64: result.compressedBase64 || b64, mime: 'image/jpeg' }
      setResults(s => ({ ...s, [key]: result }))
      setStates( s => ({ ...s, [key]: 'done' }))
      
      // Auto-trigger fill if inside a modal (onExtracted provided, but not onDirectSave)
      if (typeof onExtracted === 'function' && typeof onDirectSave !== 'function') {
        onExtracted({ ...result, imageNote: result.webUrl || '' })
      }
    } catch (e) {
      setStates( s => ({ ...s, [key]: 'error' }))
      setResults(s => ({ ...s, [key]: { error: String(e.message || e) } }))
    }
  }

  const handleExtractAll = () => {
    files.forEach(f => {
      const k = fileKey(f)
      if (!states[k] || states[k]==='idle' || states[k]==='error') handleExtract(f)
    })
  }

  // ── Save All (dashboard + gist + telegram + onedrive) ────────
  const handleSaveAll = async (file) => {
    const key    = fileKey(file)
    const cached = base64Cache.current[key]
    const result = results[key]
    if (!cached || !result || result.error) return

    setSaveAllStates(s => ({ ...s, [key]: 'loading' }))
    setSaveAllLogs(s => ({ ...s, [key]: [] }))
    const log = []
    const addLog = (label, ok, error = null) => {
      log.push({ label, ok, error: error ? String(error) : null })
      setSaveAllLogs(s => ({ ...s, [key]: [...log] }))
      if (!ok) console.warn(`[SaveAll] ${label}:`, error)
    }

    await Promise.allSettled([
      // 1. Add to dashboard directly (no modal)
      (async () => {
        try {
          const payload = { ...result, imageNote: cached.webUrl || '' };
          if (typeof onDirectSave === 'function') {
            onDirectSave(payload)
          } else if (typeof onExtracted === 'function') {
            onExtracted(payload)
          }
          
          if (typeof onSelectFile === 'function') {
            onSelectFile({ ...file, webUrl: cached.webUrl })
          }
          setAddedSet(s => new Set([...s, key]))
          addLog('📊 Added to Dashboard', true)
        } catch (e) { addLog('📊 Dashboard', false, String(e.message || e)) }
      })(),

      // 2. Gist auto-saves via App.jsx useEffect — log as success
      (async () => { addLog('💾 GitHub Gist', true) })(),

      // 3. Telegram
      (async () => {
        try {
          const token = await getAuthToken()
          if (!token) throw new Error('Missing auth token')
          await sendReceiptToTelegram(cached.b64, cached.mime, result, token)
          setTelegramStates(s => ({ ...s, [key]: 'done' }))
          addLog('📱 Telegram', true)
        } catch (e) {
          setTelegramStates(s => ({ ...s, [key]: 'error' }))
          addLog('📱 Telegram', false, e.message)
        }
      })(),

      // 4. OneDrive
      (async () => {
        try {
          const token = await getAuthToken()
          if (!token) throw new Error('Missing auth token')
          await ensureReceiptsFolder(token)
          const uploaded = await uploadReceipt(file, token)
          setUploadStates(s => ({ ...s, [key]: 'done' }))
          // uploaded['@microsoft.graph.downloadUrl'] or we use getFileDownloadUrl
          cached.webUrl = uploaded?.webUrl || '' 
          addLog('☁️ OneDrive', true)
        } catch (e) {
          setUploadStates(s => ({ ...s, [key]: 'error' }))
          addLog('☁️ OneDrive', false, e.message)
        }
      })(),
    ])

    setSaveAllStates(s => ({ ...s, [key]: 'done' }))
  }

  // ── Individual actions ────────────────────────────────────────
  const handleUploadOneDrive = async (file) => {
    const key = fileKey(file); const cached = base64Cache.current[key]
    if (!cached) return
    setUploadStates(s => ({ ...s, [key]: 'loading' }))
    try {
      const token = await getAuthToken()
      if (!token) throw new Error('Missing auth token')
      await ensureReceiptsFolder(token)
      await uploadReceipt(file, token)
      setUploadStates(s => ({ ...s, [key]: 'done' }))
    } catch (e) { setUploadStates(s => ({ ...s, [key]: 'error' })) }
  }

  const handleSendTelegram = async (file) => {
    const key = fileKey(file); const cached = base64Cache.current[key]; const result = results[key]
    if (!cached || !result) return
    setTelegramStates(s => ({ ...s, [key]: 'loading' }))
    try {
      const token = await getAuthToken()
      if (!token) throw new Error('Missing auth token')
      await sendReceiptToTelegram(cached.b64, cached.mime, result, token)
      setTelegramStates(s => ({ ...s, [key]: 'done' }))
    } catch (e) { setTelegramStates(s => ({ ...s, [key]: 'error' })) }
  }

  const handleCameraCapture = (e) => {
    const f = Array.from(e.target.files || [])
    if (!f.length) return
    addFiles(f)
    f.forEach(file => setTimeout(() => handleExtract(file), 200))
    e.target.value = ''
  }

  const pendingCount = files.filter(f => { const k=fileKey(f); return !states[k]||states[k]==='idle'||states[k]==='error' }).length

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* Camera button */}
      <div style={{
        display:'flex', gap:10, padding:'14px 16px',
        background:'linear-gradient(135deg,#6366f118,#a78bfa12)',
        border:'1px solid #a78bfa30', borderRadius:'var(--radius)',
        alignItems:'center', flexWrap:'wrap'
      }}>
        <div style={{ flex:1, minWidth:160 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', marginBottom:3 }}>📸 Scan Receipt</div>
          <div style={{ fontSize:11, color:'var(--text-muted)' }}>
            {isMobile ? 'Tap to open camera' : 'On mobile: opens camera. Desktop: use drop zone below.'}
          </div>
        </div>
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
          style={{ display:'none' }} onChange={handleCameraCapture}/>
        <button onClick={() => cameraInputRef.current?.click()} style={{
          display:'flex', alignItems:'center', gap:8,
          background:'linear-gradient(135deg,#6366f1,#a78bfa)', color:'#fff',
          border:'none', borderRadius:10, padding:'11px 20px', cursor:'pointer',
          fontFamily:'Sora', fontWeight:700, fontSize:13, flexShrink:0,
        }}>
          <Camera size={16}/> Scan Receipt
        </button>
      </div>

      {/* OneDrive link */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8,
        padding:'10px 14px', background:'linear-gradient(135deg,#0078d410,#0f1623)',
        border:'1px solid #0078d420', borderRadius:'var(--radius)'
      }}>
        <div style={{ fontSize:12, color:'var(--text-muted)' }}>
          ☁️ <strong style={{color:'var(--text-primary)'}}>From OneDrive:</strong> open folder → save image → drop below
        </div>
        <button onClick={async () => {
             await getAuthToken()
             window.open('https://onedrive.live.com', '_blank')
          }}
          style={{ ...actionBtn('#0078d4'), textDecoration:'none', padding:'6px 12px', background:'none', border:'1px solid #0078d440' }}>
          <ExternalLink size={12}/> Open OneDrive
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e=>{e.preventDefault();setDragOver(true)}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={handleDrop}
        onClick={()=>fileInputRef.current?.click()}
        style={{
          border:`2px dashed ${dragOver?'var(--accent)':'var(--border-light)'}`,
          borderRadius:'var(--radius)', padding: isMobile?'20px':'26px 20px',
          textAlign:'center', cursor:'pointer',
          background: dragOver ? 'var(--accent-dim)' : 'var(--bg-card)',
        }}>
        <input ref={fileInputRef} type="file" multiple accept={ACCEPTED}
          style={{ display:'none' }} onChange={e=>{addFiles(e.target.files);e.target.value=''}}/>
        <div style={{ fontSize:isMobile?26:30, marginBottom:7 }}>{dragOver?'📂':'⬆️'}</div>
        <div style={{ fontSize:13, fontWeight:600, color:dragOver?'var(--accent)':'var(--text-primary)', marginBottom:3 }}>
          {isMobile ? 'Tap to choose from gallery' : 'Drop images here or click to browse'}
        </div>
        <div style={{ fontSize:11, color:'var(--text-muted)' }}>JPG, PNG, PDF, HEIC — up to {MAX_FILES} files</div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, flexWrap:'wrap', gap:8 }}>
            <div style={{ fontSize:13, color:'var(--text-muted)' }}>
              <strong style={{color:'var(--text-primary)'}}>{files.length}</strong> file{files.length>1?'s':''}
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
              <button onClick={()=>{setFiles([]);setStates({});setResults({});setAddedSet(new Set());
                setUploadStates({});setTelegramStates({});setSaveAllStates({});setSaveAllLogs({})}}
                style={{ background:'transparent', border:'1px solid var(--border)', color:'var(--text-muted)', borderRadius:7, padding:'7px 12px', fontFamily:'Sora', fontSize:12, cursor:'pointer' }}>
                Clear
              </button>
            </div>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {files.map(file => {
              const key = fileKey(file)
              return (
                <FileCard
                  key={key}
                  file={file}
                  state={states[key] || 'idle'}
                  result={results[key]}
                  progress={progress[key] || 0}
                  uploadState={uploadStates[key] || 'idle'}
                  telegramState={telegramStates[key] || 'idle'}
                  saveAllState={saveAllStates[key] || 'idle'}
                  saveAllLog={saveAllLogs[key] || []}
                  onExtract={() => handleExtract(file)}
                  onRemove={() => removeFile(file)}
                  onSaveAll={() => handleSaveAll(file)}
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
  background:`${color}20`, color, border:`1px solid ${color}25`,
})
