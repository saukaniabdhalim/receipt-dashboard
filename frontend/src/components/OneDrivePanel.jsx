import React, { useState, useRef, useCallback } from 'react'
import { extractReceiptData, getMimeType, readFileAsBase64 } from '../services/extractionService.js'
import { SHARE_URL } from '../services/oneDriveService.js'
import {
  Upload, Image, FileText, Sparkles, CheckCircle,
  AlertTriangle, Loader, ExternalLink, X, RefreshCw
} from 'lucide-react'

const confColor = { high:'#22c55e', medium:'#f5a623', low:'#ef4444' }
const MAX_FILES = 20
const ACCEPTED  = '.jpg,.jpeg,.png,.gif,.webp,.heic,.bmp,.pdf'

// ── single file card ──────────────────────────────────────────
function FileCard({ file, state, result, onExtract, onAdd, onRemove, added }) {
  const isImg = /image\//.test(file.type)
  const isPdf = file.type === 'application/pdf'

  return (
    <div style={{
      border: `1px solid ${
        state === 'done' && !result?.error ? '#22c55e30'
        : state === 'error' ? '#ef444430'
        : 'var(--border)'
      }`,
      borderRadius: 10, overflow: 'hidden',
      background: state === 'done' && !result?.error ? '#0a1a0f' : 'var(--bg-card)',
      transition: 'all 0.2s',
    }}>
      {/* Top row */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px' }}>
        {/* Thumbnail or icon */}
        {isImg && state !== 'idle'
          ? <img src={URL.createObjectURL(file)} alt=""
              style={{ width:40, height:40, borderRadius:6, objectFit:'cover', flexShrink:0 }} />
          : <div style={{
              width:40, height:40, borderRadius:6, flexShrink:0,
              background: isPdf ? '#ef444415' : '#3b82f615',
              display:'flex', alignItems:'center', justifyContent:'center'
            }}>
              {isPdf ? <FileText size={18} color="#ef4444"/> : <Image size={18} color="#3b82f6"/>}
            </div>
        }

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, color:'var(--text-primary)', fontWeight:500 }}
            className="truncate">{file.name}</div>
          <div style={{ fontSize:11, color:'var(--text-dim)', marginTop:1 }}>
            {(file.size/1024).toFixed(0)} KB
          </div>
        </div>

        {/* Action */}
        <div style={{ flexShrink:0, display:'flex', alignItems:'center', gap:6 }}>
          {state === 'idle' && !added && (
            <button onClick={onExtract} style={aiBtn}>
              <Sparkles size={11}/> Extract
            </button>
          )}
          {state === 'loading' && (
            <span style={{ fontSize:11, color:'#a78bfa', display:'flex', alignItems:'center', gap:4 }}>
              <Loader size={12} style={{ animation:'spin 1s linear infinite' }}/> Reading…
            </span>
          )}
          {state === 'done' && !result?.error && !added && (
            <span style={{ fontSize:11, color:'#22c55e', display:'flex', gap:4, alignItems:'center' }}>
              <CheckCircle size={12}/> Done
            </span>
          )}
          {added && (
            <span style={{ fontSize:11, color:'var(--text-dim)' }}>✅ Added</span>
          )}
          {state === 'error' && (
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
      {state === 'done' && result && !result.error && !added && (
        <div style={{ borderTop:'1px solid #22c55e20', padding:'10px 12px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
            <span style={{ fontSize:11, color:'#22c55e', fontWeight:700 }}>AI Extracted</span>
            <span style={{
              fontSize:9, padding:'2px 6px', borderRadius:8, fontWeight:700, letterSpacing:'0.05em',
              background:`${confColor[result.confidence]||'#6b82a8'}20`,
              color: confColor[result.confidence]||'#6b82a8'
            }}>{(result.confidence||'medium').toUpperCase()}</span>
          </div>
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
                <div style={{ fontSize:9, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Description</div>
                <div style={{ fontSize:11, color:'var(--text-muted)' }}>{result.description}</div>
              </div>
            )}
          </div>
          <button onClick={onAdd} style={{
            width:'100%', padding:'8px', background:'var(--accent)', color:'#000',
            border:'none', borderRadius:7, cursor:'pointer', fontFamily:'Sora', fontWeight:700, fontSize:13,
          }}>
            ➕ Add to Dashboard
          </button>
        </div>
      )}

      {/* Error */}
      {state === 'error' && result?.error && (
        <div style={{ borderTop:'1px solid #ef444420', padding:'8px 12px', fontSize:11, color:'#ef4444' }}>
          ⚠️ {result.error}
        </div>
      )}
    </div>
  )
}

// ── main panel ────────────────────────────────────────────────
export default function OneDrivePanel({ onExtracted }) {
  const [files,         setFiles]         = useState([]) // File objects
  const [states,        setStates]        = useState({}) // name→'idle'|'loading'|'done'|'error'
  const [results,       setResults]       = useState({}) // name→extracted data
  const [addedSet,      setAddedSet]      = useState(new Set())
  const [dragOver,      setDragOver]      = useState(false)
  const inputRef = useRef()

  const addFiles = useCallback((incoming) => {
    const valid = Array.from(incoming).filter(f =>
      /\.(jpg|jpeg|png|gif|webp|heic|bmp|pdf)$/i.test(f.name)
    ).slice(0, MAX_FILES)
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size))
      const fresh = valid.filter(f => !existing.has(f.name + f.size))
      return [...prev, ...fresh]
    })
  }, [])

  const removeFile = (file) => {
    setFiles(p => p.filter(f => f !== file))
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  const handleExtract = async (file) => {
    const key = file.name + file.size
    setStates(s => ({ ...s, [key]: 'loading' }))
    try {
      const base64   = await readFileAsBase64(file)
      const mimeType = getMimeType(file.name) || file.type || 'image/jpeg'
      const result   = await extractReceiptData(base64, mimeType, file.name)
      setResults(s => ({ ...s, [key]: result }))
      setStates( s => ({ ...s, [key]: 'done' }))
    } catch (e) {
      setStates( s => ({ ...s, [key]: 'error' }))
      setResults(s => ({ ...s, [key]: { error: e.message } }))
    }
  }

  const handleExtractAll = () => {
    files.forEach(f => {
      const key = f.name + f.size
      if (!states[key] || states[key] === 'error') handleExtract(f)
    })
  }

  const handleAdd = (file) => {
    const key = file.name + file.size
    const r   = results[key]
    if (r && !r.error) {
      onExtracted(r)
      setAddedSet(s => new Set([...s, key]))
    }
  }

  const pendingCount = files.filter(f => {
    const k = f.name+f.size; return !states[k] || states[k]==='idle' || states[k]==='error'
  }).length
  const doneCount = files.filter(f => states[f.name+f.size]==='done').length
  const addedCount = addedSet.size

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* ── How-to banner ── */}
      <div style={{
        padding:'14px 16px', background:'linear-gradient(135deg,#0078d410,#0f1623)',
        border:'1px solid #0078d420', borderRadius:'var(--radius)'
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', marginBottom:4 }}>
              ☁️ Sync from OneDrive
            </div>
            <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.6 }}>
              <strong style={{ color:'var(--text-primary)' }}>Step 1:</strong> Open your OneDrive folder below →
              download your receipt images →
              <strong style={{ color:'var(--text-primary)' }}> Step 2:</strong> Drop them here →
              <strong style={{ color:'var(--accent)' }}> Step 3:</strong> AI extracts & adds to dashboard
            </div>
          </div>
          <a href={SHARE_URL} target="_blank" rel="noopener noreferrer"
            style={{ display:'flex', alignItems:'center', gap:6, background:'#0078d4', color:'#fff',
              textDecoration:'none', padding:'8px 14px', borderRadius:8,
              fontFamily:'Sora', fontSize:12, fontWeight:700, flexShrink:0 }}>
            <ExternalLink size={13}/> Open OneDrive Folder
          </a>
        </div>
      </div>

      {/* ── Drop zone ── */}
      <div
        onDragOver={e=>{e.preventDefault();setDragOver(true)}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={handleDrop}
        onClick={()=>inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-light)'}`,
          borderRadius:'var(--radius)', padding:'32px 24px', textAlign:'center',
          cursor:'pointer', transition:'all 0.2s',
          background: dragOver ? 'var(--accent-dim)' : 'var(--bg-card)',
        }}
      >
        <input ref={inputRef} type="file" multiple accept={ACCEPTED}
          style={{ display:'none' }} onChange={e=>addFiles(e.target.files)} />

        <div style={{ fontSize:36, marginBottom:10 }}>
          {dragOver ? '📂' : '⬆️'}
        </div>
        <div style={{ fontSize:14, fontWeight:600, color: dragOver ? 'var(--accent)' : 'var(--text-primary)', marginBottom:4 }}>
          {dragOver ? 'Drop receipt images here' : 'Drop receipt images or click to browse'}
        </div>
        <div style={{ fontSize:12, color:'var(--text-muted)' }}>
          JPG, PNG, PDF, HEIC — up to {MAX_FILES} files at once
        </div>
        <div style={{ fontSize:11, color:'var(--text-dim)', marginTop:6 }}>
          📱 Works with photos taken of receipts, WhatsApp-saved images, or OneDrive downloads
        </div>
      </div>

      {/* ── File list ── */}
      {files.length > 0 && (
        <div>
          {/* Toolbar */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, flexWrap:'wrap', gap:8 }}>
            <div style={{ fontSize:13, color:'var(--text-muted)' }}>
              <strong style={{ color:'var(--text-primary)' }}>{files.length}</strong> file{files.length>1?'s':''} loaded
              {doneCount > 0 && <> · <span style={{color:'#22c55e'}}>{doneCount} extracted</span></>}
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
              <button onClick={()=>{setFiles([]);setStates({});setResults({});setAddedSet(new Set())}}
                style={{
                  background:'transparent', border:'1px solid var(--border)', color:'var(--text-muted)',
                  borderRadius:7, padding:'7px 12px', fontFamily:'Sora', fontSize:12, cursor:'pointer'
                }}>
                Clear All
              </button>
            </div>
          </div>

          {/* Cards grid */}
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {files.map(file => {
              const key = file.name + file.size
              return (
                <FileCard
                  key={key}
                  file={file}
                  state={states[key] || 'idle'}
                  result={results[key]}
                  added={addedSet.has(key)}
                  onExtract={() => handleExtract(file)}
                  onAdd={() => handleAdd(file)}
                  onRemove={() => removeFile(file)}
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
