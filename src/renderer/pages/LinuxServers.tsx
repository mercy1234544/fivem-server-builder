import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Server,
  Wifi,
  WifiOff,
  Play,
  Square,
  RefreshCw,
  Terminal,
  Package,
  FileCode,
  Cpu,
  HardDrive,
  Loader2,
  ChevronRight,
  Eye,
  EyeOff,
  Globe,
  Activity,
} from 'lucide-react';
import { BridgeApi, loadBridgeConfig, saveBridgeConfig } from '../services/bridgeApi';
import type { SystemStats, Pm2Process } from '../services/bridgeApi';

interface LinuxServer {
  name: string;
  framework: string;
  processName: string;
  resourcesPath: string;
  cfgPath: string;
  status: 'online' | 'stopped' | 'error' | 'unknown';
}

const KNOWN_SERVERS: Omit<LinuxServer, 'status'>[] = [
  {
    name: 'QBCore Server',
    framework: 'QBCore',
    processName: 'fxserver',
    resourcesPath: '/home/harperlinux/fxserver/server/txData/QBCore_8ADB3B.base/resources',
    cfgPath: '/home/harperlinux/fxserver/server/txData/QBCore_8ADB3B.base/server.cfg',
  },
  {
    name: 'Qbox Server',
    framework: 'Qbox',
    processName: 'qboxfxserver',
    resourcesPath: '/home/harperlinux/qboxfxserver/server/txData/Qbox_F5A584.base/resources',
    cfgPath: '/home/harperlinux/qboxfxserver/server/txData/Qbox_F5A584.base/server.cfg',
  },
];

const FRAMEWORK_BADGE: Record<string, string> = {
  QBCore: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  Qbox: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
  ESX: 'bg-green-500/20 text-green-300 border border-green-500/30',
};

const STATUS_CFG = {
  online:  { dot: 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]', text: 'Running',  textCls: 'text-green-400' },
  stopped: { dot: 'bg-surface-600',                                        text: 'Stopped',  textCls: 'text-surface-500' },
  error:   { dot: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]',      text: 'Error',    textCls: 'text-red-400' },
  unknown: { dot: 'bg-amber-500/60',                                        text: 'Unknown', textCls: 'text-amber-400/70' },
};

type Tab = 'overview' | 'console' | 'resources' | 'config';

function pm2Status(proc: Pm2Process): LinuxServer['status'] {
  const s = proc.pm2_env?.status ?? proc.status ?? '';
  if (s === 'online') return 'online';
  if (s === 'stopped' || s === 'stopping') return 'stopped';
  if (s === 'errored') return 'error';
  return 'unknown';
}

