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
  TrendingUp,
  Sparkles,
  Globe,
  Download,
  HardDrive,
  Search,
  FileText,
  Cpu,
} from 'lucide-react';
import { useAppStore, Server as ServerType } from '../stores/useAppStore';
import toast from 'react-hot-toast';

const statusConfig = {
  running: { color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-500/25', dot: 'glow-dot-green', label: 'Running' },
  stopped: { color: 'text-surface-400', bg: 'bg-surface-400/10', border: 'border-surface-500/25', dot: 'glow-dot-amber', label: 'Stopped' },
  error:   { color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-500/25', dot: 'glow-dot-red', label: 'Error' },
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] } },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { servers, setServers, setActiveServer, actionLog, removeServer, logAction, updateServer } = useAppStore();

  useEffect(() => { loadServers(); }, []);

  // Listen for server status changes from the backend (process exit/error)
  useEffect(() => {
    if (!window.electronAPI?.onServerStatusChange) return;
    const cleanup = window.electronAPI.onServerStatusChange((data) => {
      updateServer(data.serverId, { status: data.status as any });
      if (data.status === 'stopped') {
        toast('Server process exited', { icon: '⏹️' });
      } else if (data.status === 'error') {
        toast.error('Server process crashed');
      }
    });
    return cleanup;
  }, []);

  const loadServers = async () => {
    if (window.electronAPI) {
      try {
        const data = await window.electronAPI.server.getAll();
        // Always sync with backend — backend is the source of truth
        setServers(data);
      } catch (err) {
        console.error('Failed to load servers from backend:', err);
      }
    }
  };

  const [deleteTarget, setDeleteTarget] = useState<ServerType | null>(null);
  const [deleteFiles, setDeleteFiles] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // Import existing server state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPath, setImportPath] = useState('');
  const [importName, setImportName] = useState('');
  const [importing, setImporting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    framework: string;
    artifactVersion: string;
    resourceCount: number;
    hasServerCfg: boolean;
    hasFXServer: boolean;
    serverName: string;
  } | null>(null);

  const handleBrowseImport = async () => {
    if (!window.electronAPI) return;
    const dir = await window.electronAPI.openDirectory();
    if (!dir) return;
    setImportPath(dir);
    setScanResult(null);
    setScanning(true);
    try {
      const result = await window.electronAPI.server.scan(dir);
      setScanResult(result);
      setImportName(result.serverName);
    } catch (err: any) {
      toast.error('Failed to scan folder');
    } finally {
      setScanning(false);
    }
  };

  const handleImportServer = async () => {
    if (!window.electronAPI || !importPath) return;
    setImporting(true);
    try {
      const result = await window.electronAPI.server.import(importPath, importName || undefined);
      if (result.success && result.server) {
        await loadServers();
        logAction('Server Imported', `${result.server.name} (${result.detected?.framework || 'custom'})`, 'success');
        toast.success(`Imported "${result.server.name}" successfully!`);
        setShowImportModal(false);
        setImportPath('');
        setImportName('');
        setScanResult(null);
      } else {
        toast.error(result.error || 'Failed to import server');
      }
    } catch (err: any) {
      toast.error(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

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
      if (window.electronAPI) {
        await window.electronAPI.server.delete(deleteTarget.id);
        if (deleteFiles && deleteTarget.installPath) {
          try { await window.electronAPI.file.delete(deleteTarget.installPath); } catch {}
        }
      }
      removeServer(deleteTarget.id);
      logAction('Server Deleted', `${deleteTarget.name} ${deleteFiles ? 'permanently deleted' : 'removed from builder'}`, 'warning');
      toast.success(`${deleteTarget.name} deleted`);
    } catch (err: any) {
      toast.error(`Failed to delete: ${err.message}`);
    } finally { setDeleting(false); setDeleteTarget(null); }
  };

  const handleToggleServer = async (e: React.MouseEvent, server: ServerType) => {
    e.stopPropagation();
    if (!window.electronAPI) return;

    if (server.status === 'running') {
      try {
        const stopped = await window.electronAPI.server.stop(server.id);
        if (stopped) {
          updateServer(server.id, { status: 'stopped' });
          logAction('Server Stopped', server.name, 'info');
          toast.success(`${server.name} stopped`);
        } else {
          toast.error('Failed to stop server');
        }
      } catch (err: any) {
        toast.error(`Error stopping server: ${err.message}`);
      }
    } else {
      // Optimistically show starting state
      updateServer(server.id, { status: 'running' });
      try {
        const result = await window.electronAPI.server.start(server.id);
        if (result.success) {
          logAction('Server Started', server.name, 'success');
          toast.success(`${server.name} started!`);
        } else {
          updateServer(server.id, { status: 'error' });
          logAction('Server Start Failed', result.error || 'Unknown error', 'error');
          toast.error(result.error || 'Failed to start server');
        }
      } catch (err: any) {
        updateServer(server.id, { status: 'error' });
        toast.error(`Error starting server: ${err.message}`);
      }
    }
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="p-6 space-y-6">
      {/* ═══ Hero Header ═══ */}
      <motion.div variants={itemVariants} className="relative overflow-hidden rounded-2xl">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-600/20 via-surface-900/80 to-purple-600/10 rounded-2xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary-500/10 via-transparent to-transparent" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary-400/5 rounded-full blur-[80px]" />

        <div className="relative z-10 flex items-center justify-between p-6 border border-overlay-6 rounded-2xl">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={16} className="text-primary-400" />
              <span className="text-xs font-medium text-primary-400 uppercase tracking-wide">Command Center</span>
            </div>
            <h1 className="text-3xl font-extrabold text-surface-100 tracking-tight">Dashboard</h1>
            <p className="text-sm text-surface-400 mt-1">Manage and monitor your FiveM servers</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowImportModal(true)} className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-overlay-6 text-surface-300 hover:bg-overlay-10 hover:text-surface-100 border border-overlay-8 hover:border-overlay-15 transition-all">
              <Download size={16} />
              Import Server
            </button>
            <button onClick={() => navigate('/create')} className="btn-primary flex items-center gap-2.5">
              <Plus size={16} />
              New Server
            </button>
          </div>
        </div>
      </motion.div>

      {/* ═══ Stats ═══ */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Server} label="Total Servers" value={servers.length} gradient="from-primary-500/20 to-indigo-500/5" iconColor="text-primary-400" />
        <StatCard icon={Zap} label="Running" value={runningServers} gradient="from-emerald-500/20 to-green-500/5" iconColor="text-emerald-400" />
        <StatCard icon={Package} label="Resources" value={totalResources} gradient="from-purple-500/20 to-violet-500/5" iconColor="text-purple-400" />
        <StatCard icon={HeartPulse} label="Health Issues" value={0} gradient="from-amber-500/20 to-yellow-500/5" iconColor="text-amber-400" />
      </motion.div>

      {/* ═══ Quick Actions ═══ */}
      {servers.length > 0 && (
        <motion.div variants={itemVariants}>
          <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-[0.08em] mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Scan Resources', icon: Package, path: '/resources', gradient: 'from-purple-500/10 to-transparent', iconColor: 'text-purple-400' },
              { label: 'Health Check', icon: HeartPulse, path: '/health', gradient: 'from-emerald-500/10 to-transparent', iconColor: 'text-emerald-400' },
              { label: 'Create Backup', icon: Archive, path: '/backups', gradient: 'from-amber-500/10 to-transparent', iconColor: 'text-amber-400' },
              { label: 'Browse Files', icon: FolderOpen, path: '/files', gradient: 'from-sky-500/10 to-transparent', iconColor: 'text-sky-400' },
            ].map((action) => (
              <button
                key={action.path}
                onClick={() => navigate(action.path)}
                className="group relative overflow-hidden flex items-center gap-3 p-3 rounded-xl border border-overlay-4 hover:border-overlay-10 bg-overlay-2 hover:bg-overlay-4 transition-all duration-300"
              >
                <div className={`absolute inset-0 bg-gradient-to-r ${action.gradient} opacity-0 group-hover:opacity-100 transition-opacity`} />
                <div className="relative z-10 flex items-center gap-3 w-full">
                  <div className="w-8 h-8 rounded-lg bg-overlay-4 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <action.icon size={15} className={action.iconColor} />
                  </div>
                  <span className="text-sm text-surface-300 group-hover:text-surface-100 transition-colors font-medium">{action.label}</span>
                  <ArrowRight size={12} className="text-surface-600 ml-auto group-hover:text-surface-400 group-hover:translate-x-0.5 transition-all" />
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* ═══ Server List ═══ */}
      <motion.div variants={itemVariants} className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-surface-100">Your Servers</h2>
          {servers.length > 0 && (
            <span className="text-xs text-surface-500">{servers.length} server{servers.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        {servers.length === 0 ? (
          <div className="relative overflow-hidden rounded-2xl border border-overlay-6 bg-surface-900/30">
            <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 via-transparent to-purple-500/5" />
            <div className="relative z-10 flex flex-col items-center justify-center py-20">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500/10 to-primary-500/5 border border-primary-500/20 flex items-center justify-center mb-5">
                <Server size={32} className="text-primary-400/60" />
              </div>
              <p className="text-lg font-semibold text-surface-200 mb-1">No servers yet</p>
              <p className="text-sm text-surface-500 mb-6">Create a new server or import one you already have</p>
              <div className="flex items-center gap-3">
                <button onClick={() => navigate('/create')} className="btn-primary flex items-center gap-2">
                  <Plus size={16} />
                  Create New Server
                </button>
                <button onClick={() => setShowImportModal(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-overlay-6 text-surface-300 hover:bg-overlay-10 hover:text-surface-100 border border-overlay-8 hover:border-overlay-15 transition-all">
                  <Download size={16} />
                  Import Existing
                </button>
              </div>
            </div>
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
                  onSelect={() => { setActiveServer(server.id); navigate(`/server/${server.id}`); }}
                  onDelete={(e) => handleDeleteServer(e, server)}
                  onToggle={(e) => handleToggleServer(e, server)}
                />
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* ═══ Recent Activity ═══ */}
      {actionLog.length > 0 && (
        <motion.div variants={itemVariants} className="space-y-3">
          <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-[0.08em]">Recent Activity</h2>
          <div className="card-flat space-y-0.5 p-2">
            {actionLog.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-overlay-3 transition-colors">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  log.severity === 'success' ? 'bg-emerald-400' :
                  log.severity === 'warning' ? 'bg-amber-400' :
                  log.severity === 'error' ? 'bg-red-400' : 'bg-surface-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-surface-200 font-medium">{log.action}</span>
                  <span className="text-xs text-surface-500 ml-2">{log.detail}</span>
                </div>
                <span className="text-[10px] text-surface-600 shrink-0 font-mono">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ═══ Import Server Modal ═══ */}
      <AnimatePresence>
        {showImportModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md"
            onClick={() => !importing && (setShowImportModal(false), setScanResult(null), setImportPath(''))}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-panel p-6 max-w-lg w-full mx-4"
            >
              {/* Header */}
              <div className="flex items-start gap-4 mb-5">
                <div className="w-12 h-12 rounded-xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center shrink-0">
                  <HardDrive size={22} className="text-primary-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-surface-100">Import Existing Server</h3>
                  <p className="text-sm text-surface-400 mt-0.5">
                    Select your existing FiveM server folder
                  </p>
                </div>
                <button onClick={() => !importing && (setShowImportModal(false), setScanResult(null), setImportPath(''))} className="p-1.5 rounded-lg text-surface-500 hover:text-surface-100 hover:bg-overlay-6 transition-all">
                  <X size={16} />
                </button>
              </div>

              {/* Folder Picker */}
              <div className="mb-5">
                <label className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2 block">Server Folder</label>
                <div className="flex gap-2">
                  <div className="flex-1 bg-overlay-3 border border-overlay-6 rounded-xl px-4 py-2.5 text-sm text-surface-300 truncate font-mono">
                    {importPath || 'No folder selected...'}
                  </div>
                  <button
                    onClick={handleBrowseImport}
                    disabled={importing}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 border border-primary-500/20 transition-all"
                  >
                    <FolderOpen size={16} />
                  </button>
                </div>
              </div>

              {/* Scanning indicator */}
              {scanning && (
                <div className="flex items-center gap-3 mb-5 p-4 rounded-xl bg-primary-500/5 border border-primary-500/10">
                  <Loader2 size={18} className="text-primary-400 animate-spin" />
                  <span className="text-sm text-primary-300">Scanning server folder...</span>
                </div>
              )}

              {/* Scan results */}
              {scanResult && !scanning && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-5 space-y-4"
                >
                  {/* Server Name Input */}
                  <div>
                    <label className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2 block">Server Name</label>
                    <input
                      type="text"
                      value={importName}
                      onChange={(e) => setImportName(e.target.value)}
                      className="w-full bg-overlay-3 border border-overlay-6 rounded-xl px-4 py-2.5 text-sm text-surface-100 placeholder-surface-600 focus:outline-none focus:border-primary-500/40 focus:ring-1 focus:ring-primary-500/20 transition-all"
                      placeholder="Server name..."
                    />
                  </div>

                  {/* Detection Results */}
                  <div className="bg-overlay-3 border border-overlay-6 rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-surface-400 uppercase tracking-wider flex items-center gap-2">
                      <Search size={12} />
                      Detected Configuration
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <DetectionItem
                        icon={Cpu}
                        label="Framework"
                        value={scanResult.framework === 'qbcore' ? 'QBCore' : scanResult.framework === 'esx' ? 'ESX Legacy' : 'Custom'}
                        color={scanResult.framework === 'qbcore' ? 'text-blue-400' : scanResult.framework === 'esx' ? 'text-orange-400' : 'text-surface-400'}
                      />
                      <DetectionItem
                        icon={Package}
                        label="Resources"
                        value={`${scanResult.resourceCount} found`}
                        color="text-purple-400"
                      />
                      <DetectionItem
                        icon={HardDrive}
                        label="Artifacts"
                        value={scanResult.artifactVersion === 'unknown' ? 'Not detected' : `Build ${scanResult.artifactVersion}`}
                        color={scanResult.artifactVersion === 'unknown' ? 'text-amber-400' : 'text-emerald-400'}
                      />
                      <DetectionItem
                        icon={FileText}
                        label="server.cfg"
                        value={scanResult.hasServerCfg ? 'Found' : 'Missing'}
                        color={scanResult.hasServerCfg ? 'text-emerald-400' : 'text-red-400'}
                      />
                    </div>
                  </div>

                  {/* Warnings */}
                  {!scanResult.hasFXServer && (
                    <div className="bg-amber-500/8 border border-amber-500/15 rounded-xl p-3">
                      <p className="text-xs text-amber-300 flex items-center gap-2">
                        <AlertTriangle size={13} className="shrink-0" />
                        No FXServer executable found. You may need to download artifacts.
                      </p>
                    </div>
                  )}

                  {!scanResult.hasServerCfg && (
                    <div className="bg-amber-500/8 border border-amber-500/15 rounded-xl p-3">
                      <p className="text-xs text-amber-300 flex items-center gap-2">
                        <AlertTriangle size={13} className="shrink-0" />
                        No server.cfg found. You'll need to create one or use the Health Scanner.
                      </p>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => !importing && (setShowImportModal(false), setScanResult(null), setImportPath(''))}
                  disabled={importing}
                  className="flex-1 btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportServer}
                  disabled={importing || !importPath || !scanResult}
                  className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {importing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  {importing ? 'Importing...' : 'Import Server'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Delete Confirmation Modal ═══ */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md"
            onClick={() => !deleting && setDeleteTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-panel p-6 max-w-md w-full mx-4"
            >
              <div className="flex items-start gap-4 mb-5">
                <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                  <AlertTriangle size={22} className="text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-surface-100">Delete Server</h3>
                  <p className="text-sm text-surface-400 mt-0.5">
                    Are you sure you want to delete <span className="text-surface-100 font-semibold">"{deleteTarget.name}"</span>?
                  </p>
                </div>
                <button onClick={() => !deleting && setDeleteTarget(null)} className="p-1.5 rounded-lg text-surface-500 hover:text-surface-100 hover:bg-overlay-6 transition-all">
                  <X size={16} />
                </button>
              </div>

              <div className="bg-overlay-3 border border-overlay-6 rounded-xl p-4 mb-5 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer" onClick={() => setDeleteFiles(true)}>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 transition-all ${
                    deleteFiles ? 'border-red-400 bg-red-500' : 'border-surface-600'
                  }`}>
                    {deleteFiles && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-surface-100">Delete everything</p>
                    <p className="text-xs text-surface-400 mt-0.5">Remove from builder <span className="text-red-400 font-medium">AND delete all files</span></p>
                    {deleteTarget.installPath && <p className="text-[10px] text-surface-600 font-mono mt-1 truncate">{deleteTarget.installPath}</p>}
                  </div>
                </label>
                <div className="border-t border-overlay-4" />
                <label className="flex items-start gap-3 cursor-pointer" onClick={() => setDeleteFiles(false)}>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 transition-all ${
                    !deleteFiles ? 'border-primary-400 bg-primary-500' : 'border-surface-600'
                  }`}>
                    {!deleteFiles && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-surface-100">Remove from builder only</p>
                    <p className="text-xs text-surface-400 mt-0.5">Keep server files on your computer</p>
                  </div>
                </label>
              </div>

              {deleteFiles && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="bg-red-500/8 border border-red-500/15 rounded-xl p-3 mb-5">
                  <p className="text-xs text-red-300 flex items-center gap-2">
                    <AlertTriangle size={13} className="shrink-0" />
                    This permanently deletes all server files, resources, and configs. Cannot be undone.
                  </p>
                </motion.div>
              )}

              <div className="flex gap-3">
                <button onClick={() => !deleting && setDeleteTarget(null)} disabled={deleting} className="flex-1 btn-secondary">Cancel</button>
                <button onClick={confirmDelete} disabled={deleting} className="flex-1 btn-danger flex items-center justify-center gap-2">
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
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

/* ═══ Stat Card ═══ */
function StatCard({ icon: Icon, label, value, gradient, iconColor }: {
  icon: any; label: string; value: number; gradient: string; iconColor: string;
}) {
  return (
    <motion.div whileHover={{ scale: 1.02, y: -2 }} transition={{ duration: 0.2 }} className="relative overflow-hidden card group">
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-60 group-hover:opacity-100 transition-opacity`} />
      <div className="relative z-10 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-overlay-6 border border-overlay-6 flex items-center justify-center group-hover:scale-105 transition-transform">
          <Icon size={20} className={iconColor} />
        </div>
        <div>
          <p className="text-2xl font-extrabold text-surface-100 tracking-tight">{value}</p>
          <p className="text-[11px] text-surface-400 font-medium">{label}</p>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══ Detection Item ═══ */
function DetectionItem({ icon: Icon, label, value, color }: {
  icon: any; label: string; value: string; color: string;
}) {
  return (
    <div className="flex items-center gap-2.5 bg-overlay-2 rounded-lg p-2.5">
      <Icon size={14} className={color} />
      <div className="min-w-0">
        <p className="text-[10px] text-surface-500 uppercase tracking-wider">{label}</p>
        <p className={`text-xs font-semibold ${color} truncate`}>{value}</p>
      </div>
    </div>
  );
}

/* ═══ Server Card ═══ */
function ServerCard({ server, onSelect, onDelete, onToggle }: {
  server: ServerType; onSelect: () => void; onDelete: (e: React.MouseEvent) => void; onToggle: (e: React.MouseEvent) => void;
}) {
  const status = statusConfig[server.status as keyof typeof statusConfig] || statusConfig.stopped;
  const frameworkLabels: Record<string, string> = { esx: 'ESX Legacy', qbcore: 'QBCore', custom: 'Custom', blank: 'Blank' };

  return (
    <div className="card cursor-pointer group hover:border-primary-500/20" onClick={onSelect}>
      {/* Server status glow */}
      {server.status === 'running' && (
        <div className="absolute -top-px left-4 right-4 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
      )}

      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-500/15 to-primary-600/5 border border-primary-500/15 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Server size={18} className="text-primary-400" />
          </div>
          <div>
            <h3 className="font-bold text-surface-100 group-hover:text-primary-300 transition-colors">{server.name}</h3>
            <p className="text-xs text-surface-500">{frameworkLabels[server.framework] || server.framework} &middot; {server.os}</p>
          </div>
        </div>
        <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-medium ${status.bg} ${status.color} border ${status.border}`}>
          <div className={status.dot} />
          {status.label}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'Resources', value: server.resourceCount },
          { label: 'Artifacts', value: server.artifactVersion || 'N/A' },
          { label: 'Backup', value: server.lastBackup ? new Date(server.lastBackup).toLocaleDateString() : 'Never' },
        ].map((stat) => (
          <div key={stat.label} className="bg-overlay-3 border border-overlay-4 rounded-lg py-2.5 text-center">
            <p className="text-sm font-bold text-surface-100 truncate px-1">{stat.value}</p>
            <p className="text-[10px] text-surface-500">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-overlay-4">
        <button onClick={onToggle} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
          server.status === 'running'
            ? 'bg-red-500/8 text-red-400 hover:bg-red-500/15 border border-red-500/15'
            : 'bg-emerald-500/8 text-emerald-400 hover:bg-emerald-500/15 border border-emerald-500/15'
        }`}>
          {server.status === 'running' ? <Square size={11} /> : <Play size={11} />}
          {server.status === 'running' ? 'Stop' : 'Start'}
        </button>
        <button onClick={(e) => { e.stopPropagation(); window.electronAPI.openPath(server.installPath); }} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium bg-overlay-4 text-surface-300 hover:bg-overlay-8 border border-overlay-4 transition-all">
          <FolderOpen size={11} />
          Open
        </button>
        <button onClick={(e) => {
          e.stopPropagation();
          window.electronAPI.txAdmin.open(server.installPath)
            .then(r => { toast.success(`Opening txAdmin at ${r.url}`); })
            .catch(() => { toast.error('Failed to open txAdmin'); });
        }} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium bg-primary-500/8 text-primary-400 hover:bg-primary-500/15 border border-primary-500/15 transition-all">
          <Globe size={11} />
          txAdmin
        </button>
        <button onClick={onDelete} className="p-2 rounded-xl text-surface-600 hover:text-red-400 hover:bg-red-500/8 border border-transparent hover:border-red-500/15 transition-all">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
