import React, { useState, useCallback } from 'react'
import {
  listOneDriveFiles, getFileDownloadUrl, fetchFileAsBase64,
  isReceiptFile, isImageFile, SHARE_URL
} from '../services/oneDriveService.js'
import { extractReceiptData, getMimeType } from '../services/extractionService.js'
import {
  FolderOpen, File, Image, FileText, RefreshCw,
  ExternalLink, AlertCircle, ChevronRight, Home,
  Loader, Sparkles, CheckCircle, AlertTriangle
} from 'lucide-react'

function fileIcon(item) {
  if (item.folder) return <FolderOpen size={15} color="#f5a623" />
  const name = item.name?.toLowerCase() || ''
  if (/\.(jpg|jpeg|png|gif|webp|heic)$/.test(name)) return <Image size={15} color="#22c55e" />
  if (/\.pdf$/.test(name)) return <FileText size={15} color="#ef4444" />
  return <File size={15} color="#6b82a8" />
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function formatDate(str) {
  if (!str) return ''
  return new Date(str).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
}

const confidenceColor = { high: '#22c55e', medium: '#f5a623', low: '#ef4444' }

export default function OneDrivePanel({ onExtracted, compact = false }) {
  const [files, setFiles]         = useState([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [loaded, setLoaded]       = useState(false)
  const [breadcrumb, setBreadcrumb] = useState([{ name: 'Receipts Folder', id: null }])
  // Per-file extraction state: { [id]: 'idle'|'loading'|'done'|'error' }
  const [extractState, setExtractState] = useState({})
  // Last extracted result per file
  const [extractResult, setExtractResult] = useState({})

  const loadFiles = useCallback(async (itemId = null) => {
    setLoading(true); setError(null)
    try {
      const items = await listOneDriveFiles(itemId)
      items.sort((a, b) => {
        if (a.folder && !b.folder) return -1
        if (!a.folder && b.folder) return 1
        return a.name.localeCompare(b.name)
      })
      setFiles(items); setLoaded(true)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [])

  const openFolder = (item) => {
    setBreadcrumb(prev => [...prev, { name: item.name, id: item.id }])
    loadFiles(item.id)
  }

  const navBreadcrumb = (idx) => {
    const crumb = breadcrumb[idx]
    setBreadcrumb(prev => prev.slice(0, idx + 1))
    loadFiles(crumb.id)
  }

  const handleExtract = async (item) => {
    setExtractState(s => ({ ...s, [item.id]: 'loading' }))
    try {
      // 1. Get download URL
      const downloadUrl = await getFileDownloadUrl(item)
      if (!downloadUrl) throw new Error('Could not get download URL for this file')

      // 2. Fetch file as base64
      const base64 = await fetchFileAsBase64(downloadUrl)
      const mimeType = getMimeType(item.name)

      // 3. Send to Claude API for extraction
      const result = await extractReceiptData(base64, mimeType, item.name)

      // Attach the OneDrive link as imageNote
      result.imageNote = item.webUrl || downloadUrl

      setExtractResult(s => ({ ...s, [item.id]: result }))
      setExtractState(s => ({ ...s, [item.id]: 'done' }))
    } catch (e) {
      setExtractState(s => ({ ...s, [item.id]: 'error' }))
      setExtractResult(s => ({ ...s, [item.id]: { error: e.message } }))
    }
  }

  const handleAddToTransactions = (item) => {
    const result = extractResult[item.id]
    if (result && !result.error) {
      onExtracted(result)
    }
  }

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: compact ? '10px 14px' : '14px 18px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-primary)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>☁️</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>OneDrive</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', background: 'var(--bg-card)', padding: '2px 6px', borderRadius: 4 }}>
            Receipts Folder
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {loaded && (
            <button onClick={() => loadFiles(breadcrumb[breadcrumb.length-1].id)}
              style={headerBtnStyle('#6b82a8')} title="Refresh">
              <RefreshCw size={12} />
            </button>
          )}
          <a href={SHARE_URL} target="_blank" rel="noopener noreferrer"
            style={{ ...headerBtnStyle('#0078d4'), textDecoration: 'none' }} title="Open folder in OneDrive">
            <ExternalLink size={12} /> Open Folder
          </a>
        </div>
      </div>

      {/* How it works banner */}
      {!loaded && !loading && !error && (
        <div style={{ padding: '12px 16px', background: '#0f1a2e', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
            ✨ How it works
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[
              '1. Click "Load Files" to browse your OneDrive receipts folder',
              '2. Click "Extract with AI" on any receipt image',
              '3. Claude AI reads the receipt and fills in merchant, amount, date & category',
              '4. Click "Add to Dashboard" — transaction appears instantly in your charts',
            ].map((t, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 6 }}>
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: '12px 16px', display: 'flex', gap: 8, background: '#1a0a0a', borderBottom: '1px solid var(--border)' }}>
          <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>Could not load OneDrive folder</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{error}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Make sure your folder is shared as <strong style={{ color: 'var(--text-primary)' }}>Anyone with the link</strong>.{' '}
              <a href={SHARE_URL} target="_blank" rel="noopener noreferrer" style={{ color: '#0078d4' }}>
                Open folder in OneDrive →
              </a>
            </div>
            <button onClick={() => loadFiles(null)}
              style={{ marginTop: 8, ...headerBtnStyle('#f5a623') }}>
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)' }}>
          <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 13 }}>Loading files from OneDrive…</span>
        </div>
      )}

      {/* Not loaded yet */}
      {!loaded && !loading && !error && (
        <div style={{ padding: '32px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>☁️</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
            Browse your OneDrive receipts folder
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
            AI will extract merchant, amount, date & category from your receipt images
          </div>
          <button onClick={() => loadFiles(null)} style={{
            background: '#0078d4', color: '#fff', border: 'none', borderRadius: 8,
            padding: '9px 24px', fontFamily: 'Sora', fontSize: 13, cursor: 'pointer', fontWeight: 700
          }}>
            Load Files
          </button>
        </div>
      )}

      {/* Breadcrumb */}
      {loaded && !loading && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '8px 14px',
          borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
          background: 'var(--bg-primary)'
        }}>
          {breadcrumb.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight size={12} color="var(--text-dim)" />}
              <button onClick={() => navBreadcrumb(i)} style={{
                background: 'none', border: 'none',
                cursor: i < breadcrumb.length - 1 ? 'pointer' : 'default',
                color: i === breadcrumb.length - 1 ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: 12, fontFamily: 'Sora', fontWeight: i === breadcrumb.length - 1 ? 600 : 400,
                padding: '2px 4px', borderRadius: 4,
                textDecoration: i < breadcrumb.length - 1 ? 'underline' : 'none',
              }}>
                {i === 0
                  ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Home size={11} />{crumb.name}</span>
                  : crumb.name}
              </button>
            </React.Fragment>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
            {files.length} item{files.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* File list */}
      {loaded && !loading && (
        <div style={{ maxHeight: compact ? 300 : 500, overflowY: 'auto' }}>
          {files.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No files in this folder
            </div>
          )}

          {files.map(item => {
            const state   = extractState[item.id]  || 'idle'
            const result  = extractResult[item.id]
            const isFile  = !item.folder
            const canExtract = isFile && isReceiptFile(item)

            return (
              <div key={item.id}>
                {/* File row */}
                <div
                  onClick={() => item.folder ? openFolder(item) : null}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', cursor: item.folder ? 'pointer' : 'default',
                    borderBottom: '1px solid var(--border)', transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (item.folder) e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ flexShrink: 0 }}>{fileIcon(item)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: item.folder ? 600 : 400 }}
                      className="truncate">{item.name}</div>
                    {!item.folder && (
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>
                        {formatSize(item.size)} · {formatDate(item.lastModifiedDateTime)}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {item.folder && <ChevronRight size={13} color="var(--text-dim)" />}

                  {canExtract && state === 'idle' && (
                    <button onClick={() => handleExtract(item)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        background: 'linear-gradient(135deg, #6366f120, #a78bfa20)',
                        border: '1px solid #a78bfa50', color: '#a78bfa',
                        borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
                        fontFamily: 'Sora', fontSize: 11, fontWeight: 600, flexShrink: 0,
                        transition: 'all 0.2s',
                      }}>
                      <Sparkles size={11} /> Extract with AI
                    </button>
                  )}

                  {state === 'loading' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#a78bfa', fontSize: 11, flexShrink: 0 }}>
                      <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
                      Reading receipt…
                    </div>
                  )}

                  {state === 'done' && !result?.error && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#22c55e', fontSize: 11, flexShrink: 0 }}>
                      <CheckCircle size={12} /> Extracted
                    </div>
                  )}

                  {state === 'error' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#ef4444', fontSize: 11, flexShrink: 0 }}>
                      <AlertTriangle size={12} /> Failed
                    </div>
                  )}

                  {item.webUrl && (
                    <a href={item.webUrl} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{ color: 'var(--text-dim)', flexShrink: 0, marginLeft: 4 }}>
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>

                {/* Extracted result card */}
                {state === 'done' && result && !result.error && (
                  <div style={{
                    margin: '0 14px 10px', padding: '12px 14px',
                    background: '#0a1a0f', border: '1px solid #22c55e30',
                    borderRadius: 8, animation: 'fadeUp 0.3s ease'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>
                        ✅ AI Extracted Receipt Data
                      </span>
                      <span style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 3,
                        background: `${confidenceColor[result.confidence]}20`,
                        color: confidenceColor[result.confidence], fontWeight: 600
                      }}>
                        {result.confidence?.toUpperCase()} CONFIDENCE
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', marginBottom: 10 }}>
                      {[
                        ['Merchant', result.merchant],
                        ['Amount',   result.amount ? `RM ${Number(result.amount).toFixed(2)}` : '—'],
                        ['Date',     result.date],
                        ['Category', result.category],
                        ['Desc',     result.description],
                      ].map(([k, v]) => v && (
                        <div key={k}>
                          <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>{k}</span>
                          <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>{v}</div>
                        </div>
                      ))}
                    </div>

                    <button onClick={() => handleAddToTransactions(item)}
                      style={{
                        width: '100%', padding: '8px', background: 'var(--accent)', color: '#000',
                        border: 'none', borderRadius: 7, cursor: 'pointer',
                        fontFamily: 'Sora', fontWeight: 700, fontSize: 13,
                      }}>
                      ➕ Add to Dashboard
                    </button>
                  </div>
                )}

                {/* Extraction error */}
                {state === 'error' && result?.error && (
                  <div style={{
                    margin: '0 14px 10px', padding: '10px 12px',
                    background: '#1a0a0a', border: '1px solid #ef444430',
                    borderRadius: 8, fontSize: 12, color: '#ef4444'
                  }}>
                    ⚠️ {result.error}
                    <button onClick={() => { setExtractState(s => ({ ...s, [item.id]: 'idle' })) }}
                      style={{ marginLeft: 10, background: 'none', border: 'none', color: '#f5a623', cursor: 'pointer', fontSize: 12 }}>
                      Retry
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}

const headerBtnStyle = (color) => ({
  display: 'flex', alignItems: 'center', gap: 4,
  background: `${color}18`, border: `1px solid ${color}30`, color,
  borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
  fontSize: 11, fontFamily: 'Sora', fontWeight: 600
})
