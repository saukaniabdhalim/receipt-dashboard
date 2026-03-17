import React, { useState, useEffect, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import Dashboard from './components/Dashboard.jsx'
import ReceiptList from './components/ReceiptList.jsx'
import AddReceiptModal from './components/AddReceiptModal.jsx'
import OneDrivePanel from './components/OneDrivePanel.jsx'
import { LayoutDashboard, Receipt, CloudIcon, Plus, Menu, Download, Upload, Trash2 } from 'lucide-react'
import { ONEDRIVE_FOLDER_URL } from './services/oneDriveService.js'

export const CATEGORIES = [
  { id: 'food',          label: 'Food & Dining',    color: '#f97316', emoji: '🍜' },
  { id: 'transport',     label: 'Transport',         color: '#3b82f6', emoji: '🚗' },
  { id: 'toll',          label: 'Toll / Highway',    color: '#6366f1', emoji: '🛣️' },
  { id: 'utilities',     label: 'Utilities',         color: '#14b8a6', emoji: '💡' },
  { id: 'shopping',      label: 'Shopping',          color: '#ec4899', emoji: '🛍️' },
  { id: 'healthcare',    label: 'Healthcare',        color: '#22c55e', emoji: '🏥' },
  { id: 'entertainment', label: 'Entertainment',     color: '#a78bfa', emoji: '🎬' },
  { id: 'grocery',       label: 'Grocery',           color: '#eab308', emoji: '🛒' },
  { id: 'education',     label: 'Education',         color: '#06b6d4', emoji: '📚' },
  { id: 'others',        label: 'Others',            color: '#6b82a8', emoji: '📋' },
]

const STORAGE_KEY = 'resit_dashboard_data'

function seedData() {
  const today = new Date()
  const m = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0] }
  return [
    { id: uuidv4(), date: m(1),  merchant: 'Tesco Ipoh',      category: 'grocery',       amount: 87.50,  description: 'Weekly grocery',       currency: 'MYR', imageNote: '' },
    { id: uuidv4(), date: m(2),  merchant: 'Petronas',         category: 'transport',     amount: 60.00,  description: 'Petrol RON95',          currency: 'MYR', imageNote: '' },
    { id: uuidv4(), date: m(3),  merchant: 'PLUS Highway',     category: 'toll',          amount: 12.30,  description: 'KL-Ipoh toll',          currency: 'MYR', imageNote: '' },
    { id: uuidv4(), date: m(4),  merchant: "McDonald's",       category: 'food',          amount: 24.90,  description: 'Lunch',                 currency: 'MYR', imageNote: '' },
    { id: uuidv4(), date: m(5),  merchant: 'TNB',              category: 'utilities',     amount: 135.00, description: 'Electricity bill',      currency: 'MYR', imageNote: '' },
    { id: uuidv4(), date: m(6),  merchant: 'Uniqlo',           category: 'shopping',      amount: 199.00, description: 'Clothes',               currency: 'MYR', imageNote: '' },
    { id: uuidv4(), date: m(7),  merchant: 'Klinik Kesihatan', category: 'healthcare',    amount: 15.00,  description: 'GP visit',              currency: 'MYR', imageNote: '' },
    { id: uuidv4(), date: m(10), merchant: 'Netflix',          category: 'entertainment', amount: 54.90,  description: 'Monthly subscription',  currency: 'MYR', imageNote: '' },
    { id: uuidv4(), date: m(12), merchant: 'Mamak Corner',     category: 'food',          amount: 18.50,  description: 'Dinner',                currency: 'MYR', imageNote: '' },
    { id: uuidv4(), date: m(15), merchant: 'Grab',             category: 'transport',     amount: 22.00,  description: 'GrabCar ride',          currency: 'MYR', imageNote: '' },
    { id: uuidv4(), date: m(20), merchant: 'Guardian',         category: 'healthcare',    amount: 45.80,  description: 'Medicine',              currency: 'MYR', imageNote: '' },
    { id: uuidv4(), date: m(22), merchant: 'Aeon',             category: 'shopping',      amount: 320.00, description: 'Household items',       currency: 'MYR', imageNote: '' },
    { id: uuidv4(), date: m(25), merchant: "Lotus's",          category: 'grocery',       amount: 95.30,  description: 'Grocery',               currency: 'MYR', imageNote: '' },
    { id: uuidv4(), date: m(28), merchant: 'Celcom',           category: 'utilities',     amount: 88.00,  description: 'Mobile plan',           currency: 'MYR', imageNote: '' },
    { id: uuidv4(), date: m(35), merchant: 'Pizza Hut',        category: 'food',          amount: 55.00,  description: 'Family dinner',         currency: 'MYR', imageNote: '' },
  ]
}

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [receipts, setReceipts] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [filterMonth, setFilterMonth] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setReceipts(JSON.parse(raw))
      else { const s = seedData(); setReceipts(s); localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) }
    } catch { setReceipts([]) }
  }, [])

  useEffect(() => {
    if (receipts.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(receipts))
  }, [receipts])

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }, [])

  const addReceipt    = useCallback((data) => { setReceipts(p => [{ ...data, id: uuidv4() }, ...p]); showToast('Receipt added ✓') }, [showToast])
  const updateReceipt = useCallback((data) => { setReceipts(p => p.map(r => r.id === data.id ? data : r)); showToast('Receipt updated ✓') }, [showToast])
  const deleteReceipt = useCallback((id)   => { setReceipts(p => p.filter(r => r.id !== id)); showToast('Deleted', 'error') }, [showToast])

  const exportCSV = () => {
    const header = 'Date,Merchant,Category,Amount,Currency,Description,ImageRef\n'
    const rows = receipts.map(r =>
      `${r.date},"${r.merchant}","${CATEGORIES.find(c=>c.id===r.category)?.label||r.category}",${r.amount},${r.currency||'MYR'},"${r.description||''}","${r.imageNote||''}"`
    ).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([header+rows], { type: 'text/csv' }))
    a.download = 'receipts.csv'; a.click()
    showToast('Exported CSV ✓')
  }

  const exportJSON = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(receipts, null, 2)], { type: 'application/json' }))
    a.download = 'receipts-backup.json'; a.click()
    showToast('Backup exported ✓')
  }

  const importJSON = (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        if (Array.isArray(data)) {
          setReceipts(prev => {
            const ids = new Set(prev.map(r => r.id))
            return [...data.filter(r => !ids.has(r.id)), ...prev]
          })
          showToast(`Imported ${data.length} records ✓`)
        }
      } catch { showToast('Invalid JSON', 'error') }
    }
    reader.readAsText(file); e.target.value = ''
  }

  const clearAll = () => {
    if (confirm('Clear ALL receipts? Cannot be undone.')) {
      setReceipts([]); localStorage.removeItem(STORAGE_KEY); showToast('All data cleared', 'error')
    }
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard',    icon: LayoutDashboard },
    { id: 'receipts',  label: 'Transactions', icon: Receipt },
    { id: 'onedrive',  label: 'OneDrive',     icon: CloudIcon },
  ]

  const totalThisMonth = receipts
    .filter(r => r.date?.startsWith(new Date().toISOString().slice(0,7)))
    .reduce((s, r) => s + Number(r.amount), 0)

  const pageTitle = { dashboard: '📊 Dashboard Overview', receipts: '🧾 All Transactions', onedrive: '☁️ OneDrive Receipts' }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:40, backdropFilter:'blur(2px)' }} />
      )}

      {/* Sidebar */}
      <aside className="sidebar" style={{
        width: 240, flexShrink: 0, background: 'var(--bg-card)',
        borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
        position: 'fixed', top: 0, left: sidebarOpen ? 0 : -260, bottom: 0, zIndex: 50,
        transition: 'left 0.3s ease',
      }}>
        {/* Logo */}
        <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'var(--accent-dim)', border:'1px solid var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🧾</div>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:'var(--text-primary)', letterSpacing:'-0.3px' }}>Resit</div>
              <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:-2 }}>Dashboard</div>
            </div>
          </div>
        </div>

        {/* Month summary */}
        <div style={{ margin:'16px 12px', padding:'12px 14px', background:'var(--accent-dim)', borderRadius:10, border:'1px solid rgba(245,166,35,0.2)' }}>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4 }}>This Month</div>
          <div style={{ fontSize:20, fontWeight:700, color:'var(--accent)', fontFamily:'JetBrains Mono' }}>RM {totalThisMonth.toFixed(2)}</div>
          <div style={{ fontSize:11, color:'var(--text-dim)', marginTop:2 }}>
            {receipts.filter(r => r.date?.startsWith(new Date().toISOString().slice(0,7))).length} transactions
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding:'8px 12px', flex:1 }}>
          {navItems.map(item => {
            const Icon = item.icon; const active = tab === item.id
            return (
              <button key={item.id} onClick={() => { setTab(item.id); setSidebarOpen(false) }}
                style={{
                  display:'flex', alignItems:'center', gap:10, width:'100%',
                  padding:'10px 12px', borderRadius:8, border:'none', cursor:'pointer',
                  marginBottom:2, fontFamily:'Sora, sans-serif', fontSize:14, fontWeight: active?600:400,
                  background: active ? (item.id==='onedrive' ? '#0078d418' : 'var(--accent-dim)') : 'transparent',
                  color: active ? (item.id==='onedrive' ? '#0078d4' : 'var(--accent)') : 'var(--text-muted)',
                  transition:'all 0.2s',
                }}>
                <Icon size={16} strokeWidth={active?2.5:1.8} />
                {item.label}
                {item.id === 'onedrive' && (
                  <span style={{ marginLeft:'auto', fontSize:9, padding:'2px 5px', borderRadius:3, background:'#0078d418', color:'#0078d4', fontWeight:700 }}>LINKED</span>
                )}
              </button>
            )
          })}
        </nav>

        {/* OneDrive quick access */}
        <div style={{ margin:'0 12px 8px', padding:'10px 12px', background:'#0078d410', borderRadius:8, border:'1px solid #0078d420' }}>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4, fontWeight:600 }}>☁️ OneDrive Folder</div>
          <a href={ONEDRIVE_FOLDER_URL} target="_blank" rel="noopener noreferrer"
            style={{ fontSize:11, color:'#0078d4', textDecoration:'none', display:'flex', alignItems:'center', gap:4 }}>
            Open in browser →
          </a>
        </div>

        {/* Actions */}
        <div style={{ padding:'12px', borderTop:'1px solid var(--border)' }}>
          <button onClick={exportCSV} style={actionBtnStyle}><Download size={13} /> Export CSV</button>
          <button onClick={exportJSON} style={actionBtnStyle}><Download size={13} /> Backup JSON</button>
          <label style={{ ...actionBtnStyle, display:'flex', cursor:'pointer' }}>
            <Upload size={13} /> Import JSON
            <input type="file" accept=".json" onChange={importJSON} style={{ display:'none' }} />
          </label>
          <button onClick={clearAll} style={{ ...actionBtnStyle, color:'#ef4444' }}><Trash2 size={13} /> Clear All</button>
        </div>
      </aside>

      {/* Main */}
      <div className="main-area" style={{ flex:1, marginLeft:0, display:'flex', flexDirection:'column', minHeight:'100vh' }}>
        {/* Topbar */}
        <header style={{
          position:'sticky', top:0, zIndex:30,
          background:'rgba(8,12,20,0.9)', backdropFilter:'blur(12px)',
          borderBottom:'1px solid var(--border)', padding:'0 24px',
          display:'flex', alignItems:'center', gap:16, height:60,
        }}>
          <button onClick={() => setSidebarOpen(v => !v)}
            style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', padding:4 }}>
            <Menu size={20} />
          </button>
          <div style={{ flex:1 }}>
            <h1 style={{ fontSize:15, fontWeight:600, color:'var(--text-primary)' }}>{pageTitle[tab]}</h1>
          </div>
          {tab !== 'onedrive' && (
            <button onClick={() => { setEditItem(null); setShowModal(true) }}
              style={{
                display:'flex', alignItems:'center', gap:6,
                background:'var(--accent)', color:'#000', border:'none', borderRadius:8,
                padding:'7px 14px', fontFamily:'Sora', fontWeight:600, fontSize:13, cursor:'pointer',
              }}>
              <Plus size={15} strokeWidth={2.5} /> Add Receipt
            </button>
          )}
        </header>

        {/* Page content */}
        <main style={{ flex:1, padding:'24px', overflowY:'auto' }} className="animate-in">
          {tab === 'dashboard' && (
            <Dashboard receipts={receipts} filterMonth={filterMonth} setFilterMonth={setFilterMonth}
              filterCategory={filterCategory} setFilterCategory={setFilterCategory}
              onEdit={(r) => { setEditItem(r); setShowModal(true) }}
              onDelete={deleteReceipt}
              onAddClick={() => { setEditItem(null); setShowModal(true) }} />
          )}
          {tab === 'receipts' && (
            <ReceiptList receipts={receipts} search={search} setSearch={setSearch}
              filterMonth={filterMonth} setFilterMonth={setFilterMonth}
              filterCategory={filterCategory} setFilterCategory={setFilterCategory}
              onEdit={(r) => { setEditItem(r); setShowModal(true) }}
              onDelete={deleteReceipt} />
          )}
          {tab === 'onedrive' && (
            <div style={{ maxWidth: 700 }}>
              <div style={{ marginBottom:16 }}>
                <p style={{ color:'var(--text-muted)', fontSize:13, marginBottom:4 }}>
                  Your linked OneDrive receipts folder. Browse files and attach them to transactions.
                </p>
                <p style={{ color:'var(--text-dim)', fontSize:12 }}>
                  📁 Folder must be shared as <strong style={{color:'var(--text-muted)'}}>Anyone with the link can view</strong> for browsing to work.
                </p>
              </div>
              <OneDrivePanel onSelectFile={(file) => {
                // Open add modal with file pre-linked
                setEditItem(null)
                setShowModal(true)
                // Note: imageNote will be set in modal via the panel
              }} />
            </div>
          )}
        </main>
      </div>

      {showModal && (
        <AddReceiptModal item={editItem}
          onClose={() => { setShowModal(false); setEditItem(null) }}
          onSave={(data) => {
            if (editItem) updateReceipt(data); else addReceipt(data)
            setShowModal(false); setEditItem(null)
          }} />
      )}

      {toast && (
        <div style={{
          position:'fixed', bottom:24, right:24, zIndex:100,
          background: toast.type==='error' ? '#1a0a0a' : '#0a1a0f',
          border:`1px solid ${toast.type==='error' ? '#ef4444' : '#22c55e'}`,
          color: toast.type==='error' ? '#ef4444' : '#22c55e',
          borderRadius:10, padding:'12px 18px', fontSize:13, fontWeight:500,
          boxShadow:'var(--shadow-lg)', animation:'fadeUp 0.3s ease'
        }}>{toast.msg}</div>
      )}

      <style>{`
        @media (min-width: 768px) {
          .sidebar { left: 0 !important; }
          .main-area { margin-left: 240px !important; }
        }
      `}</style>
    </div>
  )
}

const actionBtnStyle = {
  display:'flex', alignItems:'center', gap:7, width:'100%',
  background:'transparent', border:'none', color:'var(--text-muted)',
  padding:'8px 10px', borderRadius:6, cursor:'pointer', fontSize:12,
  fontFamily:'Sora, sans-serif', marginBottom:2, transition:'color 0.2s',
}