export default function LinuxServers() {
  const saved = loadBridgeConfig();
  const [host, setHost] = useState(saved.host);
  const [apiKey, setApiKey] = useState(saved.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const bridgeRef = useRef<BridgeApi | null>(null);
  const [servers, setServers] = useState<LinuxServer[]>(
    KNOWN_SERVERS.map(s => ({ ...s, status: 'unknown' as const }))
  );
  const [selected, setSelected] = useState<LinuxServer | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);

  const [tab, setTab] = useState<Tab>('overview');
  const [logs, setLogs] = useState<string[]>([]);
  const [resources, setResources] = useState<string[]>([]);
  const [cfgContent, setCfgContent] = useState('');
  const [loadingResources, setLoadingResources] = useState(false);
  const [loadingCfg, setLoadingCfg] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-scroll console
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const refreshStatuses = useCallback(async (api: BridgeApi) => {
    try {
      const procs = await api.pm2List();
      setServers(prev =>
        prev.map(srv => {
          const proc = procs.find((p: Pm2Process) => p.name === srv.processName);
          return { ...srv, status: proc ? pm2Status(proc) : 'unknown' };
        })
      );
    } catch {}
  }, []);

  const openWebSocket = useCallback((wsHost: string, key: string) => {
    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(`ws://${wsHost}?key=${encodeURIComponent(key)}`);
    ws.onopen  = () => addLog('[WS] Connected — live logs streaming');
    ws.onmessage = (e) => addLog(e.data);
    ws.onerror = () => addLog('[WS] Connection error');
    ws.onclose = () => addLog('[WS] Disconnected');
    wsRef.current = ws;
  }, []);

  const addLog = (line: string) =>
    setLogs(prev => [...prev.slice(-999), String(line)]);

  const connect = async () => {
    const h = host.trim();
    const k = apiKey.trim();
    if (!h || !k) { toast.error('Enter host and API key'); return; }
    setConnecting(true);
    try {
      const api = new BridgeApi(h, k);
      const ok = await api.ping();
      if (!ok) { toast.error('Could not reach bridge API'); return; }

      saveBridgeConfig({ host: h, apiKey: k });
      bridgeRef.current = api;
      setConnected(true);
      toast.success('Connected to bridge');

      // Initial load
      try { setStats(await api.getStats()); } catch {}
      await refreshStatuses(api);

      // Auto-refresh every 5 s
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(async () => {
        try { setStats(await api.getStats()); } catch {}
        await refreshStatuses(api);
      }, 5000);

      openWebSocket(h, k);
    } catch (err: any) {
      toast.error(err.message || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    wsRef.current?.close();
    wsRef.current = null;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    bridgeRef.current = null;
    setConnected(false);
    setStats(null);
    setLogs([]);
    setServers(KNOWN_SERVERS.map(s => ({ ...s, status: 'unknown' as const })));
    setSelected(null);
    toast('Disconnected from bridge');
  };

  const selectServer = (srv: LinuxServer) => {
    setSelected(srv);
    setTab('overview');
    setResources([]);
    setCfgContent('');
  };

  // Keep `selected` in sync with updated statuses
  useEffect(() => {
    if (!selected) return;
    const updated = servers.find(s => s.processName === selected.processName);
    if (updated) setSelected(updated);
  }, [servers]);

  const serverAction = async (action: 'start' | 'stop' | 'restart') => {
    if (!bridgeRef.current || !selected) return;
    setActionLoading(action);
    try {
      if (action === 'start')   await bridgeRef.current.startServer(selected.processName);
      if (action === 'stop')    await bridgeRef.current.stopServer(selected.processName);
      if (action === 'restart') await bridgeRef.current.restartServer(selected.processName);
      toast.success(`Server ${action === 'restart' ? 'restarting' : action + 'ed'}`);
      setTimeout(() => refreshStatuses(bridgeRef.current!), 2500);
    } catch (err: any) {
      toast.error(err.message || `Failed to ${action} server`);
    } finally {
      setActionLoading(null);
    }
  };

  const loadResources = async () => {
    if (!bridgeRef.current || !selected) return;
    setLoadingResources(true);
    try {
      const list = await bridgeRef.current.getResources(selected.resourcesPath);
      setResources(list);
    } catch { toast.error('Failed to load resources'); }
    finally { setLoadingResources(false); }
  };

  const loadCfg = async () => {
    if (!bridgeRef.current || !selected) return;
    setLoadingCfg(true);
    try {
      const content = await bridgeRef.current.getServerCfg(selected.cfgPath);
      setCfgContent(content);
    } catch { toast.error('Failed to load server.cfg'); }
    finally { setLoadingCfg(false); }
  };

  // Load tab data on demand
  useEffect(() => {
    if (!connected || !selected) return;
    if (tab === 'resources' && resources.length === 0) loadResources();
    if (tab === 'config' && !cfgContent) loadCfg();
  }, [tab, selected]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full flex flex-col overflow-hidden"
    >
      {/* ── Connection Bar ────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2.5 px-4 py-2.5 border-b border-overlay-6 bg-surface-950/60 backdrop-blur-sm">
        {/* Status dot */}
        <div
          className={`w-2.5 h-2.5 rounded-full shrink-0 transition-colors duration-300 ${
            connected ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]' : 'bg-red-500'
          }`}
        />
        <span className="text-xs font-semibold text-surface-400 shrink-0 mr-1">Bridge</span>

        {/* Host input */}
        <div className="flex items-center gap-1.5 bg-overlay-4 border border-overlay-6 rounded-lg px-2.5 py-1.5">
          <Globe size={12} className="text-surface-500 shrink-0" />
          <input
            value={host}
            onChange={e => setHost(e.target.value)}
            placeholder="192.168.1.148:3142"
            disabled={connected}
            className="w-44 text-sm bg-transparent text-surface-200 placeholder-surface-600 focus:outline-none disabled:opacity-50"
          />
        </div>

        {/* API key input */}
        <div className="flex items-center gap-1.5 bg-overlay-4 border border-overlay-6 rounded-lg px-2.5 py-1.5">
          <span className="text-[10px] font-medium text-surface-500 shrink-0">KEY</span>
          <input
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            type={showKey ? 'text' : 'password'}
            placeholder="API Key"
            disabled={connected}
            className="w-28 text-sm bg-transparent text-surface-200 placeholder-surface-600 focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={() => setShowKey(v => !v)}
            className="text-surface-500 hover:text-surface-300 transition-colors"
          >
            {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>

        {/* Connect / Disconnect */}
        {connected ? (
          <button
            onClick={disconnect}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-600/30 transition-all"
          >
            <WifiOff size={12} /> Disconnect
          </button>
        ) : (
          <button
            onClick={connect}
            disabled={connecting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium btn-primary disabled:opacity-50"
          >
            {connecting ? <Loader2 size={12} className="animate-spin" /> : <Wifi size={12} />}
            {connecting ? 'Connecting…' : 'Connect'}
          </button>
        )}

        {/* Live stats pill */}
        {stats && (
          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-surface-400">
              <Cpu size={12} className="text-primary-400" />
              <span>CPU</span>
              <span className="font-semibold text-surface-200">{stats.cpu.toFixed(1)}%</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-surface-400">
              <HardDrive size={12} className="text-indigo-400" />
              <span>RAM</span>
              <span className="font-semibold text-surface-200">
                {stats.ram_used.toFixed(1)}/{stats.ram_total.toFixed(1)} GB
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Server List */}
        <div className="w-52 shrink-0 flex flex-col border-r border-overlay-6 bg-surface-950/20 overflow-y-auto">
          <div className="px-3 pt-3 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-surface-600">Servers</span>
          </div>

          <div className="px-2 space-y-1 pb-3">
            {servers.map(srv => {
              const sc = STATUS_CFG[srv.status];
              const fw = FRAMEWORK_BADGE[srv.framework] ?? 'bg-surface-700/40 text-surface-400 border border-surface-600/30';
              const isActive = selected?.processName === srv.processName;
              return (
                <button
                  key={srv.processName}
                  onClick={() => selectServer(srv)}
                  disabled={!connected}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
                    isActive
                      ? 'bg-primary-600/15 border border-primary-500/25 text-surface-100'
                      : 'hover:bg-overlay-4 text-surface-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${sc.dot}`} />
                    <span className="text-sm font-medium truncate flex-1">{srv.name}</span>
                    {isActive && <ChevronRight size={12} className="text-primary-400 shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2 pl-4">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${fw}`}>
                      {srv.framework}
                    </span>
                    <span className={`text-[10px] ${sc.textCls}`}>{sc.text}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {!connected && (
            <p className="text-center text-xs text-surface-600 mt-2 px-3">
              Connect above to manage servers
            </p>
          )}
        </div>

        {/* Server Panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <Server size={48} className="text-surface-700 mb-4" />
              <p className="text-surface-400 font-medium mb-1">No server selected</p>
              <p className="text-xs text-surface-600">
                {connected ? 'Click a server in the list to manage it' : 'Connect to the bridge API first'}
              </p>
            </div>
          ) : (
            <>
              {/* Panel Header */}
              <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-overlay-6">
                <div>
                  <h2 className="font-semibold text-surface-100">{selected.name}</h2>
                  <p className="text-xs text-surface-500 mt-0.5 font-mono">{selected.processName}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => serverAction('start')}
                    disabled={!!actionLoading || selected.status === 'online'}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600/20 text-green-400 border border-green-500/30 rounded-lg hover:bg-green-600/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {actionLoading === 'start' ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                    Start
                  </button>
                  <button
                    onClick={() => serverAction('stop')}
                    disabled={!!actionLoading || selected.status === 'stopped'}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-600/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {actionLoading === 'stop' ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
                    Stop
                  </button>
                  <button
                    onClick={() => serverAction('restart')}
                    disabled={!!actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-600/20 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-600/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {actionLoading === 'restart' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    Restart
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="shrink-0 flex items-center gap-1 px-5 py-2 border-b border-overlay-6">
                {(['overview', 'console', 'resources', 'config'] as Tab[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-all ${
                      tab === t
                        ? 'bg-primary-600/20 text-primary-300 border border-primary-500/25'
                        : 'text-surface-400 hover:text-surface-200 hover:bg-overlay-4'
                    }`}
                  >
                    {t === 'overview'   && <Activity size={12} />}
                    {t === 'console'    && <Terminal size={12} />}
                    {t === 'resources'  && <Package size={12} />}
                    {t === 'config'     && <FileCode size={12} />}
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-auto p-5">

                {/* ── Overview ── */}
                {tab === 'overview' && (
                  <div className="space-y-4 max-w-2xl">
                    {/* Status card */}
                    <div className="glass-panel p-4 flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${STATUS_CFG[selected.status].dot}`} />
                      <span className="text-sm font-medium text-surface-200">
                        {selected.name} is{' '}
                        <span className={STATUS_CFG[selected.status].textCls}>
                          {STATUS_CFG[selected.status].text}
                        </span>
                      </span>
                      <div className="ml-auto flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${FRAMEWORK_BADGE[selected.framework] ?? 'bg-surface-700/40 text-surface-400 border border-surface-600/30'}`}>
                          {selected.framework}
                        </span>
                      </div>
                    </div>

                    {/* CPU + RAM */}
                    {stats ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="glass-panel p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Cpu size={15} className="text-primary-400" />
                            <span className="text-sm font-medium text-surface-200">CPU</span>
                            <span className="ml-auto text-lg font-bold text-primary-300">
                              {stats.cpu.toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
                            <motion.div
                              animate={{ width: `${Math.min(stats.cpu, 100)}%` }}
                              transition={{ duration: 0.5 }}
                              className="h-full bg-gradient-to-r from-primary-700 to-primary-400 rounded-full"
                            />
                          </div>
                        </div>

                        <div className="glass-panel p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <HardDrive size={15} className="text-indigo-400" />
                            <span className="text-sm font-medium text-surface-200">RAM</span>
                            <span className="ml-auto text-lg font-bold text-indigo-300">
                              {stats.ram_percent.toFixed(0)}%
                            </span>
                          </div>
                          <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
                            <motion.div
                              animate={{ width: `${Math.min(stats.ram_percent, 100)}%` }}
                              transition={{ duration: 0.5 }}
                              className="h-full bg-gradient-to-r from-indigo-700 to-indigo-400 rounded-full"
                            />
                          </div>
                          <p className="text-[11px] text-surface-500 mt-1.5 text-right">
                            {stats.ram_used.toFixed(1)} / {stats.ram_total.toFixed(1)} GB
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="glass-panel p-10 flex items-center justify-center text-surface-600 text-sm">
                        <Loader2 size={18} className="animate-spin mr-2" /> Loading stats…
                      </div>
                    )}

                    {/* Paths info */}
                    <div className="glass-panel p-4 space-y-2">
                      <div className="flex items-start gap-3">
                        <Package size={13} className="text-surface-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] text-surface-600 mb-0.5 uppercase tracking-wider">Resources Path</p>
                          <p className="text-xs text-surface-400 font-mono break-all">{selected.resourcesPath}</p>
                        </div>
                      </div>
                      <div className="border-t border-overlay-4 pt-2 flex items-start gap-3">
                        <FileCode size={13} className="text-surface-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] text-surface-600 mb-0.5 uppercase tracking-wider">Config Path</p>
                          <p className="text-xs text-surface-400 font-mono break-all">{selected.cfgPath}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Console ── */}
                {tab === 'console' && (
                  <div className="h-full flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-2 shrink-0">
                      <p className="text-xs text-surface-500">
                        {logs.length} lines — live WebSocket feed
                      </p>
                      <button
                        onClick={() => setLogs([])}
                        className="text-xs text-surface-500 hover:text-surface-300 transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="flex-1 min-h-[300px] overflow-auto font-mono text-xs bg-black/50 rounded-xl border border-overlay-6 p-3 space-y-px">
                      {logs.length === 0 ? (
                        <p className="text-surface-600 text-center mt-10">
                          {connected ? 'Waiting for log output…' : 'Connect to see live logs'}
                        </p>
                      ) : (
                        logs.map((line, i) => (
                          <div key={i} className="text-green-300/80 leading-5 break-all whitespace-pre-wrap">
                            {line}
                          </div>
                        ))
                      )}
                      <div ref={logsEndRef} />
                    </div>
                  </div>
                )}

                {/* ── Resources ── */}
                {tab === 'resources' && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-surface-400">
                        {resources.length > 0 ? `${resources.length} resources` : 'Resources'}
                      </p>
                      <button
                        onClick={loadResources}
                        disabled={loadingResources}
                        className="flex items-center gap-1.5 text-xs btn-secondary px-3 py-1.5"
                      >
                        {loadingResources ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        Refresh
                      </button>
                    </div>

                    {loadingResources ? (
                      <div className="flex items-center justify-center py-16">
                        <Loader2 size={28} className="animate-spin text-primary-500" />
                      </div>
                    ) : resources.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-14 text-surface-600">
                        <Package size={36} className="mb-3 opacity-50" />
                        <p className="text-sm">No resources found</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {resources.map((name, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 px-3 py-2 bg-overlay-4 border border-overlay-6 rounded-xl"
                          >
                            <Package size={12} className="text-surface-600 shrink-0" />
                            <span className="text-xs text-surface-300 truncate">{name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Config ── */}
                {tab === 'config' && (
                  <div className="h-full flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-3 shrink-0">
                      <p className="text-xs text-surface-500 font-mono truncate max-w-lg">{selected.cfgPath}</p>
                      <button
                        onClick={loadCfg}
                        disabled={loadingCfg}
                        className="flex items-center gap-1.5 text-xs btn-secondary px-3 py-1.5 shrink-0 ml-2"
                      >
                        {loadingCfg ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        Reload
                      </button>
                    </div>

                    {loadingCfg ? (
                      <div className="flex items-center justify-center flex-1 py-16">
                        <Loader2 size={28} className="animate-spin text-primary-500" />
                      </div>
                    ) : (
                      <pre className="flex-1 font-mono text-xs bg-black/50 rounded-xl border border-overlay-6 p-4 overflow-auto text-green-300/80 whitespace-pre leading-5 min-h-[300px]">
                        {cfgContent || '# No content — click Reload to load server.cfg'}
                      </pre>
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
