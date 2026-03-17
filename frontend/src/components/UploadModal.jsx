import { useState, useRef, useCallback } from 'react'
import { X, Upload, Image, FileText, CheckCircle, AlertCircle, Loader } from 'lucide-react'
import { addReceipt, fileToBase64, getCategories } from '../services/receiptService'
import { uploadReceiptFile, getToken } from '../services/oneDriveService'
import { useAuth } from '../hooks/useAuth'
import { loginRequest } from '../msalConfig'

export default function UploadModal({ onClose, onSuccess }) {
  const { msal, token } = useAuth()
  const categories = getCategories()
  const fileInputRef = useRef(null)

  const [dragOver, setDragOver] = useState(false)
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState([])

  const [form, setForm] = useState({
    merchant: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    category: 'other',
    notes: '',
  })

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files).filter(
      (f) => f.type.startsWith('image/') || f.type === 'application/pdf'
    )
    setFiles((prev) => [...prev, ...dropped])
  }, [])

  const handleFileInput = (e) => {
    const selected = Array.from(e.target.files)
    setFiles((prev) => [...prev, ...selected])
  }

  const removeFile = (idx) => setFiles((f) => f.filter((_, i) => i !== idx))

  const handleSubmit = async () => {
    if (!files.length && !form.merchant) return
    setUploading(true)
    const res = []

    const filesToProcess = files.length ? files : [null]

    for (const file of filesToProcess) {
      try {
        let preview = null
        let oneDriveItem = null

        if (file) {
          // Try upload to OneDrive if authenticated
          if (token) {
            try {
              oneDriveItem = await uploadReceiptFile(token, file)
            } catch (e) {
              console.warn('OneDrive upload failed, storing locally:', e)
            }
          }
          // Generate preview
          if (file.type.startsWith('image/')) {
            preview = await fileToBase64(file)
          }
        }

        // Save to local storage
        const receipt = addReceipt({
          ...form,
          fileName: file?.name || null,
          preview,
          oneDriveId: oneDriveItem?.id || null,
          oneDriveUrl: oneDriveItem?.webUrl || null,
          source: oneDriveItem ? 'onedrive' : 'local',
        })

        res.push({ success: true, name: file?.name || form.merchant, id: receipt.id })
      } catch (e) {
        res.push({ success: false, name: file?.name || form.merchant, error: e.message })
      }
    }

    setResults(res)
    setUploading(false)
    onSuccess?.()
  }

  const allDone = results.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-ink-800 border border-ink-600 rounded-2xl w-full max-w-lg shadow-2xl animate-fade-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-700">
          <h2 className="font-display font-semibold text-slate-100 text-lg">Tambah Resit</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {allDone ? (
            /* Results */
            <div className="space-y-3">
              {results.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 p-3 rounded-xl border ${
                    r.success ? 'border-jade-500/30 bg-jade-500/5' : 'border-rose-500/30 bg-rose-500/5'
                  }`}
                >
                  {r.success ? (
                    <CheckCircle size={18} className="text-jade-400 shrink-0" />
                  ) : (
                    <AlertCircle size={18} className="text-rose-400 shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-slate-200">{r.name}</p>
                    {r.error && <p className="text-xs text-rose-400">{r.error}</p>}
                    {r.success && <p className="text-xs text-jade-400">Berjaya disimpan</p>}
                  </div>
                </div>
              ))}
              <button onClick={onClose} className="btn-primary w-full justify-center mt-4">
                Tutup
              </button>
            </div>
          ) : (
            <>
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
                  dragOver
                    ? 'border-amber-400 bg-amber-400/5'
                    : 'border-ink-600 hover:border-amber-400/40 hover:bg-ink-700/50'
                }`}
              >
                <Upload size={24} className="mx-auto text-slate-500 mb-2" />
                <p className="text-sm text-slate-400">
                  Seret & lepas gambar resit atau{' '}
                  <span className="text-amber-400">klik untuk pilih</span>
                </p>
                <p className="text-xs text-slate-600 mt-1">JPG, PNG, PDF disokong</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>

              {/* File list */}
              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 bg-ink-700 rounded-lg">
                      {f.type.startsWith('image/') ? (
                        <Image size={14} className="text-amber-400 shrink-0" />
                      ) : (
                        <FileText size={14} className="text-blue-400 shrink-0" />
                      )}
                      <span className="text-xs text-slate-300 flex-1 truncate">{f.name}</span>
                      <span className="text-xs text-slate-500 font-mono">
                        {(f.size / 1024).toFixed(0)}kb
                      </span>
                      <button onClick={() => removeFile(i)} className="text-slate-600 hover:text-rose-400">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Form fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label-text mb-1.5 block">Nama Peniaga</label>
                  <input
                    className="input"
                    placeholder="cth. Aeon, Petronas, TNB…"
                    value={form.merchant}
                    onChange={(e) => setForm((f) => ({ ...f, merchant: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label-text mb-1.5 block">Jumlah (RM)</label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label-text mb-1.5 block">Tarikh</label>
                  <input
                    className="input"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <label className="label-text mb-1.5 block">Kategori</label>
                  <select
                    className="input"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="label-text mb-1.5 block">Nota (pilihan)</label>
                  <input
                    className="input"
                    placeholder="Nota tambahan…"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={uploading || (!files.length && !form.merchant && !form.amount)}
                className="btn-primary w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <>
                    <Loader size={15} className="animate-spin" />
                    Memuat naik…
                  </>
                ) : (
                  <>
                    <Upload size={15} />
                    Simpan Resit
                  </>
                )}
              </button>

              {!token && (
                <p className="text-xs text-slate-500 text-center">
                  💡 Log masuk OneDrive untuk auto-simpan ke cloud
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
