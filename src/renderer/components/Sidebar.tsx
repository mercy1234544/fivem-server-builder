import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Plus,
  Package,
  FolderTree,
  ListOrdered,
  HeartPulse,
  Archive,
  FolderOpen,
  FileCode,
  Store,
  Import,
  Settings,
  ChevronLeft,
  ChevronRight,
  Server,
  Zap,
  Wrench,
  Shield,
  RefreshCw,
  Car,
  Terminal,
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';

interface NavSection {
  label: string;
  items: { path: string; label: string; icon: any; accent?: string }[];
}

const navSections: NavSection[] = [
  {
    label: 'General',
    items: [
      { path: '/', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/create', label: 'Create Server', icon: Plus, accent: 'text-primary-400' },
    ],
  },
  {
    label: 'Resources',
    items: [
      { path: '/resources', label: 'Resources', icon: Package },
      { path: '/organizer', label: 'Organizer', icon: FolderTree },
      { path: '/startup', label: 'Startup Order', icon: ListOrdered },
      { path: '/marketplace', label: 'Marketplace', icon: Store, accent: 'text-purple-400' },
      { path: '/import', label: 'Import', icon: Import, accent: 'text-cyan-400' },
      { path: '/updater', label: 'Updater', icon: RefreshCw, accent: 'text-emerald-400' },
      { path: '/vehicles', label: 'Vehicle Packs', icon: Car, accent: 'text-amber-400' },
    ],
  },
  {
    label: 'Server',
    items: [
      { path: '/console', label: 'Console', icon: Terminal, accent: 'text-green-400' },
      { path: '/health', label: 'Health Scanner', icon: HeartPulse, accent: 'text-emerald-400' },
      { path: '/backups', label: 'Backups', icon: Archive },
      { path: '/files', label: 'File Explorer', icon: FolderOpen },
      { path: '/editor', label: 'Server.cfg', icon: FileCode },
    ],
  },
  {
    label: 'System',
    items: [
      { path: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar, servers, activeServerId, setActiveServer } = useAppStore();

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarCollapsed ? 64 : 250 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="h-full bg-surface-950/40 backdrop-blur-xl border-r border-white/[0.06] flex flex-col overflow-hidden relative"
    >
      {/* Subtle gradient accent on left edge */}
      <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-primary-500/20 via-transparent to-primary-500/10" />

      {/* Server Selector */}
      <AnimatePresence>
        {!sidebarCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-3 border-b border-white/[0.04]"
          >
            <div className="relative">
              <Server size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none" />
              <select
                className="w-full pl-8 pr-3 py-2 bg-white/[0.04] border border-white/[0.06] rounded-xl text-sm text-surface-200 focus:outline-none focus:border-primary-500/40 focus:bg-white/[0.06] transition-all appearance-none cursor-pointer"
                value={activeServerId || ''}
                onChange={(e) => setActiveServer(e.target.value || null)}
              >
                <option value="">Select Server...</option>
                {servers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name}
                  </option>
                ))}
              </select>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {sidebarCollapsed && (
        <div className="p-3 border-b border-white/[0.04] flex justify-center">
          <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center">
            <Server size={15} className="text-surface-400" />
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {navSections.map((section, sectionIndex) => (
          <div key={section.label} className={sectionIndex > 0 ? 'mt-1' : ''}>
            {/* Section label */}
            {!sidebarCollapsed && (
              <div className="px-3 pt-3 pb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-surface-600">
                  {section.label}
                </span>
              </div>
            )}
            {sidebarCollapsed && sectionIndex > 0 && (
              <div className="mx-3 my-2 border-t border-white/[0.04]" />
            )}

            {/* Items */}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;

                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`relative w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 group ${
                      isActive
                        ? 'text-white'
                        : 'text-surface-400 hover:text-surface-200 hover:bg-white/[0.04]'
                    }`}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    {/* Active background */}
                    {isActive && (
                      <motion.div
                        layoutId="sidebar-active"
                        className="absolute inset-0 rounded-xl"
                        style={{
                          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(99, 102, 241, 0.08) 100%)',
                          border: '1px solid rgba(99, 102, 241, 0.2)',
                          boxShadow: '0 0 20px -5px rgba(99, 102, 241, 0.15)',
                        }}
                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                      />
                    )}

                    {/* Active indicator line */}
                    {isActive && (
                      <motion.div
                        layoutId="sidebar-indicator"
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-primary-400"
                        style={{ boxShadow: '0 0 8px 1px rgba(99, 102, 241, 0.5)' }}
                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                      />
                    )}

                    <Icon
                      size={17}
                      className={`relative z-10 shrink-0 transition-colors ${
                        isActive
                          ? 'text-primary-400'
                          : item.accent
                          ? `${item.accent} opacity-60 group-hover:opacity-100`
                          : ''
                      }`}
                    />
                    {!sidebarCollapsed && (
                      <span className="relative z-10 truncate">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-white/[0.04]">
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center py-2 rounded-xl text-surface-500 hover:text-surface-300 hover:bg-white/[0.04] transition-all duration-200"
        >
          {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>
    </motion.aside>
  );
}
