import React, { useState, useEffect, useCallback, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import Dashboard from './components/Dashboard.jsx'
import ReceiptList from './components/ReceiptList.jsx'
import AddReceiptModal from './components/AddReceiptModal.jsx'
import OneDrivePanel from './components/OneDrivePanel.jsx'
import GistSetupModal from './components/GistSetupModal.jsx'
import {
  LayoutDashboard, Receipt, CloudIcon, Plus, Menu,
  Download, Upload, Trash2, Github, Cloud, CloudOff,
  RefreshCw, Loader
} from 'lucide-react'
import { SHARE_URL } from './services/oneDriveService.js'
import {
  isConfigured, getSettings, clearSettings,
  loadFromGist, saveToGist, getGistUrl
} from './services/gistStorage.js'

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

function seedData() {
  const m = n => { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0] }
  return [
    { id:uuidv4(), date:m(1),  merchant:'Tesco Ipoh',      category:'grocery',       amount:87.50,  description:'Weekly grocery',      currency:'MYR', imageNote:'' },
    { id:uuidv4(), date:m(2),  merchant:'Petronas',         category:'transport',     amount:60.00,  description:'Petrol RON95',         currency:'MYR', imageNote:'' },
    { id:uuidv4(), date:m(3),  merchant:'PLUS Highway',     category:'toll',          amount:12.30,  description:'KL-Ipoh toll',         currency:'MYR', imageNote:'' },
    { id:uuidv4(), date:m(4),  merchant:"McDonald's",       category:'food',          amount:24.90,  description:'Lunch',                currency:'MYR', imageNote:'' },
    { id:uuidv4(), date:m(5),  merchant:'TNB',              category:'utilities',     amount:135.00, description:'Electricity bill',     currency:'MYR', imageNote:'' },
    { id:uuidv4(), date:m(6),  merchant:'Uniqlo',           category:'shopping',      amount:199.00, description:'Clothes',              currency:'MYR', imageNote:'' },
    { id:uuidv4(), date:m(7),  merchant:'Klinik Kesihatan', category:'healthcare',    amount:15.00,  description:'GP visit',             currency:'MYR', imageNote:'' },
    { id:uuidv4(), date:m(10), merchant:'Netflix',          category:'entertainment', amount:54.90,  description:'Monthly subscription', currency:'MYR', imageNote:'' },
    { id:uuidv4(), date:m(12), merchant:'Mamak Corner',     category:'food',          amount:18.50,  description:'Dinner',               currency:'MYR', imageNote:'' },
    { id:uuidv4(), date:m(15), merchant:'Grab',             category:'transport',     amount:22.00,  description:'GrabCar ride',         currency:'MYR', imageNote:'' },
    { id:uuidv4(), date:m(20), merchant:'Guardian',         category:'healthcare',    amount:45.80,  description:'Medicine',             currency:'MYR', imageNote:'' },
    { id:uuidv4(), date:m(22), merchant:'Aeon',             category:'shopping',      amount:320.00, description:'Household items',      currency:'MYR', imageNote:'' },
    { id:uuidv4(), date:m(28), merchant:'Celcom',           category:'utilities',     amount:88.00,  description:'Mobile plan',          currency:'MYR', imageNote:'' },
    { id:uuidv4(), date:m(35), merchant:'Pizza Hut',        category:'food',          amount:55.00,  description:'Family dinner',        currency:'MYR', imageNote:'' },
    { id:uuidv4(), date:m(45), merchant:"Lotus's",          category:'grocery',       amount:95.30,  description:'Grocery',              currency:'MYR', imageNote:'' },
  ]
}

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
  const [showGistSetup,   setShowGistSetup]  = useState(false)
  const [gistConnected,   setGistConnected]  = useState(false)
  const [syncStatus,      setSyncStatus]     = useState('idle')   // idle|syncing|synced|error
  const [syncError,       setSyncError]      = useState('')
  const [ghUser,          setGhUser]         = useState(null)
  const saveTimeout = useRef(null)
  const [cameraFile, setCameraFile] = useState(null)

  // ── Init: load data ─────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      if (isConfigured()) {
        setGistConnected(true)
        const { token } = getSettings()
        // try to get username from cached settings
        setSyncStatus('syncing')
        try {
          const remote = await loadFromGist()
          setReceipts(remote.length > 0 ? remote : (() => {
            const s = seedData()
            return s
          })())
          setSyncStatus('synced')
        } catch (e) {
          setSyncStatus('error')
          setSyncError(e.message)
          // Fall back to localStorage
          const raw = localStorage.getItem(LOCAL_KEY)
          if (raw) setReceipts(JSON.parse(raw))
          else { const s=seedData(); setReceipts(s) }
        }
      } else {
        // localStorage only mode
        try {
          const raw = localStorage.getItem(LOCAL_KEY)
          if (raw) setReceipts(JSON.parse(raw))
          else { const s=seedData(); setReceipts(s); localStorage.setItem(LOCAL_KEY,JSON.stringify(s)) }
        } catch { setReceipts([]) }
      }
    }
    init()
  }, [gistConnected])

  // ── Auto-save: local + debounced Gist ──────────────────────
  useEffect(() => {
    if (!receipts.length) return
    localStorage.setItem(LOCAL_KEY, JSON.stringify(receipts))

    if (isConfigured()) {
      clearTimeout(saveTimeout.current)
      saveTimeout.current = setTimeout(async () => {
        setSyncStatus('syncing')
        try {
          await saveToGist(receipts)
          setSyncStatus('synced')
        } catch (e) {
          setSyncStatus('error')
          setSyncError(e.message)
        }
      }, 1500)  // debounce 1.5s
    }
  }, [receipts])

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
      clearSettings()
      setGistConnected(false)
      setGhUser(null)
      setSyncStatus('idle')
      showToast('Disconnected from GitHub', 'error')
    }
  }
  const handleManualSync = async () => {
    if (!isConfigured()) return
    setSyncStatus('syncing')
    try {
      await saveToGist(receipts)
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
    .filter(r => r.date?.startsWith(new Date().toISOString().slice(0,7)))
    .reduce((s,r) => s+Number(r.amount), 0)

  const navItems = [
    { id:'dashboard', label:'Dashboard',    icon:LayoutDashboard },
    { id:'receipts',  label:'Transactions', icon:Receipt },
    { id:'onedrive',  label:'OneDrive',     icon:CloudIcon },
  ]
  const pageTitle = {
    dashboard:'📊 Dashboard Overview',
    receipts: '🧾 All Transactions',
    onedrive: '☁️ OneDrive Receipts',
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

  // ─────────────────────────────────────────────────────────────
  return (
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
            {receipts.filter(r=>r.date?.startsWith(new Date().toISOString().slice(0,7))).length} transactions
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
                {getGistUrl() && (
                  <a href={getGistUrl()} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize:10, color:'#3b82f6', textDecoration:'none' }}>
                    View Gist →
                  </a>
                )}
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
                <button onClick={()=>setShowGistSetup(true)}
                  style={{ display:'flex', alignItems:'center', gap:5, width:'100%', justifyContent:'center',
                    background:'#24292e', border:'1px solid #444', color:'#fff',
                    borderRadius:6, padding:'6px 8px', cursor:'pointer', fontFamily:'Sora', fontSize:11, fontWeight:700 }}>
                  <Github size={11}/> Connect GitHub
                </button>
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
          <button onClick={clearAll}   style={{ ...actionBtnStyle, color:'#ef4444' }}><Trash2 size={12}/> Clear All</button>
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
          {tab !== 'onedrive' && (
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
          {tab==='onedrive' && (
            <div style={{ maxWidth:680 }}>
              <p style={{ color:'var(--text-muted)', fontSize:13, marginBottom:16 }}>
                Open your OneDrive folder, download receipt images, then drop them below.
                Claude AI reads each receipt and adds it to your dashboard.
              </p>
              <OneDrivePanel
                cameraFile={cameraFile}
                onCameraFileConsumed={() => setCameraFile(null)}
                onExtracted={data => {
                  setEditItem({ ...data, id:undefined })
                  setShowModal(true)
                  showToast('Receipt extracted — review and save ✓')
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
      {showGistSetup && (
        <GistSetupModal
          onClose={()=>setShowGistSetup(false)}
          onConnected={handleGistConnected}/>
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
