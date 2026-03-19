import React, { useMemo } from 'react'
import { CATEGORIES } from '../App.jsx'
import { Doughnut, Bar } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js'
import { TrendingUp, TrendingDown, DollarSign, ShoppingBag, Calendar, Tag } from 'lucide-react'
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from 'date-fns'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement)

// Use local date to avoid UTC month mismatch in Malaysia (UTC+8)
function localYM(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`
}

function getMonthOptions() {
  const opts = [{ value: 'all', label: 'All Time' }]
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = subMonths(now, i)
    const val = format(d, 'yyyy-MM')
    const label = format(d, 'MMM yyyy')
    opts.push({ value: val, label })
  }
  return opts
}

function StatCard({ title, value, sub, icon: Icon, color, delay = 0 }) {
  return (
    <div className="animate-up" style={{
      animationDelay: `${delay}ms`,
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      padding: '20px', display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', top: -20, right: -20, opacity: 0.06 }}>
        <Icon size={90} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</span>
        <div style={{
          width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${color}18`, border: `1px solid ${color}30`
        }}>
          <Icon size={15} color={color} strokeWidth={2} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono', letterSpacing: '-1px' }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
      </div>
    </div>
  )
}

export default function Dashboard({ receipts, filterMonth, setFilterMonth, filterCategory, setFilterCategory, onEdit, onDelete, onAddClick }) {
  const monthOpts = useMemo(() => getMonthOptions(), [])

  const filtered = useMemo(() => {
    let r = receipts
    if (filterMonth !== 'all') r = r.filter(x => x.date?.startsWith(filterMonth))
    if (filterCategory !== 'all') r = r.filter(x => x.category === filterCategory)
    return r
  }, [receipts, filterMonth, filterCategory])

  const total = useMemo(() => filtered.reduce((s, r) => s + Number(r.amount || 0), 0), [filtered])

  const byCategory = useMemo(() => {
    const map = {}
    filtered.forEach(r => { map[r.category] = (map[r.category] || 0) + Number(r.amount || 0) })
    return map
  }, [filtered])

  const topCat = useMemo(() => Object.entries(byCategory).sort((a,b) => b[1]-a[1]), [byCategory])

  // Monthly bar data (last 6 months)
  const monthlyData = useMemo(() => {
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i)
      const key = localYM(d)
      const label = format(d, 'MMM')
      const total = receipts.filter(r => r.date?.startsWith(key)).reduce((s,r) => s + Number(r.amount||0), 0)
      months.push({ label, total })
    }
    return months
  }, [receipts])

  const doughnutData = {
    labels: topCat.map(([id]) => CATEGORIES.find(c=>c.id===id)?.label || id),
    datasets: [{
      data: topCat.map(([,v]) => v),
      backgroundColor: topCat.map(([id]) => CATEGORIES.find(c=>c.id===id)?.color || '#6b82a8'),
      borderWidth: 0, hoverOffset: 6,
    }]
  }

  const barData = {
    labels: monthlyData.map(m => m.label),
    datasets: [{
      label: 'Spending (RM)',
      data: monthlyData.map(m => m.total),
      backgroundColor: monthlyData.map((m, i) => i === 5 ? '#f5a623' : '#1e2d47'),
      borderRadius: 6,
      borderSkipped: false,
    }]
  }

  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: {
      backgroundColor: '#0f1623', borderColor: '#1e2d47', borderWidth: 1,
      titleColor: '#e8edf5', bodyColor: '#6b82a8',
      callbacks: { label: (ctx) => ` RM ${ctx.raw.toFixed(2)}` }
    }}
  }

  const barOpts = {
    ...chartOpts,
    scales: {
      x: { grid: { display: false }, ticks: { color: '#6b82a8', font: { family: 'Sora', size: 11 } } },
      y: { grid: { color: '#1e2d47' }, ticks: { color: '#6b82a8', font: { family: 'JetBrains Mono', size: 10 }, callback: v => 'RM '+v } }
    }
  }

  const avgPerTx = filtered.length ? total / filtered.length : 0
  const thisMonthKey = localYM()
  const lastMonthKey = localYM(subMonths(new Date(), 1))
  const thisMonthTotal = receipts.filter(r => r.date?.startsWith(thisMonthKey)).reduce((s,r) => s+Number(r.amount||0), 0)
  const lastMonthTotal = receipts.filter(r => r.date?.startsWith(lastMonthKey)).reduce((s,r) => s+Number(r.amount||0), 0)
  const trend = lastMonthTotal > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal * 100) : 0

  const recent = [...receipts].sort((a,b) => b.date?.localeCompare(a.date)).slice(0, 5)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={selectStyle}>
          {monthOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={selectStyle}>
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
        </select>
        {(filterMonth !== 'all' || filterCategory !== 'all') && (
          <button onClick={() => { setFilterMonth('all'); setFilterCategory('all') }}
            style={{ ...selectStyle, border: '1px solid #ef444440', color: '#ef4444', cursor: 'pointer', background: '#1a0a0a' }}>
            Clear filters ×
          </button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <StatCard title="Total Spending" value={`RM ${total.toFixed(2)}`}
          sub={`${filtered.length} transactions`} icon={DollarSign} color="#f5a623" delay={0} />
        <StatCard title="Avg per Transaction" value={`RM ${avgPerTx.toFixed(2)}`}
          sub="across selected period" icon={ShoppingBag} color="#3b82f6" delay={50} />
        <StatCard title="This Month" value={`RM ${thisMonthTotal.toFixed(2)}`}
          sub={trend !== 0 ? `${trend > 0 ? '▲' : '▼'} ${Math.abs(trend).toFixed(1)}% vs last month` : 'No comparison data'}
          icon={trend >= 0 ? TrendingUp : TrendingDown} color={trend >= 0 ? '#ef4444' : '#22c55e'} delay={100} />
        <StatCard title="Categories Used"
          value={Object.keys(byCategory).length}
          sub={topCat[0] ? `Top: ${CATEGORIES.find(c=>c.id===topCat[0][0])?.label}` : 'No data'}
          icon={Tag} color="#a78bfa" delay={150} />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {/* Doughnut */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>By Category</h3>
          {topCat.length > 0 ? (
            <div style={{ height: 220, position: 'relative' }}>
              <Doughnut data={doughnutData} options={{ ...chartOpts, cutout: '68%',
                plugins: { ...chartOpts.plugins, legend: { display: true, position: 'right',
                  labels: { color: '#6b82a8', font: { family: 'Sora', size: 11 }, boxWidth: 10, padding: 10 }
                }}
              }} />
            </div>
          ) : <EmptyState />}
        </div>

        {/* Bar */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Monthly Trend</h3>
          <div style={{ height: 220, position: 'relative' }}>
            <Bar data={barData} options={barOpts} />
          </div>
        </div>
      </div>

      {/* Category breakdown + Recent */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {/* Category bars */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Category Breakdown</h3>
          {topCat.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              {topCat.map(([id, val]) => {
                const cat = CATEGORIES.find(c => c.id === id)
                const pct = total > 0 ? (val / total * 100) : 0
                return (
                  <div key={id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{cat?.emoji} {cat?.label || id}</span>
                      <span style={{ fontSize: 13, color: cat?.color, fontFamily: 'JetBrains Mono' }}>RM {val.toFixed(2)}</span>
                    </div>
                    <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: cat?.color || '#6b82a8', borderRadius: 2, transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{pct.toFixed(1)}%</div>
                  </div>
                )
              })}
            </div>
          ) : <EmptyState />}
        </div>

        {/* Recent transactions */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ ...cardTitleStyle, marginBottom: 0 }}>Recent Transactions</h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Latest 5</span>
          </div>
          {recent.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {recent.map(r => {
                const cat = CATEGORIES.find(c => c.id === r.category)
                return (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                    borderRadius: 8, transition: 'background 0.2s', cursor: 'pointer',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    onClick={() => onEdit(r)}
                  >
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `${cat?.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                      {cat?.emoji || '📋'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }} className="truncate">{r.merchant}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.date}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: cat?.color || 'var(--text-primary)', fontFamily: 'JetBrains Mono', flexShrink: 0 }}>
                      RM {Number(r.amount).toFixed(2)}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🧾</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No receipts yet</div>
              <button onClick={onAddClick} style={{ marginTop: 12, background: 'var(--accent-dim)', border: '1px solid rgba(245,166,35,0.3)', color: 'var(--accent)', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontFamily: 'Sora' }}>
                + Add your first receipt
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13 }}>
      No data for selected filters
    </div>
  )
}

const cardStyle = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', padding: '20px',
}

const cardTitleStyle = {
  fontSize: 13, fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14,
}

const selectStyle = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  color: 'var(--text-primary)', borderRadius: 8, padding: '7px 12px',
  fontFamily: 'Sora, sans-serif', fontSize: 13, outline: 'none', cursor: 'pointer',
}
