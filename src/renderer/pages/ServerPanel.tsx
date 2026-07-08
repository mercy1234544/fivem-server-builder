// HTN-Panel-style server management page: click a server on the Dashboard and
// land here. Left rail lists your servers; the main area has a header with
// Start/Stop/Restart/Open Folder and tabs: Overview & Console, File Manager,
// Resources, Backups. Everything runs over the existing IPC surface.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Server, Play, Square, RotateCw, FolderOpen, Trash2, Settings as SettingsIcon,
  Terminal, Folder, FolderPlus, FilePlus, File as FileIcon, ChevronRight, ChevronDown,
  Package, Archive, Loader2, Search, Save, Upload, RefreshCw, ArrowDown,
  ToggleLeft, ToggleRight, AlertTriangle, Globe, X, Download, HardDrive,
} from 'lucide-react';
import { useAppStore, Server as ServerType } from '../stores/useAppStore';

// ── Console line colouring (compact version of ServerConsole's parser) ───────
function lineClass(l: string): string {
  const s = l.toLowerCase();
  if (l.startsWith('>') || l.startsWith('---')) return 'text-primary-400 font-semibold';
  if (s.includes('error') || s.includes('failed') || s.includes("couldn't start")) return 'text-red-400';
  if (s.includes('warn') || s.includes('not loaded')) return 'text-amber-400';
  if (s.includes('started resource') || s.includes('authenticated') || s.includes('succeeded')) return 'text-emerald-400';
  return 'text-surface-300';
}

// ── File tree types ───────────────────────────────────────────────────────────
interface FileEntry {
  name: string; path: string; type: 'directory' | 'file';
  size: number; modified: string; extension: string;
}
interface TreeNode extends FileEntry { children?: TreeNode[]; expanded?: boolean; loaded?: boolean; }

const TEXT_EXTS = new Set([
  '.lua', '.js', '.ts', '.json', '.cfg', '.txt', '.md', '.xml', '.yml', '.yaml',
  '.html', '.css', '.sql', '.ini', '.log', '.meta', '.toml', '.env', '.bat', '.sh', '',
]);
const MAX_EDIT_SIZE = 2 * 1024 * 1024; // 2 MB

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

type Tab = 'overview' | 'files' | 'resources' | 'backups';

