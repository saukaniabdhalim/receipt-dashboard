import React, { useState, useEffect, useCallback } from 'react'
import { listOneDriveFiles, getOneDriveRoot, ONEDRIVE_FOLDER_URL } from '../services/oneDriveService.js'
import { FolderOpen, File, Image, FileText, RefreshCw, ExternalLink, AlertCircle, ChevronRight, Home, Loader } from 'lucide-react'

function fileIcon(item) {
  if (item.folder) return <FolderOpen size={15} color="#f5a623" />
  const name = item.name?.toLowerCase() || ''
  if (/\.(jpg|jpeg|png|gif|webp|heic)$/.test(name)) return <Image size={15} color="#22c55e" />
  if (/\.(pdf)$/.test(name)) return <FileText size={15} color="#ef4444" />
  return <File size={15} color="#6b82a8" />
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes/1024).toFixed(0)} KB`
  return `${(bytes/1048576).toFixed(1)} MB`
}

function formatDate(str) {
  if (!str) return ''
  return new Date(str).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function OneDrivePanel({ onSelectFile, compact = false }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [breadcrumb, setBreadcrumb] = useState([{ name: 'Receipts', id: null }])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async (itemId = null, label = 'Receipts') => {
    setLoading(true)
    setError(null)
    try {
      const items = await listOneDriveFiles(itemId)
      // Sort: folders first, then by name
      items.sort((a, b) => {
        if (a.folder && !b.folder) return -1
        if (!a.folder && b.folder) return 1
        return a.name.localeCompare(b.name)
      })
      setFiles(items)
      setLoaded(true)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, [])

  const openFolder = (item) => {
    setBreadcrumb(prev => [...prev, { name: item.name, id: item.id }])
    load(item.id, item.name)
  }

  const navBreadcrumb = (idx) => {
    const crumb = breadcrumb[idx]
    setBreadcrumb(prev => prev.slice(0, idx + 1))
    load(crumb.id, crumb.name)
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
        borderBottom: loaded || error ? '1px solid var(--border)' : 'none',
        background: 'var(--bg-primary)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* OneDrive logo colour dot */}
          <div style={{ display: 'flex', gap: 2 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0078d4' }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0078d4', opacity: 0.6 }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>OneDrive</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', background: 'var(--bg-card)', padding: '2px 6px', borderRadius: 4 }}>
            Receipts Folder
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!loaded && !loading && (
            <button onClick={() => load(null)} style={headerBtnStyle('#0078d4')}>
              <FolderOpen size={12} /> Browse
            </button>
          )}
          {loaded && (
            <button onClick={() => load(breadcrumb[breadcrumb.length-1].id)} style={headerBtnStyle('#6b82a8')} title="Refresh">
              <RefreshCw size={12} />
            </button>
          )}
          <a href={ONEDRIVE_FOLDER_URL} target="_blank" rel="noopener noreferrer" style={{ ...headerBtnStyle('#6b82a8'), textDecoration: 'none' }} title="Open in OneDrive">
            <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 8, background: '#1a0a0a' }}>
          <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>Could not load OneDrive folder</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{error}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              💡 The folder must be set to <strong style={{color:'var(--text-primary)'}}>Anyone with the link can view</strong>.{' '}
              <a href={ONEDRIVE_FOLDER_URL} target="_blank" rel="noopener noreferrer" style={{ color: '#0078d4' }}>
                Open folder in OneDrive →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)' }}>
          <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 13 }}>Loading files…</span>
        </div>
      )}

      {/* Not loaded yet */}
      {!loaded && !loading && !error && (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>☁️</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Browse your OneDrive receipts folder</div>
          <button onClick={() => load(null)} style={{
            background: '#0078d4', color: '#fff', border: 'none', borderRadius: 8,
            padding: '8px 20px', fontFamily: 'Sora', fontSize: 13, cursor: 'pointer', fontWeight: 600
          }}>
            Browse Files
          </button>
        </div>
      )}

      {/* Breadcrumb */}
      {loaded && !loading && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '8px 14px',
          borderBottom: '1px solid var(--border)', flexWrap: 'wrap'
        }}>
          {breadcrumb.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight size={12} color="var(--text-dim)" />}
              <button onClick={() => navBreadcrumb(i)}
                style={{
                  background: 'none', border: 'none', cursor: i < breadcrumb.length-1 ? 'pointer' : 'default',
                  color: i === breadcrumb.length-1 ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: 12, fontFamily: 'Sora', fontWeight: i === breadcrumb.length-1 ? 600 : 400,
                  padding: '2px 4px', borderRadius: 4,
                  textDecoration: i < breadcrumb.length-1 ? 'underline' : 'none',
                }}>
                {i === 0 ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Home size={11} />{crumb.name}</span> : crumb.name}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* File list */}
      {loaded && !loading && (
        <div style={{ maxHeight: compact ? 220 : 340, overflowY: 'auto' }}>
          {files.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Empty folder
            </div>
          )}
          {files.map(item => (
            <div key={item.id}
              onClick={() => item.folder ? openFolder(item) : onSelectFile?.(item)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px', cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
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
              {item.folder && <ChevronRight size={13} color="var(--text-dim)" />}
              {!item.folder && onSelectFile && (
                <button
                  onClick={e => { e.stopPropagation(); onSelectFile(item) }}
                  style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 5,
                    background: 'var(--accent-dim)', border: '1px solid rgba(245,166,35,0.3)',
                    color: 'var(--accent)', cursor: 'pointer', fontFamily: 'Sora', flexShrink: 0
                  }}>
                  Select
                </button>
              )}
              {!item.folder && item.webUrl && (
                <a href={item.webUrl} target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{ color: 'var(--text-dim)', flexShrink: 0 }} title="Open in OneDrive">
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          ))}
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
