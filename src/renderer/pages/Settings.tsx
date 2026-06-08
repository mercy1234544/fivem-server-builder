import React from 'react';
import { motion } from 'framer-motion';
import {
  Settings as SettingsIcon,
  Moon,
  Sun,
  Monitor,
  Server,
  Trash2,
  FolderOpen,
  Info,
  Github,
  Heart,
  Activity,
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import toast from 'react-hot-toast';

export default function Settings() {
  const { theme, toggleTheme, servers, actionLog } = useAppStore();

  const totalBackups = 0;
  const clearLogs = () => {
    toast.success('Activity log cleared');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-2xl"
    >
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-surface-400 mt-1">Configure application preferences</p>
      </div>

      {/* Appearance */}
      <div className="glass-panel p-5 space-y-4">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <Monitor size={16} className="text-primary-400" />
          Appearance
        </h2>
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium text-surface-200">Theme</p>
            <p className="text-xs text-surface-400">Switch between dark and light mode</p>
          </div>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 px-4 py-2 bg-surface-700 rounded-lg hover:bg-surface-600 transition-colors"
          >
            {theme === 'dark' ? <Moon size={16} className="text-blue-400" /> : <Sun size={16} className="text-amber-400" />}
            <span className="text-sm capitalize">{theme} Mode</span>
          </button>
        </div>
      </div>

      {/* Storage */}
      <div className="glass-panel p-5 space-y-4">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <FolderOpen size={16} className="text-amber-400" />
          Storage
        </h2>
        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-surface-400">Servers registered</span>
            <span className="text-surface-200 font-medium">{servers.length}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-surface-400">Total backups</span>
            <span className="text-surface-200 font-medium">{totalBackups}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-surface-400">Activity log entries</span>
            <span className="text-surface-200 font-medium">{actionLog.length}</span>
          </div>
        </div>
      </div>

      {/* Activity Log */}
      {actionLog.length > 0 && (
        <div className="glass-panel p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Activity size={16} className="text-green-400" />
              Recent Activity
            </h2>
            <button onClick={clearLogs} className="text-xs text-surface-400 hover:text-surface-200 transition-colors">
              Clear
            </button>
          </div>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {actionLog.slice(0, 20).map((log) => (
              <div key={log.id} className="flex items-center gap-3 py-1.5 text-sm">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  log.severity === 'success' ? 'bg-green-400' :
                  log.severity === 'warning' ? 'bg-amber-400' :
                  log.severity === 'error' ? 'bg-red-400' :
                  'bg-surface-500'
                }`} />
                <span className="text-surface-300">{log.action}</span>
                <span className="text-surface-500 text-xs">{log.detail}</span>
                <span className="text-surface-600 text-[10px] ml-auto">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* About */}
      <div className="glass-panel p-5 space-y-4">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <Info size={16} className="text-blue-400" />
          About
        </h2>
        <div className="space-y-2.5">
          <div className="flex justify-between text-sm">
            <span className="text-surface-400">Application</span>
            <span className="text-surface-200">FiveM Server Builder</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-surface-400">Version</span>
            <span className="text-surface-200">1.0.0</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-surface-400">Electron</span>
            <span className="text-surface-200">28.x</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-surface-400">React</span>
            <span className="text-surface-200">18.x</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-surface-400">TypeScript</span>
            <span className="text-surface-200">5.x</span>
          </div>
        </div>
      </div>

      <div className="text-center text-xs text-surface-500 pb-4">
        <p className="flex items-center justify-center gap-1">
          Built with <Heart size={10} className="text-red-400" /> for the FiveM community
        </p>
      </div>
    </motion.div>
  );
}