export default function ServerPanel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { servers, setServers, setActiveServer, updateServer, removeServer, logAction } = useAppStore();
  const [tab, setTab] = useState<Tab>('overview');
  const server = servers.find((s) => s.id === id) || null;

  // Keep backend as source of truth on mount.
  useEffect(() => {
    window.electronAPI?.server.getAll().then(setServers).catch(() => {});
  }, []);

  useEffect(() => { if (id) setActiveServer(id); }, [id]);

  // Live status updates.
  useEffect(() => {
    if (!window.electronAPI?.onServerStatusChange) return;
    return window.electronAPI.onServerStatusChange((d) => updateServer(d.serverId, { status: d.status as any }));
  }, []);

  // ── Console state (subscribes for the OPEN server only) ─────────────────────
  const [lines, setLines] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLines([]);
    if (!window.electronAPI || !id) return;
    return window.electronAPI.onServerConsole((d) => {
      if (d.serverId !== id) return;
      const raw = d.line.split('\n').filter((l) => l.trim());
      setLines((prev) => {
        const next = [...prev, ...raw];
        return next.length > 4000 ? next.slice(-3000) : next;
      });
    });
  }, [id]);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, autoScroll]);

  const [busy, setBusy] = useState<'start' | 'stop' | 'restart' | null>(null);

  const doStart = async () => {
    if (!server || busy) return;
    setBusy('start');
    setLines((p) => [...p, '> Starting server...']);
    try {
      const r = await window.electronAPI.server.start(server.id);
      if (r.success) { updateServer(server.id, { status: 'running' }); logAction('Server Started', server.name, 'success'); }
      else { toast.error(r.error || 'Failed to start'); setLines((p) => [...p, `> ERROR: ${r.error}`]); }
    } catch (e: any) { toast.error(e.message); }
    setBusy(null);
  };

  const doStop = async () => {
    if (!server || busy) return;
    setBusy('stop');
    setLines((p) => [...p, '> Stopping server...']);
    try {
      await window.electronAPI.server.stop(server.id);
      updateServer(server.id, { status: 'stopped' });
      logAction('Server Stopped', server.name, 'info');
    } catch (e: any) { toast.error(e.message); }
    setBusy(null);
  };

  const doRestart = async () => {
    if (!server || busy) return;
    setBusy('restart');
    setLines((p) => [...p, '> Restarting server...']);
    try {
      if (server.status === 'running') {
        await window.electronAPI.server.stop(server.id);
        await new Promise((r) => setTimeout(r, 1500));
      }
      const r = await window.electronAPI.server.start(server.id);
      if (r.success) { updateServer(server.id, { status: 'running' }); toast.success('Server restarted'); }
      else toast.error(r.error || 'Failed to restart');
    } catch (e: any) { toast.error(e.message); }
    setBusy(null);
  };

  // ── Delete modal ─────────────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false);
  const doDelete = async () => {
    if (!server) return;
    try {
      await window.electronAPI.server.delete(server.id);
      removeServer(server.id);
      toast.success(`${server.name} removed`);
      navigate('/');
    } catch (e: any) { toast.error(e.message); }
  };

  if (!server) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Server size={44} className="text-surface-600 mb-3" />
        <p className="text-surface-400 text-sm mb-4">Server not found</p>
        <button onClick={() => navigate('/')} className="btn-primary text-sm">Back to Dashboard</button>
      </div>
    );
  }

  const running = server.status === 'running';

  return (
    <div className="h-full flex overflow-hidden">
      {/* ═══ Left rail — YOUR SERVERS ═══ */}
      <div className="w-56 shrink-0 border-r border-overlay-6 bg-surface-950/40 flex flex-col">
        <p className="px-4 pt-4 pb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-surface-500">Your Servers</p>
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {servers.map((s) => (
            <button
              key={s.id}
              onClick={() => navigate(`/server/${s.id}`)}
              className={`w-full flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all ${
                s.id === server.id
                  ? 'bg-primary-500/10 border-primary-500/30'
                  : 'border-transparent hover:bg-overlay-4 hover:border-overlay-6'
              }`}
            >
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500/20 to-primary-600/5 border border-primary-500/15 flex items-center justify-center shrink-0">
                <Server size={15} className="text-primary-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-surface-100 truncate">{s.name}</p>
                <p className="text-[10px] text-surface-500 truncate">FiveM Server</p>
              </div>
              <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-bold ${
                s.status === 'running' ? 'bg-emerald-500/15 text-emerald-400' :
                s.status === 'error' ? 'bg-red-500/15 text-red-400' : 'bg-overlay-6 text-surface-500'
              }`}>
                {s.status === 'running' ? 'running' : s.status === 'error' ? 'error' : 'stopped'}
              </span>
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-overlay-6">
          <button onClick={() => navigate('/create')} className="w-full btn-primary text-xs py-2">+ New Server</button>
        </div>
      </div>

      {/* ═══ Main panel ═══ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 px-6 pt-5 pb-0 border-b border-overlay-6">
          <div className="flex items-start justify-between gap-4 pb-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500/25 to-purple-600/10 border border-primary-500/20 flex items-center justify-center shrink-0">
                <Server size={24} className="text-primary-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-extrabold text-surface-100 truncate">{server.name}</h1>
                <p className="text-xs text-surface-500">FiveM Server &middot; {server.framework}</p>
                <p className="text-[10px] text-surface-600 font-mono truncate">{server.installPath}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {running ? (
                <button onClick={doStop} disabled={!!busy}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-overlay-6 text-surface-200 hover:bg-overlay-10 border border-overlay-8 transition-all disabled:opacity-50">
                  {busy === 'stop' ? <Loader2 size={13} className="animate-spin" /> : <Square size={13} />} Stop
                </button>
              ) : (
                <button onClick={doStart} disabled={!!busy}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/25 transition-all disabled:opacity-50">
                  {busy === 'start' ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Start
                </button>
              )}
              <button onClick={doRestart} disabled={!!busy}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-primary-600 text-white hover:bg-primary-500 transition-all disabled:opacity-50">
                {busy === 'restart' ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />} Restart
              </button>
              <button onClick={() => window.electronAPI.openPath(server.installPath)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-overlay-6 text-surface-200 hover:bg-overlay-10 border border-overlay-8 transition-all">
                <FolderOpen size={13} /> Open Folder
              </button>
              <button
                onClick={() => {
                  window.electronAPI.txAdmin.open(server.installPath)
                    .then((r) => toast.success(`txAdmin: ${r.url}`))
                    .catch(() => toast.error('Failed to open txAdmin'));
                }}
                className="p-2 rounded-xl text-surface-400 hover:text-primary-300 hover:bg-overlay-6 border border-transparent hover:border-overlay-8 transition-all" title="Open txAdmin">
                <Globe size={15} />
              </button>
              <button onClick={() => setConfirmDelete(true)}
                className="p-2 rounded-xl text-surface-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all" title="Delete server">
                <Trash2 size={15} />
              </button>
              <button onClick={() => navigate('/editor')}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-overlay-6 text-surface-200 hover:bg-overlay-10 border border-overlay-8 transition-all">
                <SettingsIcon size={13} /> Settings
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1">
            {([
              { id: 'overview', label: 'Overview & Console', icon: Terminal },
              { id: 'files', label: 'File Manager', icon: Folder },
              { id: 'resources', label: 'Resources', icon: Package },
              { id: 'backups', label: 'Backups', icon: Archive },
            ] as { id: Tab; label: string; icon: any }[]).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-all ${
                  tab === t.id
                    ? 'border-primary-500 text-primary-300'
                    : 'border-transparent text-surface-500 hover:text-surface-200'
                }`}
              >
                <t.icon size={13} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {tab === 'overview' && (
            <OverviewTab
              server={server} lines={lines} autoScroll={autoScroll} setAutoScroll={setAutoScroll}
              bottomRef={bottomRef} consoleRef={consoleRef} onClear={() => setLines([])}
            />
          )}
          {tab === 'files' && <FileManagerTab server={server} />}
          {tab === 'resources' && <ResourcesTab server={server} />}
          {tab === 'backups' && <BackupsTab server={server} updateServer={updateServer} />}
        </div>
      </div>

      {/* Delete confirm */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md"
            onClick={() => setConfirmDelete(false)}>
            <motion.div initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 16 }}
              onClick={(e) => e.stopPropagation()} className="glass-panel p-6 max-w-sm w-full mx-4">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                  <AlertTriangle size={18} className="text-red-400" />
                </div>
                <div>
                  <h3 className="font-bold text-surface-100">Remove server?</h3>
                  <p className="text-xs text-surface-400 mt-1">
                    Removes <span className="font-semibold text-surface-200">{server.name}</span> from the builder.
                    Files on disk are kept.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)} className="flex-1 btn-secondary text-sm">Cancel</button>
                <button onClick={doDelete} className="flex-1 btn-danger text-sm">Remove</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════ Overview & Console ═══════════════════ */

