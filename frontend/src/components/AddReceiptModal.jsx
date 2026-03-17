import React, { useState, useEffect } from 'react'
import { CATEGORIES } from '../App.jsx'
import { X, Camera, FileText } from 'lucide-react'

const today = () => new Date().toISOString().split('T')[0]

export default function AddReceiptModal({ item, onClose, onSave }) {
  const [form, setForm] = useState({
    date: today(), merchant: '', category: 'food',
    amount: '', description: '', currency: 'MYR', imageNote: ''
  })
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (item) setForm({ ...item, amount: String(item.amount) })
  }, [item])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const validate = () => {
    const e = {}
    if (!form.date) e.date = 'Required'
    if (!form.merchant.trim()) e.merchant = 'Required'
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) e.amount = 'Must be a positive number'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = () => {
    if (!validate()) return
    onSave({ ...form, amount: Number(form.amount), id: item?.id })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      animation: 'fadeIn 0.2s ease'
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, width: '90%', maxWidth: 480, maxHeight: '90vh',
        overflow: 'auto', boxShadow: 'var(--shadow-lg)',
        animation: 'fadeUp 0.25s ease'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              {item ? '✏️ Edit Receipt' : '➕ New Receipt'}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {item ? 'Update transaction details' : 'Add a new transaction manually'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Date + Amount row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Date *</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
                style={{ ...inputStyle, width: '100%', borderColor: errors.date ? '#ef4444' : undefined }} />
              {errors.date && <div style={errStyle}>{errors.date}</div>}
            </div>
            <div>
              <label style={labelStyle}>Amount (RM) *</label>
              <input type="number" step="0.01" min="0" value={form.amount}
                onChange={e => set('amount', e.target.value)}
                placeholder="0.00"
                style={{ ...inputStyle, width: '100%', fontFamily: 'JetBrains Mono', borderColor: errors.amount ? '#ef4444' : undefined }} />
              {errors.amount && <div style={errStyle}>{errors.amount}</div>}
            </div>
          </div>

          {/* Merchant */}
          <div>
            <label style={labelStyle}>Merchant / Vendor *</label>
            <input value={form.merchant} onChange={e => set('merchant', e.target.value)}
              placeholder="e.g. Tesco, Petronas, TNB…"
              style={{ ...inputStyle, width: '100%', borderColor: errors.merchant ? '#ef4444' : undefined }} />
            {errors.merchant && <div style={errStyle}>{errors.merchant}</div>}
          </div>

          {/* Category */}
          <div>
            <label style={labelStyle}>Category</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6 }}>
              {CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => set('category', cat.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px',
                    borderRadius: 8, border: `1px solid ${form.category === cat.id ? cat.color : 'var(--border)'}`,
                    background: form.category === cat.id ? `${cat.color}18` : 'var(--bg-input)',
                    color: form.category === cat.id ? cat.color : 'var(--text-muted)',
                    cursor: 'pointer', fontSize: 12, fontFamily: 'Sora', transition: 'all 0.15s',
                    fontWeight: form.category === cat.id ? 600 : 400,
                  }}>
                  <span>{cat.emoji}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description / Notes</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Optional notes about this receipt…" rows={2}
              style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
          </div>

          {/* Image note */}
          <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '12px', border: '1px dashed var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Camera size={14} color="var(--text-muted)" />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Receipt Image Reference</span>
            </div>
            <input value={form.imageNote} onChange={e => set('imageNote', e.target.value)}
              placeholder="WhatsApp msg ID, OneDrive link, or filename…"
              style={{ ...inputStyle, width: '100%', fontSize: 12 }} />
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
              💡 Paste a link from OneDrive or note the WhatsApp group message reference
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-muted)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Sora', fontSize: 14
          }}>Cancel</button>
          <button onClick={submit} style={{
            flex: 2, padding: '10px', background: 'var(--accent)', color: '#000',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Sora', fontSize: 14, fontWeight: 700
          }}>
            {item ? 'Update Receipt' : 'Save Receipt'}
          </button>
        </div>
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }
const inputStyle = { background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 8, padding: '9px 12px', fontFamily: 'Sora, sans-serif', fontSize: 13, outline: 'none', boxSizing: 'border-box' }
const errStyle = { fontSize: 11, color: '#ef4444', marginTop: 4 }
