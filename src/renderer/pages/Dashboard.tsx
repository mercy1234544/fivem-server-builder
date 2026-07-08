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

  // Latest releases from GitHub → "Latest News & Updates" cards (HTN-style).
  const [news, setNews] = useState<{ tag: string; name: string; date: string; body: string; url: string }[]>([]);
  useEffect(() => {
    fetch('https://api.github.com/repos/mercy1234544/fivem-server-builder/releases?per_page=4')
      .then((r) => (r.ok ? r.json() : []))
      .then((rels: any[]) => {
        if (!Array.isArray(rels)) return;
        setNews(rels.map((r) => ({
          tag: r.tag_name || '',
          name: r.name || r.tag_name || 'Update',
          date: r.published_at ? new Date(r.published_at).toLocaleDateString() : '',
          body: (r.body || '').replace(/[#*`>-]/g, '').replace(/\r?\n+/g, ' ').slice(0, 110),
          url: r.html_url || '',
        })));
      })
      .catch(() => {});
  }, []);

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

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* ═══ Hero (HTN-style) ═══ */}
      <motion.div variants={itemVariants} className="relative overflow-hidden rounded-2xl border border-overlay-6 bg-gradient-to-br from-[#0a1428] via-surface-950 to-surface-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-primary-600/15 via-transparent to-transparent" />
        <div className="relative z-10 p-7">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 rounded-2xl bg-primary-600/25 border border-primary-500/30 flex items-center justify-center">
              <Server size={26} className="text-primary-300" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-surface-100 tracking-tight">FiveM Server Builder</h1>
              <p className="text-sm text-primary-300/80 font-medium">Local Game Server Management</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/servers')} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold bg-primary-600 text-white hover:bg-primary-500 transition-all">
              <Server size={15} /> Manage Servers
            </button>
            <button onClick={() => navigate('/marketplace')} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-transparent text-surface-200 hover:bg-overlay-6 border border-overlay-10 transition-all">
              Browse Store <ArrowRight size={14} />
            </button>
            <button onClick={() => setShowImportModal(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-transparent text-surface-300 hover:bg-overlay-6 border border-overlay-10 transition-all">
              <Download size={14} /> Import Server
            </button>
          </div>
        </div>
      </motion.div>

      {/* ═══ Big stat trio (HTN-style) ═══ */}
      <motion.div variants={itemVariants} className="grid grid-cols-3 gap-4">
        {[
          { icon: Server, value: String(servers.length), label: 'Total Servers', tint: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/20' },
          { icon: Zap, value: String(runningServers), label: 'Running Now', tint: 'bg-purple-600/20 text-purple-400 border-purple-500/20' },
          { icon: Package, value: totalResources.toLocaleString(), label: 'Total Resources', tint: 'bg-amber-600/20 text-amber-400 border-amber-500/20' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-overlay-6 bg-surface-900/40 p-5">
            <div className={`w-11 h-11 rounded-xl border flex items-center justify-center mb-4 ${s.tint}`}>
              <s.icon size={19} />
            </div>
            <p className="text-3xl font-extrabold text-surface-100 tracking-tight">{s.value}</p>
            <p className="text-xs text-surface-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </motion.div>

      {/* ═══ Shortcut cards (HTN-style) ═══ */}
      <motion.div variants={itemVariants} className="grid grid-cols-3 gap-4">
        {[
          { icon: Package, title: 'Store', sub: 'Browse scripts, resources & exclusives', path: '/marketplace', tint: 'bg-blue-600/20 text-blue-400 border-blue-500/20' },
          { icon: Server, title: 'My Servers', sub: `${servers.length} server${servers.length !== 1 ? 's' : ''} ready`, path: '/servers', tint: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/20' },
          { icon: Sparkles, title: 'Get Started', sub: 'Create a new FiveM server', path: '/create', tint: 'bg-purple-600/20 text-purple-400 border-purple-500/20' },
        ].map((c) => (
          <button key={c.title} onClick={() => navigate(c.path)}
            className="group flex items-center gap-4 rounded-2xl border border-overlay-6 bg-surface-900/40 hover:bg-overlay-4 hover:border-overlay-10 p-5 text-left transition-all">
            <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${c.tint}`}>
              <c.icon size={19} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-surface-100">{c.title}</p>
              <p className="text-xs text-surface-500 truncate">{c.sub}</p>
            </div>
            <ArrowRight size={15} className="text-surface-600 group-hover:text-surface-300 group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>
        ))}
      </motion.div>

      {/* ═══ Latest News & Updates (GitHub releases) ═══ */}
      {news.length > 0 && (
        <motion.div variants={itemVariants} className="space-y-3">
          <h2 className="text-lg font-bold text-surface-100">Latest News &amp; Updates</h2>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {news.map((n) => (
              <button key={n.tag} onClick={() => window.electronAPI?.openExternal(n.url)}
                className="group relative overflow-hidden rounded-2xl border border-overlay-6 bg-gradient-to-br from-[#1a0b10] to-surface-950 hover:border-overlay-10 p-4 text-left transition-all">
                <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-red-600/10 blur-2xl group-hover:bg-red-600/20 transition-all" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 font-bold">changelog</span>
                    <span className="text-[10px] text-surface-500">{n.date}</span>
                  </div>
                  <p className="text-sm font-bold text-surface-100 leading-snug mb-1.5 line-clamp-2">{n.name}</p>
                  <p className="text-[11px] text-surface-500 line-clamp-2">{n.body}…</p>
                </div>
              </button>
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
