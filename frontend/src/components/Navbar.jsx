import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Receipt, Tags, Cloud, LogIn, LogOut, Menu, X, User } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/receipts', label: 'Resit', icon: Receipt },
  { to: '/categories', label: 'Kategori', icon: Tags },
  { to: '/onedrive', label: 'OneDrive', icon: Cloud },
]

export default function Navbar() {
  const { user, login, logout, loading } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-ink-950/90 backdrop-blur-xl border-b border-ink-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center">
              <Receipt size={16} className="text-ink-950" />
            </div>
            <span className="font-display font-bold text-slate-100 text-lg tracking-tight">
              Resit<span className="text-amber-400">.</span>my
            </span>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-body transition-all duration-200 ${
                    isActive
                      ? 'bg-amber-400/10 text-amber-400 font-medium'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-ink-700'
                  }`
                }
              >
                <Icon size={15} />
                {label}
              </NavLink>
            ))}
          </div>

          {/* Auth */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-ink-700 rounded-xl border border-ink-600">
                  <div className="w-6 h-6 bg-amber-400/20 rounded-lg flex items-center justify-center">
                    <User size={12} className="text-amber-400" />
                  </div>
                  <span className="text-xs font-mono text-slate-300 max-w-[140px] truncate">
                    {user.displayName || user.mail}
                  </span>
                  <div className="dot-pulse ml-1" />
                </div>
                <button onClick={logout} className="btn-ghost text-xs py-2">
                  <LogOut size={14} />
                  Keluar
                </button>
              </div>
            ) : (
              <button onClick={login} disabled={loading} className="btn-primary text-xs py-2">
                <LogIn size={14} />
                {loading ? 'Loading…' : 'Log Masuk OneDrive'}
              </button>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden text-slate-400 hover:text-slate-200 p-2"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-ink-700 bg-ink-900 px-4 py-3 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-3 rounded-xl text-sm transition-all ${
                  isActive ? 'bg-amber-400/10 text-amber-400' : 'text-slate-400 hover:text-slate-200'
                }`
              }
            >
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
          <div className="pt-2 border-t border-ink-700">
            {user ? (
              <button onClick={logout} className="btn-ghost w-full justify-center">
                <LogOut size={14} /> Keluar
              </button>
            ) : (
              <button onClick={login} className="btn-primary w-full justify-center">
                <LogIn size={14} /> Log Masuk OneDrive
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
