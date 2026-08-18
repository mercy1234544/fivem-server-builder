import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Minus, Square, X, Hexagon, Home, Store, Server, Settings, Shield, Car } from 'lucide-react';
import { useAuth } from '../stores/useAuth';
import { useLocalAccess } from '../stores/useLocalAccess';
import { isSupabaseConfigured } from '../lib/supabase';

// HTN-style top bar: brand left, primary nav in the middle, window controls
// right. This replaces the old left sidebar — all per-server tools live inside
// My Servers → server → tabs.
const NAV = [
  { path: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
  { path: '/marketplace', label: 'Store', icon: Store, match: (p: string) => p.startsWith('/marketplace') },
  { path: '/servers', label: 'My Servers', icon: Server, match: (p: string) => p.startsWith('/server') },
  { path: '/vehicle-studio', label: 'Vehicle Studio', icon: Car, match: (p: string) => p.startsWith('/vehicle-studio') },
  { path: '/settings', label: 'Settings', icon: Settings, match: (p: string) => p.startsWith('/settings') },
];

export default function TitleBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const role = useAuth((s) => s.profile?.role);
  const isAdmin = role === 'admin' || role === 'owner';
  const localUnlocked = useLocalAccess((s) => s.unlocked);

  // Admin tab is hidden from regular users. It shows for Supabase admins/owners,
  // and in local mode only once someone has entered the admin code on this
  // machine (via Settings → Admin access).
  const showAdmin = isSupabaseConfigured() ? isAdmin : localUnlocked;
  const nav = showAdmin
    ? [...NAV, { path: '/admin', label: 'Admin', icon: Shield, match: (p: string) => p.startsWith('/admin') }]
    : NAV;

  const handleMinimize = () => window.electronAPI?.minimize();
  const handleMaximize = () => window.electronAPI?.maximize();
  const handleClose = () => window.electronAPI?.close();

  return (
    <div
      className="h-12 bg-surface-950/85 backdrop-blur-xl border-b border-overlay-6 flex items-center select-none relative z-50"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 pl-4 w-56 shrink-0">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-glow-sm">
          <Hexagon size={13} className="text-white" strokeWidth={2.5} />
        </div>
        <div className="leading-none">
          <div className="flex items-center gap-1">
            <span className="text-sm font-extrabold text-surface-100 tracking-wide">FIVEM</span>
            <span className="text-sm font-extrabold text-primary-400 tracking-wide">BUILDER</span>
          </div>
          <span className="text-[8px] text-surface-500 tracking-[0.18em] uppercase">Server Management</span>
        </div>
      </div>

      {/* Center nav — container stays draggable; only the buttons are no-drag,
          so the whole bar (gaps included) can grab the window. */}
      <nav className="flex-1 flex items-center justify-center gap-1">
        {nav.map((item) => {
          const active = item.match(location.pathname);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              style={{ WebkitAppRegion: 'no-drag' } as any}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all ${
                active
                  ? 'bg-primary-600/20 text-primary-300 border border-primary-500/30'
                  : 'text-surface-400 hover:text-surface-100 hover:bg-overlay-6 border border-transparent'
              }`}
            >
              <item.icon size={14} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Window controls — only the three buttons are no-drag; the surrounding
          strip stays draggable. */}
      <div className="flex w-56 shrink-0 justify-end">
        <button onClick={handleMinimize} style={{ WebkitAppRegion: 'no-drag' } as any} className="w-12 h-12 flex items-center justify-center text-surface-500 hover:text-surface-200 hover:bg-overlay-6 transition-all duration-150">
          <Minus size={14} />
        </button>
        <button onClick={handleMaximize} style={{ WebkitAppRegion: 'no-drag' } as any} className="w-12 h-12 flex items-center justify-center text-surface-500 hover:text-surface-200 hover:bg-overlay-6 transition-all duration-150">
          <Square size={11} />
        </button>
        <button onClick={handleClose} style={{ WebkitAppRegion: 'no-drag' } as any} className="w-12 h-12 flex items-center justify-center text-surface-500 hover:text-surface-100 hover:bg-red-600/90 transition-all duration-150">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
