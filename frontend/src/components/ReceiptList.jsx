import React, { useMemo, useState } from 'react'
import { CATEGORIES } from '../App.jsx'
import { Search, Edit2, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { subMonths, format } from 'date-fns'

function getMonthOptions() {
  const opts = [{ value: 'all', label: 'All Time' }]
  for (let i = 0; i < 12; i++) {
    const d = subMonths(new Date(), i)
    opts.push({ value: format(d, 'yyyy-MM'), label: format(d, 'MMM yyyy') })
  }
  return opts
}

export default function ReceiptList({ receipts, search, setSearch, filterMonth, setFilterMonth, filterCategory, setFilterCategory, onEdit, onDelete }) {
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 15
  const monthOpts = useMemo(() => getMonthOptions(), [])

  const filtered = useMemo(() => {
    let r = receipts
    if (filterMonth !== 'all') r = r.filter(x => x.date?.startsWith(filterMonth))
    if (filterCategory !== 'all') r = r.filter(x => x.category === filterCategory)
    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(x =>
        x.merchant?.toLowerCase().includes(q) ||
        x.description?.toLowerCase().includes(q) ||
        x.amount?.toString().includes(q)
      )
    }
    return [...r].sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey]
      if (sortKey === 'amount') { av = Number(av); bv = Number(bv) }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [receipts, filterMonth, filterCategory, search, sortKey, sortDir])

  const total = useMemo(() => filtered.reduce((s,r) => s+Number(r.amount||0), 0), [filtered])
  const paged = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const sort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  const SortIcon = ({ k }) => sortKey === k
    ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
    : <ChevronDown size={12} style={{ opacity: 0.3 }} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search merchant, description…"
            style={{ ...inputStyle, paddingLeft: 32, width: '100%' }} />
        </div>
        <select value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setPage(1) }} style={selectStyle}>
          {monthOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1) }} style={selectStyle}>
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
        </select>
      </div>

      {/* Summary bar */}
      <div style={{ display: 'flex', gap: 20, padding: '10px 16px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}>
        <span style={{ color: 'var(--text-muted)' }}>{filtered.length} records</span>
        <span style={{ color: 'var(--text-dim)' }}>|</span>
        <span style={{ color: 'var(--text-primary)' }}>Total: <strong style={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono' }}>RM {total.toFixed(2)}</strong></span>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
                {[['date','Date'],['merchant','Merchant'],['category','Category'],['amount','Amount'],['description','Description']].map(([k,l]) => (
                  <th key={k} onClick={() => sort(k)}
                    style={{ padding: '10px 14px', textAlign: k === 'amount' ? 'right' : 'left', cursor: 'pointer',
                      color: sortKey === k ? 'var(--accent)' : 'var(--text-muted)',
                      fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
                      whiteSpace: 'nowrap', userSelect: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{l} <SortIcon k={k} /></span>
                  </th>
                ))}
                <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No receipts found
                </td></tr>
              ) : paged.map((r, i) => {
                const cat = CATEGORIES.find(c => c.id === r.category)
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', fontSize: 12 }}>{r.date}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--text-primary)', maxWidth: 160 }} className="truncate">{r.merchant}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 20,
                        background: `${cat?.color}15`, color: cat?.color || 'var(--text-muted)', fontSize: 11, fontWeight: 500 }}>
                        {cat?.emoji} {cat?.label || r.category}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontWeight: 600, color: 'var(--text-primary)' }}>
                      RM {Number(r.amount).toFixed(2)}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', maxWidth: 200 }} className="truncate">{r.description || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => onEdit(r)} style={iconBtnStyle('#3b82f6')} title="Edit">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => { if(confirm('Delete this receipt?')) onDelete(r.id) }}
                          style={iconBtnStyle('#ef4444')} title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderTop: '1px solid var(--border)' }}>
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} style={pageBtnStyle(false)}>←</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
              return (
                <button key={p} onClick={() => setPage(p)} style={pageBtnStyle(p === page)}>{p}</button>
              )
            })}
            <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages} style={pageBtnStyle(false)}>→</button>
          </div>
        )}
      </div>
    </div>
  )
}

const inputStyle = {
  background: 'var(--bg-input)', border: '1px solid var(--border)',
  color: 'var(--text-primary)', borderRadius: 8, padding: '7px 12px',
  fontFamily: 'Sora, sans-serif', fontSize: 13, outline: 'none',
}
const selectStyle = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  color: 'var(--text-primary)', borderRadius: 8, padding: '7px 12px',
  fontFamily: 'Sora, sans-serif', fontSize: 13, outline: 'none', cursor: 'pointer',
}
const iconBtnStyle = (color) => ({
  background: `${color}15`, border: `1px solid ${color}30`, color,
  borderRadius: 6, padding: '5px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center',
})
const pageBtnStyle = (active) => ({
  minWidth: 32, height: 32, borderRadius: 6, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  background: active ? 'var(--accent-dim)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-muted)',
  cursor: 'pointer', fontSize: 13, fontFamily: 'Sora',
})
