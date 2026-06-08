import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
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
  Settings,
  ChevronLeft,
  ChevronRight,
  Server,
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/create', label: 'Create Server', icon: Plus },
  { path: '/resources', label: 'Resources', icon: Package },
  { path: '/organizer', label: 'Organizer', icon: FolderTree },
  { path: '/startup', label: 'Startup Order', icon: ListOrdered },
  { path: '/health', label: 'Health Scanner', icon: HeartPulse },
  { path: '/backups', label: 'Backups', icon: Archive },
  { path: '/files', label: 'File Explorer', icon: FolderOpen },
  { path: '/editor', label: 'Server.cfg', icon: FileCode },
  { path: '/marketplace', label: 'Marketplace', icon: Store },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar, servers, activeServerId, setActiveServer } = useAppStore();

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarCollapsed ? 64 : 240 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="h-full bg-surface-900/50 border-r border-surface-800 flex flex-col overflow-hidden"
    >
      {/* Server Selector */}
      {!sidebarCollapsed && (
        <div className="p-3 border-b border-surface-800">
          <select
            className="w-full px-2 py-1.5 bg-surface-800 border border-surface-700 rounded-lg text-sm text-surface-200 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
      )}

      {sidebarCollapsed && (
        <div className="p-3 border-b border-surface-800 flex justify-center">
          <Server size={18} className="text-surface-400" />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-primary-600/20 text-primary-400 border border-primary-500/30'
                  : 'text-surface-300 hover:bg-surface-800 hover:text-surface-100 border border-transparent'
              }`}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <Icon size={18} className="shrink-0" />
              {!sidebarCollapsed && (
                <span className="truncate">{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-surface-800">
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center py-2 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </motion.aside>
  );
}