function OverviewTab({ server, lines, autoScroll, setAutoScroll, bottomRef, consoleRef, onClear }: {
  server: ServerType; lines: string[]; autoScroll: boolean; setAutoScroll: (v: boolean) => void;
  bottomRef: React.RefObject<HTMLDivElement>; consoleRef: React.RefObject<HTMLDivElement>; onClear: () => void;
}) {
  const handleScroll = () => {
    const el = consoleRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
  };

  const stats = [
    { label: 'Status', value: server.status === 'running' ? 'Running' : server.status === 'error' ? 'Error' : 'Stopped',
      color: server.status === 'running' ? 'text-emerald-400' : server.status === 'error' ? 'text-red-400' : 'text-surface-300' },
    { label: 'Framework', value: server.framework || 'custom', color: 'text-surface-100' },
    { label: 'Artifacts', value: server.artifactVersion || 'unknown', color: 'text-surface-100' },
    { label: 'Resources', value: String(server.resourceCount ?? 0), color: 'text-surface-100' },
  ];

  return (
    <div className="h-full flex flex-col p-5 gap-4 overflow-hidden">
      <div className="grid grid-cols-4 gap-3 shrink-0">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-overlay-6 bg-overlay-2 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-0.5">{s.label}</p>
            <p className={`text-sm font-bold truncate ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between shrink-0">
        <p className="text-xs font-semibold text-surface-400 flex items-center gap-2"><Terminal size={13} /> Live Console</p>
        <div className="flex items-center gap-2">
          {!autoScroll && (
            <button onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
              className="p-1.5 rounded-lg text-primary-400 hover:bg-overlay-6" title="Scroll to bottom"><ArrowDown size={13} /></button>
          )}
          <button onClick={onClear} className="p-1.5 rounded-lg text-surface-500 hover:text-surface-200 hover:bg-overlay-6" title="Clear">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div ref={consoleRef} onScroll={handleScroll}
        className="flex-1 min-h-0 bg-[#0d1117] rounded-xl border border-overlay-6 p-4 overflow-y-auto font-mono text-[11px] leading-[1.65]">
        {lines.length === 0 ? (
          <div className="text-surface-600 text-center py-12">
            {server.status === 'running' ? 'Waiting for output…' : 'Start the server to see console output'}
          </div>
        ) : lines.map((l, i) => (
          <div key={i} className={`${lineClass(l)} break-words hover:bg-white/[0.02] -mx-2 px-2 rounded`}>{l}</div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/* ═══════════════════ File Manager ═══════════════════ */

function FileManagerTab({ server }: { server: ServerType }) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<TreeNode | null>(null);
  const [content, setContent] = useState<string>('');
  const [origContent, setOrigContent] = useState<string>('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [binaryMsg, setBinaryMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Directory the New File / New Folder / Upload actions target.
  const [targetDir, setTargetDir] = useState<string>(server.installPath);

  const loadDir = useCallback(async (dirPath: string): Promise<TreeNode[]> => {
    try {
      const entries: FileEntry[] = await window.electronAPI.file.readDir(dirPath);
      return entries.map((e) => ({ ...e, children: undefined, expanded: false, loaded: false }));
    } catch { return []; }
  }, []);

  useEffect(() => {
    setSelected(null); setContent(''); setOrigContent(''); setBinaryMsg(null);
    setTargetDir(server.installPath);
    loadDir(server.installPath).then(setTree);
  }, [server.id]);

  const refreshTree = async () => {
    // Re-load root and re-expand previously expanded dirs one level deep.
    setTree(await loadDir(server.installPath));
  };

  const toggleDir = async (node: TreeNode) => {
    const update = (nodes: TreeNode[]): TreeNode[] => nodes.map((n) => {
      if (n.path === node.path) {
        return { ...n, expanded: !n.expanded, loaded: true, children: n.loaded ? n.children : undefined };
      }
      if (n.children) return { ...n, children: update(n.children) };
      return n;
    });
    setTargetDir(node.path);
    if (!node.loaded) {
      const children = await loadDir(node.path);
      const inject = (nodes: TreeNode[]): TreeNode[] => nodes.map((n) => {
        if (n.path === node.path) return { ...n, expanded: true, loaded: true, children };
        if (n.children) return { ...n, children: inject(n.children) };
        return n;
      });
      setTree((t) => inject(t));
    } else {
      setTree((t) => update(t));
    }
  };

  const openFile = async (node: TreeNode) => {
    setSelected(node);
    setBinaryMsg(null);
    setContent(''); setOrigContent('');
    const ext = (node.extension || '').toLowerCase();
    if (!TEXT_EXTS.has(ext)) { setBinaryMsg(`Preview not available for ${ext || 'this'} files.`); return; }
    if (node.size > MAX_EDIT_SIZE) { setBinaryMsg(`File is too large to edit here (${fmtSize(node.size)}).`); return; }
    setLoadingFile(true);
    try {
      const r = await window.electronAPI.file.readFile(node.path);
      if (r) { setContent(r.content); setOrigContent(r.content); }
      else setBinaryMsg('Could not read file.');
    } catch { setBinaryMsg('Could not read file.'); }
    setLoadingFile(false);
  };

  const saveFile = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const ok = await window.electronAPI.file.writeFile(selected.path, content);
      if (ok) { setOrigContent(content); toast.success(`Saved ${selected.name}`); }
      else toast.error('Save failed');
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  // Inline "new item" input (window.prompt is not supported in Electron).
  const [naming, setNaming] = useState<{ kind: 'file' | 'folder'; value: string } | null>(null);

  const commitNewItem = async () => {
    if (!naming) return;
    const name = naming.value.trim();
    setNaming(null);
    if (!name) return;
    if (/[\\/:*?"<>|]/.test(name)) { toast.error('Invalid name'); return; }
    const full = `${targetDir}\\${name}`;
    try {
      if (naming.kind === 'folder') await window.electronAPI.file.createDir(full);
      else await window.electronAPI.file.writeFile(full, '');
      toast.success(`Created ${name}`);
      await refreshTree();
    } catch (e: any) { toast.error(e.message); }
  };

  const deleteSelected = async () => {
    if (!selected) return;
    if (!window.confirm(`Delete ${selected.name}? This cannot be undone.`)) return;
    try {
      await window.electronAPI.file.delete(selected.path);
      toast.success(`Deleted ${selected.name}`);
      setSelected(null); setContent(''); setOrigContent(''); setBinaryMsg(null);
      await refreshTree();
    } catch (e: any) { toast.error(e.message); }
  };

  const uploadFiles = async () => {
    setUploading(true);
    try {
      const src = await window.electronAPI.openFile();
      if (src) {
        const b64 = await window.electronAPI.livery.readBinary(src);
        const fname = src.split(/[\\/]/).pop()!;
        const ok = await window.electronAPI.livery.writeFile(`${targetDir}\\${fname}`, b64);
        if (ok) { toast.success(`Uploaded ${fname}`); await refreshTree(); }
        else toast.error('Upload failed');
      }
    } catch (e: any) { toast.error(e.message || 'Upload failed'); }
    setUploading(false);
  };

  const createBackup = async () => {
    setBackingUp(true);
    try {
      await window.electronAPI.backup.create(server.id, { type: 'full' });
      toast.success('Backup created');
    } catch (e: any) { toast.error(e.message || 'Backup failed'); }
    setBackingUp(false);
  };

  const filterTree = (nodes: TreeNode[]): TreeNode[] => {
    if (!search.trim()) return nodes;
    const q = search.toLowerCase();
    return nodes
      .map((n) => {
        const kids = n.children ? filterTree(n.children) : undefined;
        const match = n.name.toLowerCase().includes(q) || (kids && kids.length > 0);
        return match ? { ...n, children: kids, expanded: true } : null;
      })
      .filter(Boolean) as TreeNode[];
  };

  const dirty = selected && content !== origContent;

  const renderNode = (node: TreeNode, depth: number) => (
    <div key={node.path}>
      <button
        onClick={() => (node.type === 'directory' ? toggleDir(node) : openFile(node))}
        className={`w-full flex items-center gap-1.5 px-2 py-[5px] rounded-lg text-left text-xs transition-colors ${
          selected?.path === node.path ? 'bg-primary-500/15 text-primary-200' : 'text-surface-300 hover:bg-overlay-4'
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {node.type === 'directory' ? (
          <>
            {node.expanded ? <ChevronDown size={12} className="shrink-0 text-surface-500" /> : <ChevronRight size={12} className="shrink-0 text-surface-500" />}
            <Folder size={13} className="shrink-0 text-sky-400" />
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <FileIcon size={13} className="shrink-0 text-surface-500" />
          </>
        )}
        <span className="truncate flex-1">{node.name}</span>
        {node.type === 'file' && <span className="text-[9px] text-surface-600 shrink-0">{fmtSize(node.size)}</span>}
      </button>
      {node.expanded && node.children && node.children.map((c) => renderNode(c, depth + 1))}
    </div>
  );

  return (
    <div className="h-full flex overflow-hidden">
      {/* Tree column */}
      <div className="w-72 shrink-0 border-r border-overlay-6 flex flex-col">
        <div className="p-3 space-y-2 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files…"
              className="w-full bg-overlay-3 border border-overlay-6 rounded-lg pl-8 pr-3 py-1.5 text-xs text-surface-200 placeholder-surface-600 focus:outline-none focus:border-primary-500/40"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setNaming({ kind: 'file', value: '' })} className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold bg-overlay-4 text-surface-300 hover:bg-overlay-8 border border-overlay-6 transition-all">
              <FilePlus size={12} /> New File
            </button>
            <button onClick={() => setNaming({ kind: 'folder', value: '' })} className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold bg-overlay-4 text-surface-300 hover:bg-overlay-8 border border-overlay-6 transition-all">
              <FolderPlus size={12} /> New Folder
            </button>
          </div>
          {naming && (
            <div className="flex items-center gap-1.5">
              {naming.kind === 'folder' ? <Folder size={12} className="text-sky-400 shrink-0" /> : <FileIcon size={12} className="text-surface-400 shrink-0" />}
              <input
                autoFocus
                value={naming.value}
                onChange={(e) => setNaming({ ...naming, value: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') commitNewItem(); if (e.key === 'Escape') setNaming(null); }}
                onBlur={() => setNaming(null)}
                placeholder={`New ${naming.kind} name… (Enter)`}
                className="flex-1 bg-overlay-3 border border-primary-500/40 rounded-lg px-2 py-1 text-[11px] text-surface-100 placeholder-surface-600 focus:outline-none"
              />
            </div>
          )}
          <p className="text-[9px] text-surface-600 font-mono truncate" title={targetDir}>{targetDir}</p>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {filterTree(tree).map((n) => renderNode(n, 0))}
          {tree.length === 0 && <p className="text-xs text-surface-600 text-center py-8">Empty folder</p>}
        </div>
        <div className="p-3 border-t border-overlay-6 space-y-2 shrink-0">
          <button onClick={uploadFiles} disabled={uploading}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold bg-primary-600 text-white hover:bg-primary-500 transition-all disabled:opacity-50">
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Upload File
          </button>
          <button onClick={createBackup} disabled={backingUp}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold bg-overlay-6 text-surface-200 hover:bg-overlay-10 border border-overlay-8 transition-all disabled:opacity-50">
            {backingUp ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />} Create Backup
          </button>
        </div>
      </div>

      {/* Viewer column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <Folder size={40} className="text-surface-700 mb-3" />
            <p className="text-sm text-surface-500">Select a file to view or edit</p>
            <p className="text-xs text-surface-600 mt-1">Clicking a folder sets the target for New File / Upload</p>
          </div>
        ) : (
          <>
            <div className="shrink-0 px-5 py-3 border-b border-overlay-6 flex items-center gap-3">
              <FileIcon size={15} className="text-primary-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-surface-100 truncate">{selected.name}</p>
                <p className="text-[10px] text-surface-500 font-mono truncate">
                  {selected.path.replace(server.installPath, '')} &middot; {fmtSize(selected.size)} &middot; {new Date(selected.modified).toLocaleString()}
                </p>
              </div>
              {dirty && (
                <button onClick={saveFile} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/25 transition-all">
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                </button>
              )}
              <button onClick={deleteSelected}
                className="p-1.5 rounded-lg text-surface-500 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Delete file">
                <Trash2 size={13} />
              </button>
            </div>
            <div className="flex-1 min-h-0 p-3">
              {loadingFile ? (
                <div className="h-full flex items-center justify-center"><Loader2 size={22} className="animate-spin text-primary-400" /></div>
              ) : binaryMsg ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <HardDrive size={32} className="text-surface-700 mb-3" />
                  <p className="text-sm text-surface-500">{binaryMsg}</p>
                </div>
              ) : (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  spellCheck={false}
                  className="w-full h-full bg-[#0d1117] border border-overlay-6 rounded-xl p-4 font-mono text-[11.5px] leading-[1.6] text-surface-200 resize-none focus:outline-none focus:border-primary-500/40"
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════ Resources ═══════════════════ */

interface Resource {
  name: string; path: string; version: string | null; author: string | null;
  enabled: boolean; category: string; issues: string[];
}

function ResourcesTab({ server }: { server: ServerType }) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const scan = async () => {
    setLoading(true);
    try { setResources(await window.electronAPI.resource.scan(server.installPath)); }
    catch { toast.error('Failed to scan resources'); }
    setLoading(false);
  };

  useEffect(() => { scan(); }, [server.id]);

  const toggle = async (r: Resource) => {
    try { await window.electronAPI.resource.toggle(server.installPath, r.name, !r.enabled); } catch {}
    setResources((rs) => rs.map((x) => x.name === r.name ? { ...x, enabled: !x.enabled } : x));
    toast.success(`${r.name} ${r.enabled ? 'disabled' : 'enabled'}`);
  };

  const filtered = resources.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
  const enabled = resources.filter((r) => r.enabled).length;

  return (
    <div className="h-full flex flex-col p-5 gap-3 overflow-hidden">
      <div className="flex items-center gap-3 shrink-0">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search resources…"
            className="w-full bg-overlay-3 border border-overlay-6 rounded-xl pl-9 pr-3 py-2 text-sm text-surface-200 placeholder-surface-600 focus:outline-none focus:border-primary-500/40" />
        </div>
        <span className="text-xs text-surface-500 shrink-0">{enabled}/{resources.length} enabled</span>
        <button onClick={scan} disabled={loading} className="btn-secondary flex items-center gap-2 text-xs py-2">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Rescan
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
        {loading ? (
          <div className="flex flex-col items-center py-16"><Loader2 size={26} className="animate-spin text-primary-400 mb-2" /><p className="text-xs text-surface-500">Scanning…</p></div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-surface-500 py-12">{search ? 'No matches' : 'No resources found'}</p>
        ) : filtered.map((r) => (
          <div key={r.name} className={`flex items-center gap-3 px-3 py-2 rounded-xl border border-overlay-4 bg-overlay-2 ${!r.enabled ? 'opacity-55' : ''}`}>
            <button onClick={() => toggle(r)} className="shrink-0 hover:scale-110 transition-transform">
              {r.enabled ? <ToggleRight size={22} className="text-emerald-400" /> : <ToggleLeft size={22} className="text-surface-500" />}
            </button>
            <span className="text-sm text-surface-100 font-medium truncate">{r.name}</span>
            {r.version && <span className="text-[10px] px-1.5 py-0.5 bg-overlay-6 rounded text-surface-400 shrink-0">v{r.version}</span>}
            <span className="text-[10px] px-1.5 py-0.5 bg-overlay-4 rounded text-surface-500 shrink-0">{r.category}</span>
            {r.issues?.length > 0 && <AlertTriangle size={13} className="text-amber-400 shrink-0" />}
            <span className="flex-1" />
            {r.author && <span className="text-[10px] text-surface-600 shrink-0 truncate max-w-[140px]">{r.author}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════ Backups ═══════════════════ */

function BackupsTab({ server, updateServer }: { server: ServerType; updateServer: (id: string, d: Partial<ServerType>) => void }) {
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setBackups(await window.electronAPI.backup.list(server.id)); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, [server.id]);

  const create = async () => {
    setWorking('create');
    try {
      await window.electronAPI.backup.create(server.id, { type: 'full' });
      updateServer(server.id, { lastBackup: new Date().toISOString() });
      toast.success('Backup created');
      await load();
    } catch (e: any) { toast.error(e.message || 'Backup failed'); }
    setWorking(null);
  };

  const restore = async (b: any) => {
    if (!window.confirm(`Restore "${b.name}"? Current files will be overwritten.`)) return;
    setWorking(b.id);
    try {
      const ok = await window.electronAPI.backup.restore(b.id);
      ok ? toast.success('Backup restored') : toast.error('Restore failed');
    } catch (e: any) { toast.error(e.message); }
    setWorking(null);
  };

  const remove = async (b: any) => {
    if (!window.confirm(`Delete backup "${b.name}"?`)) return;
    setWorking(b.id);
    try { await window.electronAPI.backup.delete(b.id); await load(); toast.success('Backup deleted'); }
    catch (e: any) { toast.error(e.message); }
    setWorking(null);
  };

  return (
    <div className="h-full flex flex-col p-5 gap-3 overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <p className="text-xs text-surface-500">{backups.length} backup{backups.length !== 1 ? 's' : ''} for this server</p>
        <button onClick={create} disabled={working === 'create'} className="btn-primary flex items-center gap-2 text-xs py-2">
          {working === 'create' ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />} Create Backup
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
        {loading ? (
          <div className="flex justify-center py-14"><Loader2 size={24} className="animate-spin text-primary-400" /></div>
        ) : backups.length === 0 ? (
          <div className="flex flex-col items-center py-14 text-center">
            <Archive size={34} className="text-surface-700 mb-3" />
            <p className="text-sm text-surface-500">No backups yet</p>
            <p className="text-xs text-surface-600 mt-1">Create one before making big changes</p>
          </div>
        ) : backups.map((b) => (
          <div key={b.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-overlay-4 bg-overlay-2">
            <Archive size={16} className="text-amber-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-surface-100 truncate">{b.name}</p>
              <p className="text-[10px] text-surface-500">
                {fmtSize(b.size || 0)}{b.createdAt ? ` · ${new Date(b.createdAt).toLocaleString()}` : ''}
              </p>
            </div>
            <button onClick={() => restore(b)} disabled={working === b.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-overlay-6 text-surface-200 hover:bg-overlay-10 border border-overlay-8 transition-all disabled:opacity-50">
              {working === b.id ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />} Restore
            </button>
            <button onClick={() => remove(b)} disabled={working === b.id}
              className="p-1.5 rounded-lg text-surface-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
