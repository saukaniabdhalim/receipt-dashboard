import React, { useState, useEffect, useCallback, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import Dashboard from './components/Dashboard.jsx'
import ReceiptList from './components/ReceiptList.jsx'
import AddReceiptModal from './components/AddReceiptModal.jsx'
import OneDrivePanel from './components/OneDrivePanel.jsx'
import SettingsPanel  from './components/SettingsPanel.jsx'
import {
  LayoutDashboard, Receipt, CloudIcon, Plus, Menu,
  Download, Upload, Trash2, Github, Cloud, CloudOff,
  RefreshCw, Loader, Settings, LogIn, LogOut, User
} from 'lucide-react'
import { useMsal, AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react'
import { loginRequest } from './msalConfig.js'
import { loadFromGist, saveToGist } from './services/gistStorage.js'

// ── Local date helpers ───────────────────────────────────────
function localYearMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}
function localDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ── Categories ───────────────────────────────────────────────
export const CATEGORIES = [
  { id:'food',          label:'Food & Dining',    color:'#f97316', emoji:'🍜' },
  { id:'transport',     label:'Transport',         color:'#3b82f6', emoji:'🚗' },
  { id:'toll',          label:'Toll / Highway',    color:'#6366f1', emoji:'🛣️' },
  { id:'utilities',     label:'Utilities',         color:'#14b8a6', emoji:'💡' },
  { id:'shopping',      label:'Shopping',          color:'#ec4899', emoji:'🛍️' },
  { id:'healthcare',    label:'Healthcare',        color:'#22c55e', emoji:'🏥' },
  { id:'entertainment', label:'Entertainment',     color:'#a78bfa', emoji:'🎬' },
  { id:'grocery',       label:'Grocery',           color:'#eab308', emoji:'🛒' },
  { id:'education',     label:'Education',         color:'#06b6d4', emoji:'📚' },
  { id:'others',        label:'Others',            color:'#6b82a8', emoji:'📋' },
]

const LOCAL_KEY = 'resit_dashboard_data'


// ── App ───────────────────────────────────────────────────────
export default function App() {
  const [tab,             setTab]            = useState('dashboard')
  const [receipts,        setReceipts]       = useState([])
  const [showModal,       setShowModal]      = useState(false)
  const [editItem,        setEditItem]       = useState(null)
  const [sidebarOpen,     setSidebarOpen]    = useState(false)
  const [filterMonth,     setFilterMonth]    = useState('all')
  const [filterCategory,  setFilterCategory] = useState('all')
  const [search,          setSearch]         = useState('')
  const [toast,           setToast]          = useState(null)
  const [gistConnected,   setGistConnected]  = useState(true)  // always true — managed by worker
  const [syncStatus,      setSyncStatus]     = useState('idle')   // idle|syncing|synced|error
  const [syncError,       setSyncError]      = useState('')
  const [ghUser,          setGhUser]         = useState(null)
  const saveTimeout = useRef(null)
  const [cameraFile, setCameraFile] = useState(null)

  const { instance, accounts } = useMsal()
  const account = accounts[0]

  // ── Token acquisition ───────────────────────────────────────
  const getAccessToken = useCallback(async () => {
    if (!account) return null
    try {
      const response = await instance.acquireTokenSilent({
        ...loginRequest,
        account: account
      })
      return response.accessToken
    } catch (e) {
      try {
        const response = await instance.acquireTokenPopup({
          ...loginRequest,
          account: account
        })
        return response.accessToken
      } catch {
        return null
      }
    }
  }, [instance, account])

  // ── Init: load data ─────────────────────────────────────────
  useEffect(() => {
    if (!account) return

    const init = async () => {
      // 1. Load from localStorage immediately so UI is never blank
      try {
        const raw = localStorage.getItem(LOCAL_KEY)
        if (raw) {
          const local = JSON.parse(raw)
          if (local.length > 0) setReceipts(local)
        }
      } catch {}

      // 2. Then try to sync from Gist in background
      setSyncStatus('syncing')
      try {
        const token = await getAccessToken()
        const remote = await loadFromGist(token)
        if (remote.length > 0) {
          setReceipts(remote)
          localStorage.setItem(LOCAL_KEY, JSON.stringify(remote))
        }
        setSyncStatus('synced')
      } catch (e) {
        // Gist failed — keep whatever is in localStorage, just log the error
        setSyncStatus('error')
        setSyncError(e.message)
        console.warn('[Gist] Load failed, using localStorage:', e.message)
      }
    }
    init()
  }, [account, getAccessToken])

  // ── Auto-save: localStorage immediately + debounced Gist ───
  useEffect(() => {
    if (!account) return
    // Always save to localStorage regardless of gist status
    if (receipts.length > 0) {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(receipts))
    }

    // Debounced background sync to Gist
    clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(async () => {
      if (receipts.length === 0) return
      setSyncStatus('syncing')
      try {
        const token = await getAccessToken()
        await saveToGist(receipts, token)
        setSyncStatus('synced')
      } catch (e) {
        setSyncStatus('error')
        setSyncError(e.message)
        console.warn('[Gist] Save failed (data safe in localStorage):', e.message)
      }
    }, 1500)
  }, [receipts, account, getAccessToken])

  // ── Toast helper ────────────────────────────────────────────
  const showToast = useCallback((msg, type='success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }, [])

  // ── CRUD ────────────────────────────────────────────────────
  const addReceipt    = useCallback((d) => { setReceipts(p => [{ ...d, id:uuidv4() }, ...p]); showToast('Receipt added ✓') }, [showToast])
  const updateReceipt = useCallback((d) => { setReceipts(p => p.map(r => r.id===d.id ? d : r)); showToast('Receipt updated ✓') }, [showToast])
  const deleteReceipt = useCallback((id) => { setReceipts(p => p.filter(r => r.id!==id)); showToast('Deleted', 'error') }, [showToast])

  // ── Export / Import ─────────────────────────────────────────
  const exportCSV = () => {
    const header = 'Date,Merchant,Category,Amount,Currency,Description\n'
    const rows   = receipts.map(r =>
      `${r.date},"${r.merchant}","${CATEGORIES.find(c=>c.id===r.category)?.label||r.category}",${r.amount},${r.currency||'MYR'},"${r.description||''}"`
    ).join('\n')
    dl(new Blob([header+rows],{type:'text/csv'}), 'receipts.csv')
    showToast('Exported CSV ✓')
  }
  const exportJSON = () => {
    dl(new Blob([JSON.stringify(receipts,null,2)],{type:'application/json'}), 'receipts-backup.json')
    showToast('Backup exported ✓')
  }
  const importJSON = (e) => {
    const file = e.target.files[0]; if(!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result)
        if (Array.isArray(data)) {
          setReceipts(prev => {
            const ids = new Set(prev.map(r=>r.id))
            return [...data.filter(r=>!ids.has(r.id)), ...prev]
          })
          showToast(`Imported ${data.length} records ✓`)
        }
      } catch { showToast('Invalid JSON', 'error') }
    }
    reader.readAsText(file); e.target.value=''
  }
  const dl = (blob, name) => {
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click()
  }
  const clearAll = () => {
    if (confirm('Clear ALL receipts? Cannot be undone.')) {
      setReceipts([]); localStorage.removeItem(LOCAL_KEY); showToast('All data cleared','error')
    }
  }

  // ── Gist handlers ───────────────────────────────────────────
  const handleGistConnected = ({ user, gistId }) => {
    setGistConnected(true)
    setGhUser(user)
    showToast(`Connected to GitHub as @${user.login} ✓`)
  }
  const handleDisconnect = () => {
    if (confirm('Disconnect GitHub Gist? Your local data stays — it just won\'t sync to GitHub anymore.')) {
      // disconnected
      setGistConnected(false)
      setGhUser(null)
      setSyncStatus('idle')
      showToast('Disconnected from GitHub', 'error')
    }
  }
  const handleManualSync = async () => {
    setSyncStatus('syncing')
    try {
      const token = await getAccessToken()
      await saveToGist(receipts, token)
      setSyncStatus('synced')
      showToast('Synced to GitHub ✓')
    } catch (e) {
      setSyncStatus('error')
      setSyncError(e.message)
      showToast('Sync failed: ' + e.message, 'error')
    }
  }

  // ── Computed ─────────────────────────────────────────────────
  const totalThisMonth = receipts
    .filter(r => r.date?.startsWith(localYearMonth()))
    .reduce((s,r) => s+Number(r.amount), 0)

  const navItems = [
    { id:'dashboard', label:'Dashboard',    icon:LayoutDashboard },
    { id:'receipts',  label:'Transactions', icon:Receipt },
    { id:'onedrive',  label:'OneDrive',     icon:CloudIcon },
    { id:'settings',  label:'Settings',     icon:Settings  },
  ]
  const pageTitle = {
    dashboard:'📊 Dashboard Overview',
    receipts: '🧾 All Transactions',
    onedrive:  '☁️ OneDrive Receipts',
    settings:  '⚙️ Settings',
  }

  // ── Sync status badge ─────────────────────────────────────────
  const SyncBadge = () => {
    if (!gistConnected) return null
    const cfg = {
      syncing:{ color:'#f5a623', icon:<Loader size={10} style={{animation:'spin 1s linear infinite'}}/>, label:'Saving…' },
      synced: { color:'#22c55e', icon:'✓',   label:'Saved to GitHub' },
      error:  { color:'#ef4444', icon:'⚠',   label:'Sync error' },
      idle:   { color:'#6b82a8', icon:<Cloud size={10}/>, label:'GitHub Gist' },
    }[syncStatus] || {}
    return (
      <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11,
        color:cfg.color, padding:'3px 8px', borderRadius:20,
        background:`${cfg.color}12`, border:`1px solid ${cfg.color}30` }}>
        {cfg.icon} {cfg.label}
      </div>
    )
  }

  const handleLogin = () => instance.loginRedirect(loginRequest)
  const handleLogout = () => instance.logoutRedirect()

  // ─────────────────────────────────────────────────────────────
  return (
    <>
      <AuthenticatedTemplate>
        <div style={{ display:'flex', minHeight:'100vh' }}>
      {sidebarOpen && (
        <div onClick={()=>setSidebarOpen(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:40, backdropFilter:'blur(2px)' }}/>
      )}

      {/* ── Sidebar ── */}
      <aside className="sidebar" style={{
        width:240, flexShrink:0, background:'var(--bg-card)',
        borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column',
        position:'fixed', top:0, left:sidebarOpen?0:-260, bottom:0, zIndex:50,
        transition:'left 0.3s ease',
      }}>
        {/* Logo */}
        <div style={{ padding:'20px 16px 14px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:9 }}>
            <div style={{ width:34, height:34, borderRadius:9, background:'var(--accent-dim)', border:'1px solid var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>🧾</div>
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:'var(--text-primary)' }}>Resit</div>
              <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:-1 }}>Dashboard</div>
            </div>
          </div>
        </div>

        {/* Month summary */}
        <div style={{ margin:'12px 10px 4px', padding:'11px 13px', background:'var(--accent-dim)', borderRadius:9, border:'1px solid rgba(245,166,35,0.2)' }}>
          <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:3 }}>This Month</div>
          <div style={{ fontSize:19, fontWeight:700, color:'var(--accent)', fontFamily:'JetBrains Mono' }}>RM {totalThisMonth.toFixed(2)}</div>
          <div style={{ fontSize:10, color:'var(--text-dim)', marginTop:1 }}>
            {receipts.filter(r=>r.date?.startsWith(localYearMonth())).length} transactions
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding:'8px 10px', flex:1 }}>
          {navItems.map(item => {
            const Icon=item.icon; const active=tab===item.id
            return (
              <button key={item.id} onClick={()=>{setTab(item.id);setSidebarOpen(false)}}
                style={{
                  display:'flex', alignItems:'center', gap:9, width:'100%',
                  padding:'9px 11px', borderRadius:7, border:'none', cursor:'pointer', marginBottom:1,
                  fontFamily:'Sora,sans-serif', fontSize:13, fontWeight:active?600:400,
                  background: active ? (item.id==='onedrive'?'#0078d418':'var(--accent-dim)') : 'transparent',
                  color:      active ? (item.id==='onedrive'?'#0078d4':'var(--accent)') : 'var(--text-muted)',
                  transition:'all 0.2s',
                }}>
                <Icon size={15} strokeWidth={active?2.5:1.8}/>
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* ── GitHub Gist storage section ── */}
        <div style={{ margin:'0 10px 8px', borderRadius:9, border:'1px solid var(--border)', overflow:'hidden' }}>
          <div style={{ padding:'9px 11px', background:'var(--bg-primary)', borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Storage</div>
            {gistConnected ? (
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11 }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:syncStatus==='error'?'#ef4444':syncStatus==='syncing'?'#f5a623':'#22c55e' }}/>
                  <span style={{ color:'var(--text-primary)', fontWeight:600 }}>
                    {syncStatus==='syncing' ? 'Saving to Gist…'
                      : syncStatus==='error' ? 'Sync error'
                      : 'GitHub Gist ✓'}
                  </span>
                </div>

                <div style={{ display:'flex', gap:4, marginTop:2 }}>
                  <button onClick={handleManualSync} disabled={syncStatus==='syncing'}
                    style={{ ...smallBtnStyle('#22c55e'), flex:1 }}>
                    <RefreshCw size={10}/> Sync
                  </button>
                  <button onClick={handleDisconnect} style={{ ...smallBtnStyle('#ef4444'), flex:1 }}>
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize:11, color:'var(--text-dim)', marginBottom:6, lineHeight:1.4 }}>
                  Data only in browser.<br/>Connect GitHub to save permanently.
                </div>
<div style={{fontSize:11,color:'var(--text-muted)'}}>Go to ⚙️ Settings to check status</div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding:'10px', borderTop:'1px solid var(--border)' }}>
          <button onClick={exportCSV}  style={actionBtnStyle}><Download size={12}/> Export CSV</button>
          <button onClick={exportJSON} style={actionBtnStyle}><Download size={12}/> Backup JSON</button>
          <label style={{ ...actionBtnStyle, display:'flex', cursor:'pointer' }}>
            <Upload size={12}/> Import JSON
            <input type="file" accept=".json" onChange={importJSON} style={{ display:'none' }}/>
          </label>
          <button onClick={handleLogout} style={{ ...actionBtnStyle, color:'#ef4444' }}><LogOut size={12}/> Sign Out</button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="main-area" style={{ flex:1, marginLeft:0, display:'flex', flexDirection:'column', minHeight:'100vh' }}>
        {/* Topbar */}
        <header style={{
          position:'sticky', top:0, zIndex:30,
          background:'rgba(8,12,20,0.9)', backdropFilter:'blur(12px)',
          borderBottom:'1px solid var(--border)', padding:'0 20px',
          display:'flex', alignItems:'center', gap:12, height:56,
        }}>
          <button onClick={()=>setSidebarOpen(v=>!v)}
            style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', padding:4 }}>
            <Menu size={19}/>
          </button>
          <h1 style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)', flex:1 }}>{pageTitle[tab]}</h1>
          <SyncBadge/>
          {tab !== 'onedrive' && tab !== 'settings' && (
            <button onClick={()=>{ setEditItem(null); setShowModal(true) }}
              style={{ display:'flex', alignItems:'center', gap:5,
                background:'var(--accent)', color:'#000', border:'none', borderRadius:7,
                padding:'7px 13px', fontFamily:'Sora', fontWeight:700, fontSize:12, cursor:'pointer' }}>
              <Plus size={13} strokeWidth={2.5}/> Add
            </button>
          )}
        </header>

        {/* Page */}
        <main style={{ flex:1, padding:'20px', overflowY:'auto' }} className="animate-in">
          {tab==='dashboard' && (
            <Dashboard receipts={receipts} filterMonth={filterMonth} setFilterMonth={setFilterMonth}
              filterCategory={filterCategory} setFilterCategory={setFilterCategory}
              onEdit={r=>{ setEditItem(r); setShowModal(true) }}
              onDelete={deleteReceipt} onAddClick={()=>{ setEditItem(null); setShowModal(true) }}/>
          )}
          {tab==='receipts' && (
            <ReceiptList receipts={receipts} search={search} setSearch={setSearch}
              filterMonth={filterMonth} setFilterMonth={setFilterMonth}
              filterCategory={filterCategory} setFilterCategory={setFilterCategory}
              onEdit={r=>{ setEditItem(r); setShowModal(true) }} onDelete={deleteReceipt}/>
          )}
          {tab==='settings' && (
            <SettingsPanel onGistConnected={({ user, gistId }) => {
              setGistConnected(true)
              setGhUser(user)
              showToast(`Connected to GitHub as @${user.login} ✓`)
            }}/>
          )}
          {tab==='onedrive' && (
            <div style={{ maxWidth:680 }}>
              <p style={{ color:'var(--text-muted)', fontSize:13, marginBottom:16 }}>
                Open your OneDrive folder, download receipt images, then drop them below.
                Claude AI reads each receipt and adds it to your dashboard.
              </p>
              <OneDrivePanel
                getAccessToken={getAccessToken}
                cameraFile={cameraFile}
                onCameraFileConsumed={() => setCameraFile(null)}
                onExtracted={data => {
                  // Opens modal pre-filled for review
                  setEditItem({
                    id:          undefined,
                    date:        data.date        || localDateStr(),
                    merchant:    data.merchant    || '',
                    amount:      data.amount      ? String(data.amount) : '',
                    category:    data.category    || 'others',
                    description: data.description || '',
                    currency:    data.currency    || 'MYR',
                    imageNote:   data.imageNote   || '',
                  })
                  setShowModal(true)
                  showToast('✅ Receipt extracted — review & save')
                }}
                onDirectSave={data => {
                  // Called by Save Receipt button — saves directly, no modal
                  addReceipt({
                    date:        data.date        || localDateStr(),
                    merchant:    data.merchant    || 'Unknown',
                    amount:      Number(data.amount) || 0,
                    category:    data.category    || 'others',
                    description: data.description || '',
                    currency:    data.currency    || 'MYR',
                    imageNote:   data.imageNote   || '',
                  })
                }}/>
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      {showModal && (
        <AddReceiptModal item={editItem}
          onClose={()=>{ setShowModal(false); setEditItem(null) }}
          onSave={data => {
            if (editItem?.id) updateReceipt(data); else addReceipt(data)
            setShowModal(false); setEditItem(null)
          }}/>
      )}


      {/* Toast */}
      {toast && (
        <div style={{
          position:'fixed', bottom:20, right:20, zIndex:200,
          background: toast.type==='error' ? '#1a0a0a' : '#0a1a0f',
          border:`1px solid ${toast.type==='error' ? '#ef4444' : '#22c55e'}`,
          color: toast.type==='error' ? '#ef4444' : '#22c55e',
          borderRadius:9, padding:'11px 16px', fontSize:13, fontWeight:500,
          boxShadow:'var(--shadow-lg)', animation:'fadeUp 0.3s ease'
        }}>{toast.msg}</div>
      )}

      {/* ── Mobile Camera FAB ── */}
      <MobileCameraFAB onCapture={(file) => {
        // Add file to OneDrive panel via tab switch + state
        setTab('onedrive')
        showToast('📸 Photo captured — tap Extract with AI')
        // We'll pass it through a small state trick
        setCameraFile(file)
      }} />

      <style>{`
        @media (min-width: 768px) {
          .sidebar { left: 0 !important; }
          .main-area { margin-left: 240px !important; }
        }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
      </AuthenticatedTemplate>

      <UnauthenticatedTemplate>
        <div style={{
          height:'100vh', display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center', gap:24,
          background:'var(--bg-primary)', padding:20, textAlign:'center'
        }}>
          <div style={{ width:80, height:80, borderRadius:20, background:'var(--accent-dim)', border:'1px solid var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:40 }}>🧾</div>
          <div>
            <h1 style={{ fontSize:28, fontWeight:800, color:'var(--text-primary)', marginBottom:8 }}>Receipt Dashboard</h1>
            <p style={{ color:'var(--text-muted)', maxWidth:300, fontSize:14, lineHeight:1.6 }}>
              Securely manage your personal receipts with AI extraction and OneDrive sync.
            </p>
          </div>
          <button onClick={handleLogin}
            style={{
              display:'flex', alignItems:'center', gap:10,
              background:'var(--accent)', color:'#000', border:'none', borderRadius:12,
              padding:'14px 28px', fontFamily:'Sora', fontWeight:800, fontSize:15,
              cursor:'pointer', boxShadow:'0 10px 20px rgba(245,166,35,0.2)'
            }}>
            <LogIn size={18} strokeWidth={2.5}/> Sign In with Microsoft
          </button>
          <div style={{ fontSize:12, color:'var(--text-dim)', marginTop:20 }}>
            Protected by Microsoft Entra ID
          </div>
        </div>
      </UnauthenticatedTemplate>
    </>
  )
}

// ── Inline mobile camera FAB ──────────────────────────────────
function MobileCameraFAB({ onCapture }) {
  const inputRef = React.useRef()
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
  if (!isMobile) return null
  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" capture="environment"
        style={{ display:'none' }}
        onChange={e => { if (e.target.files?.[0]) { onCapture(e.target.files[0]); e.target.value='' } }} />
      <button onClick={() => inputRef.current?.click()} title="Scan receipt"
        style={{
          position:'fixed', bottom:24, right:20, zIndex:150,
          width:60, height:60, borderRadius:'50%',
          background:'linear-gradient(135deg,#6366f1,#a78bfa)',
          border:'3px solid rgba(255,255,255,0.15)',
          cursor:'pointer', color:'#fff',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 6px 28px rgba(99,102,241,0.55)',
        }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
      </button>
    </>
  )
}

const actionBtnStyle = {
  display:'flex', alignItems:'center', gap:6, width:'100%',
  background:'transparent', border:'none', color:'var(--text-muted)',
  padding:'7px 9px', borderRadius:5, cursor:'pointer', fontSize:11,
  fontFamily:'Sora,sans-serif', marginBottom:1, transition:'color 0.2s',
}
const smallBtnStyle = (color) => ({
  display:'flex', alignItems:'center', justifyContent:'center', gap:4,
  background:`${color}12`, border:`1px solid ${color}25`, color,
  borderRadius:5, padding:'4px 6px', cursor:'pointer',
  fontFamily:'Sora', fontSize:10, fontWeight:600,
})

// ── Mobile Camera FAB (floating action button) ────────────────
// This is exported so it can be used if needed, but it's embedded
// directly into App via the CameraFAB component below.
export function CameraFAB({ onCapture }) {
  const inputRef = React.useRef()
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
  if (!isMobile) return null
  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" capture="environment"
        style={{ display:'none' }}
        onChange={e => { if (e.target.files[0]) { onCapture(e.target.files[0]); e.target.value='' } }} />
      <button
        onClick={() => inputRef.current?.click()}
        title="Scan receipt with camera"
        style={{
          position:'fixed', bottom:24, right:24, zIndex:150,
          width:58, height:58, borderRadius:'50%',
          background:'linear-gradient(135deg,#6366f1,#a78bfa)',
          border:'none', cursor:'pointer', color:'#fff',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 6px 24px rgba(99,102,241,0.5)',
          transition:'transform 0.15s',
        }}
        onMouseDown={e => e.currentTarget.style.transform='scale(0.92)'}
        onMouseUp={e => e.currentTarget.style.transform='scale(1)'}
      >
        {/* Camera SVG icon inline */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
      </button>
    </>
  )
}
