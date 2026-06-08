import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Server,
  Package,
  HeartPulse,
  Archive,
  Plus,
  Play,
  Square,
  AlertCircle,
  CheckCircle2,
  Clock,
  Trash2,
  FolderOpen,
  Activity,
  ArrowRight,
  Zap,
  Loader2,
  X,
  AlertTriangle,
} from 'lucide-react';
import { useAppStore, Server as ServerType } from '../stores/useAppStore';
import toast from 'react-hot-toast';

const statusColors = {
  running: 'text-green-400 bg-green-400/10 border-green-500/30',
  stopped: 'text-surface-400 bg-surface-400/10 border-surface-500/30',
  error: 'text-red-400 bg-red-400/10 border-red-500/30',
};

const statusIcons = {
  running: CheckCircle2,
  stopped: Clock,
  error: AlertCircle,
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { servers, setServers, setActiveServer, actionLog, removeServer, logAction, updateServer } = useAppStore();

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    if (window.electronAPI) {
      try {
        const data = await window.electronAPI.server.getAll();
        setServers(data);
      } catch {}
    }
  };

  const [deleteTarget, setDeleteTarget] = useState<ServerType | null>(null);
  const [deleteFiles, setDeleteFiles] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const totalResources = servers.reduce((sum, s) => sum + s.resourceCount, 0);
  const runningServers = servers.filter(s => s.status === 'running').length;

  const handleDeleteServer = (e: React.MouseEvent, server: ServerType) => {
    e.stopPropagation();
    setDeleteTarget(server);
    setDeleteFiles(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    try {
      // Delete from the backend
      if (window.electronAPI) {
        await window.electronAPI.server.delete(deleteTarget.id);

        // Delete actual server files from disk if requested
        if (deleteFiles && deleteTarget.installPath) {
          try {
            await window.electronAPI.file.delete(deleteTarget.installPath);
          } catch (err) {
            console.error('Failed to delete server files:', err);
          }
        }
      }

      // Remove from local store
      removeServer(deleteTarget.id);

      const action = deleteFiles ? 'permanently deleted (files removed)' : 'removed from builder (files kept)';
      logAction('Server Deleted', `${deleteTarget.name} ${action}`, 'warning');
      toast.success(`${deleteTarget.name} deleted`);
    } catch (err: any) {
      toast.error(`Failed to delete: ${err.message}`);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleToggleServer = async (e: React.MouseEvent, server: ServerType) => {
    e.stopPropagation();
    if (server.status === 'running') {
      updateServer(server.id, { status: 'stopped' });
      logAction('Server Stopped', server.name, 'info');
      toast.success(`${server.name} stopped`);
    } else {
      updateServer(server.id, { status: 'running' });
      logAction('Server Started', server.name, 'success');
      toast.success(`${server.name} started`);
    }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-surface-400 mt-1">Manage your FiveM servers</p>
        </div>
        <button
          onClick={() => navigate('/create')}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          New Server
        </button>
      </motion.div>

      {/* Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Server} label="Total Servers" value={servers.length} color="text-primary-400" bgColor="bg-primary-400/10" />
        <StatCard icon={Play} label="Running" value={runningServers} color="text-green-400" bgColor="bg-green-400/10" />
        <StatCard icon={Package} label="Total Resources" value={totalResources} color="text-purple-400" bgColor="bg-purple-400/10" />
        <StatCard icon={HeartPulse} label="Health Issues" value={0} color="text-amber-400" bgColor="bg-amber-400/10" />
      </motion.div>

      {/* Quick Actions */}
      {servers.length > 0 && (
        <motion.div variants={itemVariants}>
          <h2 className="text-sm font-semibold text-surface-400 uppercase tracking-wide mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: 'Scan Resources', icon: Package, path: '/resources', color: 'text-purple-400' },
              { label: 'Health Check', icon: HeartPulse, path: '/health', color: 'text-green-400' },
              { label: 'Create Backup', icon: Archive, path: '/backups', color: 'text-amber-400' },
              { label: 'Browse Files', icon: FolderOpen, path: '/files', color: 'text-blue-400' },
            ].map((action) => (
              <button
                key={action.path}
                onClick={() => navigate(action.path)}
                className="flex items-center gap-2.5 px-3 py-2.5 bg-surface-800/50 border border-surface-700/50 rounded-xl hover:bg-surface-800 hover:border-surface-600/50 transition-all group"
              >
                <action.icon size={16} className={action.color} />
                <span className="text-sm text-surface-300 group-hover:text-white transition-colors">{action.label}</span>
                <ArrowRight size={12} className="text-surface-600 ml-auto group-hover:text-surface-400 transition-colors" />
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Server List */}
      <motion.div variants={itemVariants} className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Your Servers</h2>

        {servers.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-surface-800 flex items-center justify-center mb-4">
              <Server size={28} className="text-surface-500" />
            </div>
            <p className="text-surface-300 font-medium mb-1">No servers yet</p>
            <p className="text-xs text-surface-500 mb-5">Create your first FiveM server to get started</p>
            <button
              onClick={() => navigate('/create')}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={16} />
              Create Your First Server
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {servers.map((server, index) => (
              <motion.div
                key={server.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <ServerCard
                  server={server}
                  onSelect={() => {
                    setActiveServer(server.id);
                    navigate('/resources');
                  }}
                  onDelete={(e) => handleDeleteServer(e, server)}
                  onToggle={(e) => handleToggleServer(e, server)}
                />
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Recent Activity */}
      {actionLog.length > 0 && (
        <motion.div variants={itemVariants} className="space-y-3">
          <h2 className="text-sm font-semibold text-surface-400 uppercase tracking-wide">Recent Activity</h2>
          <div className="space-y-1">
            {actionLog.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-800/30 transition-colors">
                <Activity size={14} className={
                  log.severity === 'success' ? 'text-green-400' :
                  log.severity === 'warning' ? 'text-amber-400' :
                  log.severity === 'error' ? 'text-red-400' :
                  'text-surface-400'
                } />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-surface-200">{log.action}</span>
                  <span className="text-xs text-surface-500 ml-2">{log.detail}</span>
                </div>
                <span className="text-[10px] text-surface-500 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Delete Confirmation Modal ─────────────────────────────────── */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => !deleting && setDeleteTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-900 border border-surface-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-start gap-4 mb-5">
                <div className="w-12 h-12 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                  <AlertTriangle size={22} className="text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Delete Server</h3>
                  <p className="text-sm text-surface-400 mt-0.5">
                    Are you sure you want to delete <span className="text-white font-medium">"{deleteTarget.name}"</span>?
                  </p>
                </div>
                <button
                  onClick={() => !deleting && setDeleteTarget(null)}
                  className="p-1 rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-800 transition-all ml-auto"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Delete files option */}
              <div className="bg-surface-800/60 border border-surface-700/50 rounded-xl p-4 mb-5 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer group" onClick={() => setDeleteFiles(true)}>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 transition-all ${
                    deleteFiles ? 'border-red-500 bg-red-500' : 'border-surface-500'
                  }`}>
                    {deleteFiles && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Delete everything</p>
                    <p className="text-xs text-surface-400 mt-0.5">
                      Remove from builder <span className="text-red-400 font-medium">AND delete all server files</span> from your computer
                    </p>
                    {deleteTarget.installPath && (
                      <p className="text-[10px] text-surface-500 font-mono mt-1 truncate">{deleteTarget.installPath}</p>
                    )}
                  </div>
                </label>

                <div className="border-t border-surface-700/50" />

                <label className="flex items-start gap-3 cursor-pointer group" onClick={() => setDeleteFiles(false)}>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 transition-all ${
                    !deleteFiles ? 'border-primary-500 bg-primary-500' : 'border-surface-500'
                  }`}>
                    {!deleteFiles && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Remove from builder only</p>
                    <p className="text-xs text-surface-400 mt-0.5">
                      Keep the server files on your computer, just remove it from this app
                    </p>
                  </div>
                </label>
              </div>

              {/* Warning */}
              {deleteFiles && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-5"
                >
                  <p className="text-xs text-red-300 font-medium flex items-center gap-2">
                    <AlertTriangle size={14} className="shrink-0" />
                    This will permanently delete all server files, resources, and configurations. This cannot be undone.
                  </p>
                </motion.div>
              )}

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => !deleting && setDeleteTarget(null)}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-surface-800 text-surface-300 hover:bg-surface-700 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-all disabled:opacity-50"
                >
                  {deleting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  {deleting ? 'Deleting...' : deleteFiles ? 'Delete Everything' : 'Remove'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StatCard({ icon: Icon, label, value, color, bgColor }: {
  icon: any; label: string; value: number; color: string; bgColor: string;
}) {
  return (
    <motion.div whileHover={{ scale: 1.02 }} className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl ${bgColor} flex items-center justify-center`}>
        <Icon size={22} className={color} />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-xs text-surface-400">{label}</p>
      </div>
    </motion.div>
  );
}

function ServerCard({ server, onSelect, onDelete, onToggle }: {
  server: ServerType;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onToggle: (e: React.MouseEvent) => void;
}) {
  const StatusIcon = statusIcons[server.status as keyof typeof statusIcons];
  const frameworkLabels: Record<string, string> = {
    esx: 'ESX Legacy', qbcore: 'QBCore', custom: 'Custom', blank: 'Blank',
  };

  return (
    <div
      className="card cursor-pointer group hover:border-primary-500/30 transition-all duration-200"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-600/30 to-primary-800/30 border border-primary-500/20 flex items-center justify-center">
            <Server size={18} className="text-primary-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white group-hover:text-primary-300 transition-colors">{server.name}</h3>
            <p className="text-xs text-surface-400">
              {frameworkLabels[server.framework] || server.framework} · {server.os}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${statusColors[server.status as keyof typeof statusColors]}`}>
            <StatusIcon size={11} />
            <span className="capitalize">{server.status}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center mb-3">
        <div className="bg-surface-800/60 rounded-lg py-2.5">
          <p className="text-sm font-bold text-white">{server.resourceCount}</p>
          <p className="text-[10px] text-surface-400">Resources</p>
        </div>
        <div className="bg-surface-800/60 rounded-lg py-2.5">
          <p className="text-sm font-bold text-white truncate px-1">{server.artifactVersion || 'N/A'}</p>
          <p className="text-[10px] text-surface-400">Artifacts</p>
        </div>
        <div className="bg-surface-800/60 rounded-lg py-2.5">
          <p className="text-sm font-bold text-white">
            {server.lastBackup ? new Date(server.lastBackup).toLocaleDateString() : 'Never'}
          </p>
          <p className="text-[10px] text-surface-400">Backup</p>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-surface-700/50">
        <button
          onClick={onToggle}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            server.status === 'running'
              ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
              : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
          }`}
        >
          {server.status === 'running' ? <Square size={12} /> : <Play size={12} />}
          {server.status === 'running' ? 'Stop' : 'Start'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-surface-700/50 text-surface-300 hover:bg-surface-700 transition-all"
        >
          <FolderOpen size={12} />
          Open
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg text-surface-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
