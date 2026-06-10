import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Archive,
  Plus,
  Download,
  Trash2,
  Clock,
  HardDrive,
  Loader2,
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';

interface Backup {
  id: string;
  serverId: string;
  name: string;
  path: string;
  size: number;
  type: string;
  createdAt: string;
}

export default function BackupManager() {
  const { activeServerId, servers } = useAppStore();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const activeServer = servers.find(s => s.id === activeServerId);

  useEffect(() => {
    if (activeServer) loadBackups();
  }, [activeServerId]);

  const loadBackups = async () => {
    if (!activeServer || !window.electronAPI) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.backup.list(activeServer.id);
      setBackups(result);
    } catch {
      toast.error('Failed to load backups');
    } finally {
      setLoading(false);
    }
  };

  const createBackup = async (type: string) => {
    if (!activeServer || !window.electronAPI) return;
    setCreating(true);
    try {
      const backup = await window.electronAPI.backup.create(activeServer.id, { type });
      setBackups([backup, ...backups]);
      toast.success('Backup created');
    } catch {
      toast.error('Backup failed');
    } finally {
      setCreating(false);
    }
  };

  const restoreBackup = async (backup: Backup) => {
    if (!window.electronAPI) return;
    const confirmed = window.confirm(`Restore from "${backup.name}"? This will overwrite current files.`);
    if (!confirmed) return;

    try {
      await window.electronAPI.backup.restore(backup.id);
      toast.success('Backup restored');
    } catch {
      toast.error('Restore failed');
    }
  };

  const deleteBackup = async (backup: Backup) => {
    if (!window.electronAPI) return;
    const confirmed = window.confirm(`Delete "${backup.name}"? This cannot be undone.`);
    if (!confirmed) return;

    try {
      await window.electronAPI.backup.delete(backup.id);
      setBackups(backups.filter(b => b.id !== backup.id));
      toast.success('Backup deleted');
    } catch {
      toast.error('Delete failed');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  if (!activeServer) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center h-full">
        <Archive size={48} className="text-surface-600 mb-4" />
        <p className="text-surface-400">Select a server to manage backups</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-100">Backup Manager</h1>
          <p className="text-sm text-surface-400 mt-1">{backups.length} backups for {activeServer.name}</p>
        </div>
      </div>

      {/* Backup Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { type: 'full', label: 'Full Backup', desc: 'Everything' },
          { type: 'resources', label: 'Resources Only', desc: 'Resource files' },
          { type: 'config', label: 'Config Only', desc: 'server.cfg' },
        ].map((action) => (
          <button
            key={action.type}
            onClick={() => createBackup(action.type)}
            disabled={creating}
            className="card hover:border-primary-500/50 flex items-center gap-3 cursor-pointer transition-all"
          >
            {creating ? (
              <Loader2 size={20} className="animate-spin text-primary-400" />
            ) : (
              <Plus size={20} className="text-primary-400" />
            )}
            <div className="text-left">
              <p className="text-sm font-medium text-surface-100">{action.label}</p>
              <p className="text-xs text-surface-400">{action.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Backup List */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-surface-100">Backup History</h2>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="animate-spin text-primary-500" />
          </div>
        ) : backups.length === 0 ? (
          <div className="card text-center py-8 text-surface-400">
            No backups yet. Create your first backup above.
          </div>
        ) : (
          backups.map((backup) => (
            <div key={backup.id} className="card flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary-600/20 flex items-center justify-center">
                <Archive size={18} className="text-primary-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-surface-100 truncate">{backup.name}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="flex items-center gap-1 text-xs text-surface-400">
                    <Clock size={10} />
                    {new Date(backup.createdAt).toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-surface-400">
                    <HardDrive size={10} />
                    {formatSize(backup.size)}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 bg-surface-700 rounded text-surface-300 capitalize">
                    {backup.type}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => restoreBackup(backup)}
                  className="p-2 rounded-lg hover:bg-primary-600/20 transition-colors"
                  title="Restore"
                >
                  <Download size={16} className="text-primary-400" />
                </button>
                <button
                  onClick={() => deleteBackup(backup)}
                  className="p-2 rounded-lg hover:bg-red-600/20 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={16} className="text-red-400" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}
