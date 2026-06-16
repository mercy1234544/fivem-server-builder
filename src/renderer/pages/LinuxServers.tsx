import React, { Component, useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Server, Wifi, WifiOff, Play, Square, RefreshCw, Terminal, Package,
  FileCode, Cpu, HardDrive, Loader2, ChevronRight, Eye, EyeOff, Globe,
  Activity, AlertTriangle, CheckCircle2, AlertCircle, Info, Send,
  Download, FolderOpen, Save, Wrench, HeartPulse, RotateCcw,
} from 'lucide-react';
import { BridgeApi, loadBridgeConfig, saveBridgeConfig, parsePm2Status } from '../services/bridgeApi';
import type { SystemStats } from '../services/bridgeApi';

// ── Error Boundary ────────────────────────────────────────────────────────────
class ErrBoundary extends Component<{ children: React.ReactNode }, { err: string | null }> {
  state = { err: null };
  static getDerivedStateFromError(e: Error) { return { err: e.message }; }
  render() {
    if (this.state.err) return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertTriangle size={40} className="text-red-400" />
        <p className="text-surface-200 font-semibold">Page crashed</p>
        <p className="text-xs text-surface-500 max-w-sm break-all">{this.state.err}</p>
        <button onClick={() => this.setState({ err: null })} className="text-xs btn-secondary px-4 py-2 mt-2">
          Try Again
        </button>
      </div>
    );
    return this.props.children;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface LinuxServer {
  name: string; framework: string; processName: string;
  resourcesPath: string; cfgPath: string;
  status: 'online' | 'stopped' | 'error' | 'unknown';
}

const KNOWN_SERVERS: Omit<LinuxServer, 'status'>[] = [
  { name: 'QBCore Server', framework: 'QBCore', processName: 'fxserver',
    resourcesPath: '/home/harperlinux/fxserver/server/txData/QBCore_8ADB3B.base/resources',
    cfgPath: '/home/harperlinux/fxserver/server/txData/QBCore_8ADB3B.base/server.cfg' },
  { name: 'Qbox Server', framework: 'Qbox', processName: 'qboxfxserver',
    resourcesPath: '/home/harperlinux/qboxfxserver/server/txData/Qbox_F5A584.base/resources',
    cfgPath: '/home/harperlinux/qboxfxserver/server/txData/Qbox_F5A584.base/server.cfg' },
];

const FW_BADGE: Record<string, string> = {
  QBCore: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  Qbox:   'bg-purple-500/20 text-purple-300 border border-purple-500/30',
  ESX:    'bg-green-500/20 text-green-300 border border-green-500/30',
};

const SC = {
  online:  { dot: 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]', text: 'Running',  cls: 'text-green-400' },
  stopped: { dot: 'bg-surface-600',                                       text: 'Stopped',  cls: 'text-surface-500' },
  error:   { dot: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]',     text: 'Error',    cls: 'text-red-400' },
  unknown: { dot: 'bg-amber-500/60',                                       text: 'Unknown', cls: 'text-amber-400/70' },
} as const;

type Tab = 'overview' | 'console' | 'resources' | 'config' | 'install' | 'health';

function fmt(n: any, dec = 1) {
  const v = Number(n);
  return isFinite(v) ? v.toFixed(dec) : '—';
}

function clamp(n: any, min = 0, max = 100) {
  const v = Number(n);
  return isFinite(v) ? Math.min(Math.max(v, min), max) : 0;
}

// ── Health checks from server.cfg text ───────────────────────────────────────
interface HealthIssue { severity: 'error' | 'warning' | 'info'; message: string; suggestion: string }

function analyzeConfig(cfg: string, framework: string): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const lines = cfg.split('\n').map(l => l.trim().toLowerCase());
  const has = (s: string) => lines.some(l => l.includes(s));

  if (!has('sv_licensekey') && !has('sv_license')) {
    issues.push({ severity: 'error', message: 'No license key set', suggestion: 'Add: sv_licenseKey "your_key_here"' });
  }
  if (!has('mysql_connection_string') && !has('oxmysql') && framework !== 'Unknown') {
    issues.push({ severity: 'warning', message: 'No MySQL connection string', suggestion: 'Add: set mysql_connection_string "mysql://root@localhost/dbname"' });
  }
  if (!has('onesync')) {
    issues.push({ severity: 'warning', message: 'OneSync not configured', suggestion: 'Add: set onesync on' });
  }
  if (!has('sv_maxclients')) {
    issues.push({ severity: 'info', message: 'sv_maxClients not set', suggestion: 'Add: sv_maxClients 64' });
  }
  if (framework === 'Qbox' || framework === 'QBCore') {
    if (!has('ox_lib') && !has('ensure ox_lib')) {
      issues.push({ severity: 'warning', message: 'ox_lib not found in config', suggestion: 'Add: ensure ox_lib before your framework' });
    }
  }
  if (issues.length === 0) {
    issues.push({ severity: 'info', message: 'No obvious issues found', suggestion: 'Config looks OK' });
  }
  return issues;
}

// ── Main Component ────────────────────────────────────────────────────────────
function LinuxServersInner() {
  const saved = loadBridgeConfig();
  const [host, setHost]     = useState(saved.host);
  const [apiKey, setApiKey] = useState(saved.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [connected, setConnected]   = useState(false);
  const [connecting, setConnecting] = useState(false);

  const bridgeRef   = useRef<BridgeApi | null>(null);
  const wsRef       = useRef<WebSocket | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logsEndRef  = useRef<HTMLDivElement>(null);

  const [servers, setServers] = useState<LinuxServer[]>(
    KNOWN_SERVERS.map(s => ({ ...s, status: 'unknown' as const }))
  );
  const [selected, setSelected] = useState<LinuxServer | null>(null);
  const [stats, setStats]       = useState<SystemStats | null>(null);
  const [wsState, setWsState]   = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');

  const [tab, setTab]   = useState<Tab>('overview');
  const [logs, setLogs] = useState<string[]>([]);
  const [cmd, setCmd]   = useState('');
  const [sendingCmd, setSendingCmd] = useState(false);

  const [resources, setResources]             = useState<string[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [resourceAction, setResourceAction]   = useState<string | null>(null);
  const [resourceFilter, setResourceFilter]   = useState('');

  const [cfgContent, setCfgContent]   = useState('');
  const [cfgEdited, setCfgEdited]     = useState('');
  const [loadingCfg, setLoadingCfg]   = useState(false);
  const [savingCfg, setSavingCfg]     = useState(false);

  const [installUrl, setInstallUrl]     = useState('');
  const [installName, setInstallName]   = useState('');
  const [installing, setInstalling]     = useState(false);
  const [installOutput, setInstallOutput] = useState('');

  const [healthIssues, setHealthIssues] = useState<HealthIssue[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Auto-scroll console
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  // Cleanup
  useEffect(() => () => {
    wsRef.current?.close();
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const addLog = useCallback((line: unknown) => {
    setLogs(prev => [...prev.slice(-999), String(line)]);
  }, []);

  // ── PM2 status refresh ───────────────────────────────────────────────────
  const refreshStatuses = useCallback(async (api: BridgeApi) => {
    try {
      const procs = await api.pm2List();
      setServers(prev => prev.map(srv => {
        // Try exact name match, then case-insensitive, then partial
        const proc = procs.find((p: any) =>
          p?.name === srv.processName ||
          p?.pm2_env?.name === srv.processName ||
          String(p?.name ?? '').toLowerCase() === srv.processName.toLowerCase()
        );
        const status = proc ? parsePm2Status(proc) : 'unknown';
        return { ...srv, status };
      }));
    } catch {}
  }, []);

  // ── WebSocket ────────────────────────────────────────────────────────────
  const openWs = useCallback((wsHost: string, key: string) => {
    try {
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
      setWsState('connecting');
      const ws = new WebSocket(`ws://${wsHost}?key=${encodeURIComponent(key)}`);
      ws.onopen    = () => { setWsState('connected'); addLog('[WS] Connected — live logs streaming'); };
      ws.onmessage = (e) => addLog(e.data);
      ws.onerror   = () => setWsState('error');
      ws.onclose   = () => { setWsState('disconnected'); };
      wsRef.current = ws;
    } catch (e) {
      setWsState('error');
      addLog(`[WS] Failed: ${e}`);
    }
  }, [addLog]);

  // ── Connect ──────────────────────────────────────────────────────────────
  const connect = async () => {
    const h = host.trim(); const k = apiKey.trim();
    if (!h || !k) { toast.error('Enter host and API key'); return; }
    setConnecting(true);
    try {
      const api = new BridgeApi(h, k);
      if (!await api.ping()) { toast.error('Could not reach bridge API'); return; }
      saveBridgeConfig({ host: h, apiKey: k });
      bridgeRef.current = api;
      setConnected(true);
      toast.success('Connected');
      try { setStats(await api.getStats()); } catch {}
      await refreshStatuses(api);
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(async () => {
        try { setStats(await api.getStats()); } catch {}
        try { if (bridgeRef.current) await refreshStatuses(bridgeRef.current); } catch {}
      }, 5000);
      openWs(h, k);
    } catch (e: any) {
      toast.error(e?.message || 'Connection failed');
    } finally { setConnecting(false); }
  };

  const disconnect = () => {
    try { wsRef.current?.close(); } catch {}
    wsRef.current = null;
    if (intervalRef.current) clearInterval(intervalRef.current);
    bridgeRef.current = null;
    setConnected(false); setStats(null); setLogs([]); setWsState('disconnected');
    setServers(KNOWN_SERVERS.map(s => ({ ...s, status: 'unknown' as const })));
    setSelected(null);
    toast('Disconnected');
  };

  const selectServer = (srv: LinuxServer) => {
    setSelected(srv); setTab('overview');
    setResources([]); setCfgContent(''); setCfgEdited('');
    setHealthIssues([]); setInstallOutput('');
  };

  // Keep selected in sync with status refreshes
  useEffect(() => {
    if (!selected) return;
    const u = servers.find(s => s.processName === selected.processName);
    if (u && u.status !== selected.status) setSelected(u);
  }, [servers]);

  // ── Server Actions ───────────────────────────────────────────────────────
  const serverAction = async (action: 'start' | 'stop' | 'restart') => {
    if (!bridgeRef.current || !selected) return;
    setActionLoading(action);
    try {
      if (action === 'start')   await bridgeRef.current.startServer(selected.processName);
      if (action === 'stop')    await bridgeRef.current.stopServer(selected.processName);
      if (action === 'restart') await bridgeRef.current.restartServer(selected.processName);
      toast.success(`Server ${action === 'restart' ? 'restarting…' : action + 'ed'}`);
      setTimeout(() => { if (bridgeRef.current) refreshStatuses(bridgeRef.current); }, 3000);
    } catch (e: any) {
      toast.error(e?.message || `Failed to ${action}`);
    } finally { setActionLoading(null); }
  };

  // ── Console command ──────────────────────────────────────────────────────
  const sendCmd = async () => {
    if (!bridgeRef.current || !cmd.trim()) return;
    setSendingCmd(true);
    addLog(`> ${cmd}`);
    try {
      const out = await bridgeRef.current.execute(cmd.trim());
      if (out) addLog(out);
    } catch (e: any) { addLog(`[ERROR] ${e?.message}`); }
    setCmd('');
    setSendingCmd(false);
  };

  // ── Resources ────────────────────────────────────────────────────────────
  const loadResources = async () => {
    if (!bridgeRef.current || !selected) return;
    setLoadingResources(true);
    try { setResources(await bridgeRef.current.getResources(selected.resourcesPath)); }
    catch { toast.error('Failed to load resources'); }
    finally { setLoadingResources(false); }
  };

  const resourceCmd = async (name: string, action: 'restart' | 'stop' | 'start' | 'ensure') => {
    if (!bridgeRef.current) return;
    setResourceAction(`${action}-${name}`);
    try {
      await bridgeRef.current.execute(`${action} ${name}`);
      toast.success(`${action} ${name}`);
    } catch (e: any) { toast.error(e?.message || `Failed to ${action} ${name}`); }
    finally { setResourceAction(null); }
  };

  // ── Config ───────────────────────────────────────────────────────────────
  const loadCfg = async () => {
    if (!bridgeRef.current || !selected) return;
    setLoadingCfg(true);
    try {
      const c = await bridgeRef.current.getServerCfg(selected.cfgPath);
      setCfgContent(c); setCfgEdited(c);
    } catch { toast.error('Failed to load config'); }
    finally { setLoadingCfg(false); }
  };

  const saveCfg = async () => {
    if (!bridgeRef.current || !selected) return;
    setSavingCfg(true);
    try {
      await bridgeRef.current.writeFile(selected.cfgPath, cfgEdited);
      setCfgContent(cfgEdited);
      toast.success('server.cfg saved');
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
    finally { setSavingCfg(false); }
  };

  // ── Install ──────────────────────────────────────────────────────────────
  const installResource = async () => {
    if (!bridgeRef.current || !selected || !installUrl.trim()) return;
    setInstalling(true); setInstallOutput('');
    const name = installName.trim() || installUrl.trim().split('/').pop()?.replace('.git', '') || 'resource';
    const cmd = `cd "${selected.resourcesPath}" && git clone ${installUrl.trim()} ${name}`;
    try {
      setInstallOutput(`Running: ${cmd}\n`);
      const out = await bridgeRef.current.execute(cmd);
      setInstallOutput(prev => prev + (out || 'Done — no output returned'));
      toast.success(`Installed ${name}`);
      setInstallUrl(''); setInstallName('');
      if (resources.length) loadResources();
    } catch (e: any) {
      setInstallOutput(prev => prev + `\nError: ${e?.message}`);
      toast.error('Install failed — check bridge execute permissions');
    } finally { setInstalling(false); }
  };

  // ── Health ───────────────────────────────────────────────────────────────
  const runHealth = async () => {
    if (!bridgeRef.current || !selected) return;
    setLoadingCfg(true);
    try {
      const cfg = await bridgeRef.current.getServerCfg(selected.cfgPath);
      setHealthIssues(analyzeConfig(cfg, selected.framework));
    } catch { toast.error('Could not load config for health check'); }
    finally { setLoadingCfg(false); }
  };

  // Load tab data on demand
  useEffect(() => {
    if (!connected || !selected) return;
    if (tab === 'resources' && resources.length === 0) loadResources();
    if (tab === 'config' && !cfgContent) loadCfg();
    if (tab === 'health' && healthIssues.length === 0) runHealth();
  }, [tab, selected]);

  // ── Render ────────────────────────────────────────────────────────────────
  const tabDef: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview',   label: 'Overview',   icon: <Activity size={12} /> },
    { id: 'console',    label: 'Console',    icon: <Terminal size={12} /> },
    { id: 'resources',  label: 'Resources',  icon: <Package size={12} /> },
    { id: 'config',     label: 'Config',     icon: <FileCode size={12} /> },
    { id: 'install',    label: 'Install',    icon: <Download size={12} /> },
    { id: 'health',     label: 'Health',     icon: <HeartPulse size={12} /> },
  ];

  const wsIndicator = {
    connected:    'bg-green-400',
    connecting:   'bg-amber-400 animate-pulse',
    error:        'bg-red-500',
    disconnected: 'bg-surface-600',
  }[wsState];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col overflow-hidden">

      {/* ── Connection Bar ────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2.5 px-4 py-2.5 border-b border-overlay-6 bg-surface-950/60 backdrop-blur-sm">
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${connected ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]' : 'bg-red-500'}`} />
        <span className="text-xs font-semibold text-surface-400 shrink-0">Bridge</span>

        <div className="flex items-center gap-1.5 bg-overlay-4 border border-overlay-6 rounded-lg px-2.5 py-1.5">
          <Globe size={12} className="text-surface-500 shrink-0" />
          <input value={host} onChange={e => setHost(e.target.value)} placeholder="192.168.1.148:3142"
            disabled={connected}
            className="w-44 text-sm bg-transparent text-surface-200 placeholder-surface-600 focus:outline-none disabled:opacity-50" />
        </div>

        <div className="flex items-center gap-1.5 bg-overlay-4 border border-overlay-6 rounded-lg px-2.5 py-1.5">
          <span className="text-[10px] font-medium text-surface-500 shrink-0">KEY</span>
          <input value={apiKey} onChange={e => setApiKey(e.target.value)} type={showKey ? 'text' : 'password'}
            placeholder="API Key" disabled={connected}
            className="w-28 text-sm bg-transparent text-surface-200 placeholder-surface-600 focus:outline-none disabled:opacity-50" />
          <button onClick={() => setShowKey(v => !v)} className="text-surface-500 hover:text-surface-300">
            {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>

        {connected ? (
          <button onClick={disconnect} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-600/30 transition-all">
            <WifiOff size={12} /> Disconnect
          </button>
        ) : (
          <button onClick={connect} disabled={connecting} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium btn-primary disabled:opacity-50">
            {connecting ? <Loader2 size={12} className="animate-spin" /> : <Wifi size={12} />}
            {connecting ? 'Connecting…' : 'Connect'}
          </button>
        )}

        {stats && (
          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-surface-400">
              <Cpu size={12} className="text-primary-400" />
              <span className="font-semibold text-surface-200">{fmt(stats.cpu)}%</span>
              <span>CPU</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-surface-400">
              <HardDrive size={12} className="text-indigo-400" />
              <span className="font-semibold text-surface-200">{fmt(stats.ram_used)}/{fmt(stats.ram_total)} GB</span>
              <span>RAM</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Server List */}
        <div className="w-52 shrink-0 flex flex-col border-r border-overlay-6 bg-surface-950/20 overflow-y-auto">
          <div className="px-3 pt-3 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-surface-600">Servers</span>
          </div>
          <div className="px-2 space-y-1 pb-3">
            {servers.map(srv => {
              const sc = SC[srv.status] ?? SC.unknown;
              const fw = FW_BADGE[srv.framework] ?? 'bg-surface-700/40 text-surface-400 border border-surface-600/30';
              const isActive = selected?.processName === srv.processName;
              return (
                <button key={srv.processName} onClick={() => selectServer(srv)} disabled={!connected}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${isActive ? 'bg-primary-600/15 border border-primary-500/25 text-surface-100' : 'hover:bg-overlay-4 text-surface-300 border border-transparent'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${sc.dot}`} />
                    <span className="text-sm font-medium truncate flex-1">{srv.name}</span>
                    {isActive && <ChevronRight size={12} className="text-primary-400 shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2 pl-4">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${fw}`}>{srv.framework}</span>
                    <span className={`text-[10px] font-medium ${sc.cls}`}>{sc.text}</span>
                  </div>
                </button>
              );
            })}
          </div>
          {!connected && <p className="text-center text-xs text-surface-600 mt-2 px-3">Connect above to manage servers</p>}
        </div>

        {/* Server Panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <Server size={48} className="text-surface-700 mb-4" />
              <p className="text-surface-400 font-medium mb-1">No server selected</p>
              <p className="text-xs text-surface-600">{connected ? 'Click a server on the left' : 'Connect to the bridge first'}</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-overlay-6">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-surface-100">{selected.name}</h2>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${FW_BADGE[selected.framework] ?? ''}`}>{selected.framework}</span>
                    <span className={`text-[10px] font-medium ${(SC[selected.status] ?? SC.unknown).cls}`}>
                      ● {(SC[selected.status] ?? SC.unknown).text}
                    </span>
                  </div>
                  <p className="text-xs text-surface-500 mt-0.5 font-mono">{selected.processName}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {(['start', 'stop', 'restart'] as const).map(a => {
                    const dis = !!actionLoading || (a === 'start' && selected.status === 'online') || (a === 'stop' && selected.status === 'stopped');
                    const s = { start: 'bg-green-600/20 text-green-400 border-green-500/30 hover:bg-green-600/30', stop: 'bg-red-600/20 text-red-400 border-red-500/30 hover:bg-red-600/30', restart: 'bg-amber-600/20 text-amber-400 border-amber-500/30 hover:bg-amber-600/30' }[a];
                    const I = { start: Play, stop: Square, restart: RefreshCw }[a];
                    return (
                      <button key={a} onClick={() => serverAction(a)} disabled={dis}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed capitalize ${s}`}>
                        {actionLoading === a ? <Loader2 size={12} className="animate-spin" /> : <I size={12} />}{a}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tabs */}
              <div className="shrink-0 flex items-center gap-1 px-5 py-2 border-b border-overlay-6 overflow-x-auto">
                {tabDef.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${tab === t.id ? 'bg-primary-600/20 text-primary-300 border border-primary-500/25' : 'text-surface-400 hover:text-surface-200 hover:bg-overlay-4'}`}>
                    {t.icon}{t.label}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto p-5">

                {/* ── OVERVIEW ────────────────────────────────────────── */}
                {tab === 'overview' && (
                  <div className="space-y-4 max-w-2xl">
                    <div className="glass-panel p-4 flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${(SC[selected.status] ?? SC.unknown).dot}`} />
                      <span className="text-sm font-medium text-surface-200">
                        {selected.name} is <span className={(SC[selected.status] ?? SC.unknown).cls}>{(SC[selected.status] ?? SC.unknown).text}</span>
                      </span>
                      {stats && <span className="ml-auto text-xs text-surface-500">auto-refreshing every 5s</span>}
                    </div>

                    {stats ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="glass-panel p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Cpu size={15} className="text-primary-400" />
                            <span className="text-sm font-medium text-surface-200">CPU</span>
                            <span className="ml-auto text-xl font-bold text-primary-300">{fmt(stats.cpu)}%</span>
                          </div>
                          <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
                            <motion.div animate={{ width: `${clamp(stats.cpu)}%` }} transition={{ duration: 0.5 }}
                              className="h-full bg-gradient-to-r from-primary-700 to-primary-400 rounded-full" />
                          </div>
                        </div>
                        <div className="glass-panel p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <HardDrive size={15} className="text-indigo-400" />
                            <span className="text-sm font-medium text-surface-200">RAM</span>
                            <span className="ml-auto text-xl font-bold text-indigo-300">{fmt(stats.ram_percent, 0)}%</span>
                          </div>
                          <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
                            <motion.div animate={{ width: `${clamp(stats.ram_percent)}%` }} transition={{ duration: 0.5 }}
                              className="h-full bg-gradient-to-r from-indigo-700 to-indigo-400 rounded-full" />
                          </div>
                          <p className="text-[11px] text-surface-500 mt-1.5 text-right">{fmt(stats.ram_used)} / {fmt(stats.ram_total)} GB</p>
                        </div>
                      </div>
                    ) : (
                      <div className="glass-panel p-8 flex items-center justify-center text-surface-600 text-sm gap-2">
                        <Loader2 size={16} className="animate-spin" /> Loading stats…
                      </div>
                    )}

                    <div className="glass-panel p-4 space-y-2.5">
                      <div className="flex items-start gap-3">
                        <Package size={13} className="text-surface-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] text-surface-600 mb-0.5 uppercase tracking-wider">Resources Path</p>
                          <p className="text-xs text-surface-400 font-mono break-all">{selected.resourcesPath}</p>
                        </div>
                      </div>
                      <div className="border-t border-overlay-4 pt-2.5 flex items-start gap-3">
                        <FileCode size={13} className="text-surface-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] text-surface-600 mb-0.5 uppercase tracking-wider">Config</p>
                          <p className="text-xs text-surface-400 font-mono break-all">{selected.cfgPath}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── CONSOLE ─────────────────────────────────────────── */}
                {tab === 'console' && (
                  <div className="h-full flex flex-col min-h-0 gap-2">
                    <div className="flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${wsIndicator}`} />
                        <span className="text-xs text-surface-500 capitalize">{wsState}</span>
                        {(wsState === 'error' || wsState === 'disconnected') && connected && (
                          <button onClick={() => openWs(host, apiKey)} className="text-xs text-primary-400 hover:text-primary-300">
                            Reconnect
                          </button>
                        )}
                      </div>
                      <button onClick={() => setLogs([])} className="text-xs text-surface-500 hover:text-surface-300">Clear</button>
                    </div>

                    <div className="flex-1 min-h-[200px] overflow-auto font-mono text-xs bg-black/50 rounded-xl border border-overlay-6 p-3">
                      {logs.length === 0
                        ? <p className="text-surface-600 text-center mt-8">{connected ? 'Waiting for logs…' : 'Connect first'}</p>
                        : logs.map((l, i) => <div key={i} className="text-green-300/80 leading-5 break-all whitespace-pre-wrap">{l}</div>)
                      }
                      <div ref={logsEndRef} />
                    </div>

                    {/* Command input */}
                    <div className="shrink-0 flex gap-2">
                      <input value={cmd} onChange={e => setCmd(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') sendCmd(); }}
                        placeholder="Type a command and press Enter (e.g. restart ox_inventory)"
                        className="flex-1 px-3 py-2 text-sm bg-overlay-4 border border-overlay-6 rounded-lg text-surface-200 placeholder-surface-600 focus:outline-none focus:border-primary-500/40 font-mono" />
                      <button onClick={sendCmd} disabled={sendingCmd || !cmd.trim()}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium btn-primary disabled:opacity-50">
                        {sendingCmd ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Send
                      </button>
                    </div>
                  </div>
                )}

                {/* ── RESOURCES ───────────────────────────────────────── */}
                {tab === 'resources' && (
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <input value={resourceFilter} onChange={e => setResourceFilter(e.target.value)}
                        placeholder="Filter resources…"
                        className="flex-1 max-w-xs px-3 py-1.5 text-sm bg-overlay-4 border border-overlay-6 rounded-lg text-surface-200 placeholder-surface-600 focus:outline-none focus:border-primary-500/40" />
                      <span className="text-xs text-surface-500">{resources.length} total</span>
                      <button onClick={loadResources} disabled={loadingResources}
                        className="flex items-center gap-1.5 text-xs btn-secondary px-3 py-1.5 ml-auto">
                        {loadingResources ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Refresh
                      </button>
                    </div>

                    {loadingResources ? (
                      <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-primary-500" /></div>
                    ) : resources.length === 0 ? (
                      <div className="flex flex-col items-center py-14 text-surface-600 gap-2">
                        <Package size={36} className="opacity-50" /><p className="text-sm">No resources found</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {resources.filter(r => !resourceFilter || r.toLowerCase().includes(resourceFilter.toLowerCase())).map(name => (
                          <div key={name} className="flex items-center gap-2 px-3 py-2 bg-overlay-4 border border-overlay-6 rounded-xl group">
                            <Package size={12} className="text-surface-600 shrink-0" />
                            <span className="text-xs text-surface-300 flex-1 truncate font-mono">{name}</span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {(['restart', 'start', 'stop', 'ensure'] as const).map(a => (
                                <button key={a} onClick={() => resourceCmd(name, a)}
                                  disabled={resourceAction === `${a}-${name}`}
                                  className={`text-[10px] px-2 py-0.5 rounded font-medium transition-all disabled:opacity-50 ${
                                    a === 'restart' ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30' :
                                    a === 'start'   ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30' :
                                    a === 'stop'    ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30' :
                                                      'bg-primary-500/20 text-primary-300 hover:bg-primary-500/30'
                                  }`}>
                                  {resourceAction === `${a}-${name}` ? '…' : a}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── CONFIG ──────────────────────────────────────────── */}
                {tab === 'config' && (
                  <div className="h-full flex flex-col min-h-0 gap-3">
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="text-xs text-surface-500 font-mono truncate flex-1">{selected.cfgPath}</p>
                      <button onClick={loadCfg} disabled={loadingCfg}
                        className="flex items-center gap-1.5 text-xs btn-secondary px-3 py-1.5">
                        {loadingCfg ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Reload
                      </button>
                      <button onClick={saveCfg} disabled={savingCfg || cfgEdited === cfgContent}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-600/20 text-green-400 border border-green-500/30 rounded-lg hover:bg-green-600/30 transition-all disabled:opacity-40 font-medium">
                        {savingCfg ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                      </button>
                    </div>
                    {cfgEdited === cfgContent && cfgContent !== '' && (
                      <p className="text-[10px] text-surface-500 shrink-0">No unsaved changes</p>
                    )}
                    {cfgEdited !== cfgContent && (
                      <p className="text-[10px] text-amber-400 shrink-0">● Unsaved changes</p>
                    )}
                    {loadingCfg ? (
                      <div className="flex-1 flex items-center justify-center"><Loader2 size={24} className="animate-spin text-primary-500" /></div>
                    ) : (
                      <textarea
                        value={cfgEdited}
                        onChange={e => setCfgEdited(e.target.value)}
                        placeholder="Click Reload to load server.cfg"
                        spellCheck={false}
                        className="flex-1 min-h-[300px] font-mono text-xs bg-black/50 rounded-xl border border-overlay-6 p-4 text-green-300/90 whitespace-pre resize-none focus:outline-none focus:border-primary-500/30"
                      />
                    )}
                  </div>
                )}

                {/* ── INSTALL ─────────────────────────────────────────── */}
                {tab === 'install' && (
                  <div className="space-y-4 max-w-2xl">
                    <div className="glass-panel p-5 space-y-3">
                      <h3 className="font-semibold text-surface-200 flex items-center gap-2"><Download size={15} /> Install Resource from GitHub</h3>
                      <p className="text-xs text-surface-500">Runs <code className="text-green-300/70">git clone</code> directly on your Linux server via the bridge.</p>
                      <div className="space-y-2">
                        <input value={installUrl} onChange={e => setInstallUrl(e.target.value)}
                          placeholder="https://github.com/user/repo.git"
                          className="w-full px-3 py-2 text-sm bg-overlay-4 border border-overlay-6 rounded-lg text-surface-200 placeholder-surface-600 focus:outline-none focus:border-primary-500/40" />
                        <input value={installName} onChange={e => setInstallName(e.target.value)}
                          placeholder="Folder name (optional — defaults to repo name)"
                          className="w-full px-3 py-2 text-sm bg-overlay-4 border border-overlay-6 rounded-lg text-surface-200 placeholder-surface-600 focus:outline-none focus:border-primary-500/40" />
                        <button onClick={installResource} disabled={installing || !installUrl.trim()}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-medium btn-primary disabled:opacity-50">
                          {installing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                          {installing ? 'Installing…' : 'Install'}
                        </button>
                      </div>
                    </div>

                    {installOutput && (
                      <div>
                        <p className="text-xs text-surface-500 mb-1">Output</p>
                        <pre className="font-mono text-xs bg-black/50 rounded-xl border border-overlay-6 p-4 text-green-300/80 whitespace-pre-wrap">
                          {installOutput}
                        </pre>
                      </div>
                    )}

                    <div className="glass-panel p-5 space-y-2">
                      <h3 className="font-semibold text-surface-200 flex items-center gap-2 mb-3"><RotateCcw size={14} /> Update Resource</h3>
                      <p className="text-xs text-surface-500 mb-3">Run <code className="text-green-300/70">git pull</code> inside an existing resource folder.</p>
                      {resources.length === 0 ? (
                        <p className="text-xs text-surface-600">Load the Resources tab first to see the list.</p>
                      ) : (
                        <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
                          {resources.filter(Boolean).map(name => (
                            <button key={name} onClick={async () => {
                              if (!bridgeRef.current || !selected) return;
                              setResourceAction(`update-${name}`);
                              try {
                                const out = await bridgeRef.current.execute(`cd "${selected.resourcesPath}/${name}" && git pull`);
                                setInstallOutput(`git pull ${name}:\n${out || 'Done'}`);
                                toast.success(`Updated ${name}`);
                              } catch (e: any) { toast.error(e?.message); }
                              setResourceAction(null);
                            }} disabled={resourceAction === `update-${name}`}
                              className="flex items-center gap-1 px-2 py-1.5 text-[10px] bg-overlay-4 border border-overlay-6 rounded-lg text-surface-300 hover:bg-overlay-6 transition-all truncate disabled:opacity-50">
                              {resourceAction === `update-${name}` ? <Loader2 size={9} className="animate-spin shrink-0" /> : <RotateCcw size={9} className="shrink-0" />}
                              <span className="truncate">{name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── HEALTH ──────────────────────────────────────────── */}
                {tab === 'health' && (
                  <div className="space-y-3 max-w-2xl">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-surface-200 flex items-center gap-2"><HeartPulse size={15} /> Config Health Check</h3>
                      <button onClick={runHealth} disabled={loadingCfg}
                        className="flex items-center gap-1.5 text-xs btn-secondary px-3 py-1.5">
                        {loadingCfg ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Re-scan
                      </button>
                    </div>

                    {loadingCfg && <div className="flex items-center justify-center py-10"><Loader2 size={24} className="animate-spin text-primary-500" /></div>}

                    {!loadingCfg && healthIssues.length > 0 && (
                      <div className="space-y-2">
                        {healthIssues.map((issue, i) => {
                          const Icon = issue.severity === 'error' ? AlertCircle : issue.severity === 'warning' ? AlertTriangle : Info;
                          const c = issue.severity === 'error' ? 'border-red-500/30 bg-red-400/10 text-red-400'
                                  : issue.severity === 'warning' ? 'border-amber-500/30 bg-amber-400/10 text-amber-400'
                                  : 'border-blue-500/30 bg-blue-400/10 text-blue-400';
                          return (
                            <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${c}`}>
                              <Icon size={15} className="shrink-0 mt-0.5" />
                              <div>
                                <p className="text-sm font-medium">{issue.message}</p>
                                <p className="text-xs opacity-75 mt-0.5 flex items-center gap-1">
                                  <Wrench size={10} /> {issue.suggestion}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {!loadingCfg && healthIssues.length === 0 && (
                      <div className="flex items-center justify-center py-12 text-surface-600 gap-2">
                        <CheckCircle2 size={20} className="text-green-500" />
                        <span className="text-sm">Click Re-scan to analyze your config</span>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function LinuxServers() {
  return <ErrBoundary><LinuxServersInner /></ErrBoundary>;
}
