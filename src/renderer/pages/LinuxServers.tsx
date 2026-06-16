import React, { Component, useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Server, Wifi, WifiOff, Play, Square, RefreshCw, Terminal, Package,
  FileCode, Cpu, HardDrive, Loader2, ChevronRight, Eye, EyeOff, Globe,
  Activity, AlertTriangle, CheckCircle2, AlertCircle, Info, Send,
  Download, Save, Wrench, HeartPulse, RotateCcw, FolderOpen, File as FileIcon,
  ChevronLeft, Car, ArrowUp, Zap,
} from 'lucide-react';
import { BridgeApi, loadBridgeConfig, saveBridgeConfig, parsePm2Status } from '../services/bridgeApi';
import type { SystemStats, FileEntry } from '../services/bridgeApi';

// ── Error Boundary ─────────────────────────────────────────────────────────────
class ErrBoundary extends Component<{ children: React.ReactNode }, { err: string | null }> {
  state = { err: null };
  static getDerivedStateFromError(e: Error) { return { err: e.message }; }
  render() {
    if (this.state.err) return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertTriangle size={40} className="text-red-400" />
        <p className="text-surface-200 font-semibold">Page crashed</p>
        <p className="text-xs text-surface-500 max-w-sm break-all">{this.state.err}</p>
        <button onClick={() => this.setState({ err: null })} className="text-xs btn-secondary px-4 py-2 mt-2">Try Again</button>
      </div>
    );
    return this.props.children;
  }
}

// ── Constants ──────────────────────────────────────────────────────────────────
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
  online:  { dot: 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]', text: 'Online',  cls: 'text-green-400' },
  stopped: { dot: 'bg-surface-600',                                       text: 'Stopped', cls: 'text-surface-500' },
  error:   { dot: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]',     text: 'Error',   cls: 'text-red-400' },
  unknown: { dot: 'bg-amber-400/60 animate-pulse',                         text: 'Checking…', cls: 'text-amber-400/70' },
} as const;

// Popular open-source vehicle/transport resources
const VEHICLE_PACKS = [
  { name: 'qb-vehicleshop',    repo: 'https://github.com/qbcore-framework/qb-vehicleshop.git',    desc: 'QBCore official vehicle dealership' },
  { name: 'qb-vehiclekeys',    repo: 'https://github.com/qbcore-framework/qb-vehiclekeys.git',    desc: 'QBCore vehicle key system' },
  { name: 'ox_fuel',           repo: 'https://github.com/overextended/ox_fuel.git',               desc: 'Overextended fuel system' },
  { name: 'PolyZone',          repo: 'https://github.com/mkafrin/PolyZone.git',                   desc: 'Zone detection library (required by many scripts)' },
  { name: 'ox_appearance',     repo: 'https://github.com/overextended/ox_appearance.git',         desc: 'Vehicle & ped appearance system' },
  { name: 'LegacyFuel',        repo: 'https://github.com/InZidiuZ/op-fuel.git',                   desc: 'Simple open-source fuel system' },
  { name: 'wasabi_carjacking', repo: 'https://github.com/wasabscripts/wasabi_carjacking.git',     desc: 'Open source carjacking script' },
  { name: 'qb-garage',         repo: 'https://github.com/qbcore-framework/qb-garages.git',        desc: 'QBCore vehicle garage system' },
];

// Popular open-source resources for Quick Install
const QUICK_RESOURCES = [
  { name: 'ox_lib',            repo: 'https://github.com/overextended/ox_lib.git',                desc: 'Required utility library' },
  { name: 'oxmysql',           repo: 'https://github.com/overextended/oxmysql.git',               desc: 'MySQL async library' },
  { name: 'ox_inventory',      repo: 'https://github.com/overextended/ox_inventory.git',          desc: 'Advanced inventory system' },
  { name: 'ox_target',         repo: 'https://github.com/overextended/ox_target.git',             desc: 'Entity targeting system' },
  { name: 'qb-core',           repo: 'https://github.com/qbcore-framework/qb-core.git',          desc: 'QBCore framework core' },
  { name: 'qb-multicharacter', repo: 'https://github.com/qbcore-framework/qb-multicharacter.git',desc: 'QBCore multi-character select' },
  { name: 'qb-hud',            repo: 'https://github.com/qbcore-framework/qb-hud.git',           desc: 'QBCore HUD' },
  { name: 'qb-phone',          repo: 'https://github.com/qbcore-framework/qb-phone.git',         desc: 'QBCore phone' },
  { name: 'qb-banking',        repo: 'https://github.com/qbcore-framework/qb-banking.git',       desc: 'QBCore banking' },
  { name: 'qb-police',         repo: 'https://github.com/qbcore-framework/qb-police.git',        desc: 'QBCore police job' },
];

type Tab = 'overview' | 'console' | 'resources' | 'config' | 'files' | 'install' | 'vehicles' | 'health';

function fmt(n: any, dec = 1) { const v = Number(n); return isFinite(v) ? v.toFixed(dec) : '—'; }
function clamp(n: any) { const v = Number(n); return isFinite(v) ? Math.min(Math.max(v, 0), 100) : 0; }

// ── Health analysis ────────────────────────────────────────────────────────────
interface HealthIssue {
  severity: 'error' | 'warning' | 'info' | 'ok';
  message: string;
  suggestion: string;
  cfgPatch?: string;
}

function analyzeConfig(cfg: string, framework: string): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const low = cfg.toLowerCase();
  const has = (s: string) => low.includes(s.toLowerCase());

  if (!has('sv_licensekey') && !has('sv_license')) {
    issues.push({ severity: 'error', message: 'No license key found', suggestion: 'sv_licenseKey "cfxk_your_key_here"', cfgPatch: '\nsv_licenseKey "cfxk_your_key_here"' });
  }
  if (!has('onesync')) {
    issues.push({ severity: 'warning', message: 'OneSync not configured', suggestion: 'set onesync on', cfgPatch: '\nset onesync on' });
  }
  if (!has('sv_maxclients')) {
    issues.push({ severity: 'info', message: 'sv_maxClients not set (defaults to 48)', suggestion: 'sv_maxClients 64', cfgPatch: '\nsv_maxClients 64' });
  }
  if (!has('mysql_connection_string') && !has('set mysql') && !has('oxmysql')) {
    issues.push({ severity: 'warning', message: 'No MySQL connection string found', suggestion: 'set mysql_connection_string "mysql://root:pass@localhost/fivem"', cfgPatch: '\nset mysql_connection_string "mysql://root:pass@localhost/fivem"' });
  }
  if ((framework === 'Qbox' || framework === 'QBCore') && !has('ox_lib')) {
    issues.push({ severity: 'warning', message: 'ox_lib not ensured in config', suggestion: 'ensure ox_lib', cfgPatch: '\nensure ox_lib' });
  }
  if ((framework === 'Qbox' || framework === 'QBCore') && !has('oxmysql')) {
    issues.push({ severity: 'warning', message: 'oxmysql not ensured in config', suggestion: 'ensure oxmysql', cfgPatch: '\nensure oxmysql' });
  }
  if (!has('sv_hostname')) {
    issues.push({ severity: 'info', message: 'No server hostname set', suggestion: 'sv_hostname "My FiveM Server"', cfgPatch: '\nsv_hostname "My FiveM Server"' });
  }
  if (issues.length === 0) {
    issues.push({ severity: 'ok', message: 'All checks passed — config looks good!', suggestion: '' });
  }
  return issues;
}

// ── Component ──────────────────────────────────────────────────────────────────
function LinuxServersInner() {
  const saved = loadBridgeConfig();
  const [host, setHost]     = useState(saved.host);
  const [apiKey, setApiKey] = useState(saved.apiKey);
  const [showKey, setShowKey]     = useState(false);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const bridgeRef   = useRef<BridgeApi | null>(null);
  const wsRef       = useRef<WebSocket | null>(null);
  const wsTimeout   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logsEndRef  = useRef<HTMLDivElement>(null);

  const [servers, setServers] = useState<LinuxServer[]>(KNOWN_SERVERS.map(s => ({ ...s, status: 'unknown' as const })));
  const [selected, setSelected] = useState<LinuxServer | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [wsState, setWsState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [tab, setTab] = useState<Tab>('overview');

  // Console
  const [logs, setLogs] = useState<string[]>([]);
  const [cmd, setCmd]   = useState('');
  const [sendingCmd, setSendingCmd] = useState(false);

  // Resources
  const [resources, setResources]     = useState<string[]>([]);
  const [loadingRes, setLoadingRes]   = useState(false);
  const [resFilter, setResFilter]     = useState('');
  const [resAction, setResAction]     = useState<string | null>(null);

  // Config
  const [cfgContent, setCfgContent] = useState('');
  const [cfgEdited, setCfgEdited]   = useState('');
  const [loadingCfg, setLoadingCfg] = useState(false);
  const [savingCfg, setSavingCfg]   = useState(false);

  // File explorer
  const [filePath, setFilePath]     = useState('');
  const [pathHistory, setPathHistory] = useState<string[]>([]);
  const [dirEntries, setDirEntries] = useState<FileEntry[]>([]);
  const [loadingDir, setLoadingDir] = useState(false);
  const [openFile, setOpenFile]     = useState<FileEntry | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [fileEdited, setFileEdited]   = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [savingFile, setSavingFile]   = useState(false);

  // Install
  const [installUrl, setInstallUrl]   = useState('');
  const [installName, setInstallName] = useState('');
  const [installing, setInstalling]   = useState<string | null>(null);
  const [installOut, setInstallOut]   = useState('');

  // Vehicles
  const [vehicleInstalling, setVehicleInstalling] = useState<string | null>(null);
  const [vehicleOut, setVehicleOut] = useState('');
  const [customVehUrl, setCustomVehUrl]   = useState('');
  const [customVehName, setCustomVehName] = useState('');

  // Health
  const [healthIssues, setHealthIssues]   = useState<HealthIssue[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [fixingIdx, setFixingIdx]         = useState<number | null>(null);

  // Server actions
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  useEffect(() => () => {
    wsRef.current?.close();
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (wsTimeout.current) clearTimeout(wsTimeout.current);
  }, []);

  const addLog = useCallback((line: unknown) => {
    setLogs(prev => [...prev.slice(-1499), String(line)]);
  }, []);

  // ── PM2 status refresh ─────────────────────────────────────────────────────
  const refreshStatuses = useCallback(async (api: BridgeApi) => {
    try {
      const procs = await api.pm2List();
      setServers(prev => prev.map(srv => {
        const proc = procs.find((p: any) =>
          p?.name === srv.processName ||
          p?.pm2_env?.name === srv.processName ||
          String(p?.name ?? '').toLowerCase() === srv.processName.toLowerCase()
        );
        // If pm2List returned results but this server wasn't in it → stopped
        const status = procs.length === 0
          ? 'unknown'
          : proc ? parsePm2Status(proc) : 'stopped';
        return { ...srv, status };
      }));
    } catch { /* keep existing status */ }
  }, []);

  // ── WebSocket ──────────────────────────────────────────────────────────────
  const openWs = useCallback((wsHost: string, key: string) => {
    if (wsTimeout.current) clearTimeout(wsTimeout.current);
    try {
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.onerror = null; try { wsRef.current.close(); } catch {} }
      setWsState('connecting');
      const ws = new WebSocket(`ws://${wsHost}?key=${encodeURIComponent(key)}`);
      let opened = false;
      ws.onopen    = () => { opened = true; setWsState('connected'); addLog('[Console] Live streaming connected'); };
      ws.onmessage = (e) => addLog(e.data);
      ws.onerror   = () => { if (!opened) setWsState('error'); };
      ws.onclose   = () => {
        setWsState(opened ? 'disconnected' : 'error');
        if (!opened) addLog('[Console] WebSocket failed — use the command box below to send commands manually');
      };
      wsRef.current = ws;
      wsTimeout.current = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          try { ws.close(); } catch {}
          setWsState('error');
          addLog('[Console] WS timed out after 8s — bridge may not expose WebSocket. Commands still work below.');
        }
      }, 8000);
    } catch (e) {
      setWsState('error');
      addLog(`[Console] WS init failed: ${e}`);
    }
  }, [addLog]);

  // ── Connect ────────────────────────────────────────────────────────────────
  const connect = async () => {
    const h = host.trim(); const k = apiKey.trim();
    if (!h || !k) { toast.error('Enter host and API key'); return; }
    setConnecting(true);
    try {
      const api = new BridgeApi(h, k);
      if (!await api.ping()) { toast.error('Cannot reach bridge at ' + h); return; }
      saveBridgeConfig({ host: h, apiKey: k });
      bridgeRef.current = api;
      setConnected(true);
      toast.success('Connected to bridge');
      try { setStats(await api.getStats()); } catch {}
      await refreshStatuses(api);
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(async () => {
        if (!bridgeRef.current) return;
        try { setStats(await bridgeRef.current.getStats()); } catch {}
        await refreshStatuses(bridgeRef.current);
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
    if (wsTimeout.current) clearTimeout(wsTimeout.current);
    bridgeRef.current = null;
    setConnected(false); setStats(null); setLogs([]); setWsState('disconnected');
    setServers(KNOWN_SERVERS.map(s => ({ ...s, status: 'unknown' as const })));
    setSelected(null);
    toast('Disconnected');
  };

  const selectServer = (srv: LinuxServer) => {
    setSelected(srv); setTab('overview');
    setResources([]); setCfgContent(''); setCfgEdited('');
    setHealthIssues([]); setInstallOut(''); setVehicleOut('');
    setOpenFile(null); setDirEntries([]);
    const root = srv.resourcesPath.split('/').slice(0, -1).join('/');
    setFilePath(root); setPathHistory([]);
  };

  // sync selected status
  useEffect(() => {
    if (!selected) return;
    const u = servers.find(s => s.processName === selected.processName);
    if (u && u.status !== selected.status) setSelected(u);
  }, [servers]);

  // ── Server Actions ─────────────────────────────────────────────────────────
  const serverAction = async (action: 'start' | 'stop' | 'restart') => {
    if (!bridgeRef.current || !selected) return;
    setActionLoading(action);
    addLog(`[Bridge] Sending ${action} → ${selected.processName}…`);
    try {
      if (action === 'start')   await bridgeRef.current.startServer(selected.processName);
      if (action === 'stop')    await bridgeRef.current.stopServer(selected.processName);
      if (action === 'restart') await bridgeRef.current.restartServer(selected.processName);
      toast.success(`${action} sent`);
      addLog(`[Bridge] ${action} OK — refreshing status in 3s…`);
      setTimeout(() => { if (bridgeRef.current) refreshStatuses(bridgeRef.current); }, 3000);
      setTimeout(() => { if (bridgeRef.current) refreshStatuses(bridgeRef.current); }, 8000);
    } catch (e: any) {
      toast.error(e?.message || `Failed to ${action}`);
      addLog(`[Error] ${action} failed: ${e?.message}`);
    } finally { setActionLoading(null); }
  };

  // ── Console ────────────────────────────────────────────────────────────────
  const sendConsoleCmd = async () => {
    if (!bridgeRef.current || !cmd.trim()) return;
    setSendingCmd(true);
    const c = cmd.trim(); setCmd('');
    addLog(`> ${c}`);
    try {
      const out = await bridgeRef.current.execute(c);
      if (out) out.split('\n').forEach(l => addLog(l));
    } catch (e: any) { addLog(`[Error] ${e?.message}`); }
    setSendingCmd(false);
  };

  // ── Resources ──────────────────────────────────────────────────────────────
  const loadResources = async () => {
    if (!bridgeRef.current || !selected) return;
    setLoadingRes(true);
    try { setResources(await bridgeRef.current.getResources(selected.resourcesPath)); }
    catch { toast.error('Failed to load resources'); }
    finally { setLoadingRes(false); }
  };

  const resourceCmd = async (name: string, action: 'restart' | 'stop' | 'start' | 'ensure') => {
    if (!bridgeRef.current) return;
    setResAction(`${action}:${name}`);
    try {
      const out = await bridgeRef.current.execute(`${action} ${name}`);
      toast.success(`${action} ${name}`);
      addLog(`[Resource] ${action} ${name}: ${out || 'OK'}`);
    } catch (e: any) { toast.error(e?.message || `Failed to ${action} ${name}`); }
    finally { setResAction(null); }
  };

  // ── Config ─────────────────────────────────────────────────────────────────
  const loadCfg = async () => {
    if (!bridgeRef.current || !selected) return;
    setLoadingCfg(true);
    try { const c = await bridgeRef.current.getServerCfg(selected.cfgPath); setCfgContent(c); setCfgEdited(c); }
    catch { toast.error('Failed to load config'); }
    finally { setLoadingCfg(false); }
  };

  const saveCfg = async () => {
    if (!bridgeRef.current || !selected) return;
    setSavingCfg(true);
    try { await bridgeRef.current.writeFile(selected.cfgPath, cfgEdited); setCfgContent(cfgEdited); toast.success('server.cfg saved'); }
    catch (e: any) { toast.error(e?.message || 'Save failed'); }
    finally { setSavingCfg(false); }
  };

  // ── File Explorer ──────────────────────────────────────────────────────────
  const loadDir = async (path: string, pushCurrent = true) => {
    if (!bridgeRef.current) return;
    setLoadingDir(true); setOpenFile(null);
    try {
      const entries = await bridgeRef.current.listFiles(path);
      const sorted = [...entries].sort((a, b) => a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name));
      setDirEntries(sorted);
      if (pushCurrent) setPathHistory(h => [...h, filePath]);
      setFilePath(path);
    } catch (e: any) { toast.error('Cannot open: ' + e?.message); }
    finally { setLoadingDir(false); }
  };

  const openFileForEdit = async (entry: FileEntry) => {
    if (!bridgeRef.current) return;
    setLoadingFile(true); setOpenFile(entry);
    try { const c = await bridgeRef.current.readFile(entry.path); setFileContent(c); setFileEdited(c); }
    catch (e: any) { toast.error('Cannot read: ' + e?.message); setOpenFile(null); }
    finally { setLoadingFile(false); }
  };

  const saveFile = async () => {
    if (!bridgeRef.current || !openFile) return;
    setSavingFile(true);
    try { await bridgeRef.current.writeFile(openFile.path, fileEdited); setFileContent(fileEdited); toast.success('Saved ' + openFile.name); }
    catch (e: any) { toast.error(e?.message || 'Save failed'); }
    finally { setSavingFile(false); }
  };

  const navBack = () => {
    if (pathHistory.length === 0) return;
    const prev = pathHistory[pathHistory.length - 1];
    setPathHistory(h => h.slice(0, -1));
    loadDir(prev, false);
  };

  const navUp = () => {
    const parent = filePath.split('/').slice(0, -1).join('/') || '/';
    setPathHistory(h => [...h, filePath]);
    loadDir(parent, false);
  };

  // ── Install ────────────────────────────────────────────────────────────────
  const installResource = async (url: string, name: string, isQuick = false) => {
    if (!bridgeRef.current || !selected) return;
    const folder = name.trim() || url.split('/').pop()?.replace('.git', '') || 'resource';
    setInstalling(folder); setInstallOut('');
    try {
      setInstallOut(`Cloning ${url} → ${folder}\n`);
      const out = await bridgeRef.current.execute(`cd "${selected.resourcesPath}" && git clone "${url}" "${folder}" 2>&1`);
      setInstallOut(p => p + (out || 'Done.') + `\n\nAdd "ensure ${folder}" to server.cfg to activate.`);
      toast.success('Installed ' + folder);
      if (!isQuick) { setInstallUrl(''); setInstallName(''); }
      if (resources.length > 0) loadResources();
    } catch (e: any) {
      setInstallOut(p => p + `\nError: ${e?.message}`);
      toast.error('Install failed');
    } finally { setInstalling(null); }
  };

  // ── Vehicles ───────────────────────────────────────────────────────────────
  const installVehiclePack = async (url: string, name: string) => {
    if (!bridgeRef.current || !selected) return;
    const folder = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    setVehicleInstalling(folder); setVehicleOut('');
    try {
      setVehicleOut(`Installing: ${name}\ngit clone ${url} → ${folder}\n\n`);
      const out = await bridgeRef.current.execute(`cd "${selected.resourcesPath}" && git clone "${url}" "${folder}" 2>&1`);
      setVehicleOut(p => p + (out || 'Done.') + `\n\nAdd "ensure ${folder}" to server.cfg.`);
      toast.success('Installed ' + name);
      if (resources.length > 0) loadResources();
    } catch (e: any) {
      setVehicleOut(p => p + `\nError: ${e?.message}`);
      toast.error('Install failed');
    } finally { setVehicleInstalling(null); }
  };

  // ── Health ─────────────────────────────────────────────────────────────────
  const runHealth = async () => {
    if (!bridgeRef.current || !selected) return;
    setHealthLoading(true);
    try {
      let cfg = cfgContent;
      if (!cfg) { cfg = await bridgeRef.current.getServerCfg(selected.cfgPath); setCfgContent(cfg); setCfgEdited(cfg); }
      setHealthIssues(analyzeConfig(cfg, selected.framework));
    } catch { toast.error('Could not load config for health check'); }
    finally { setHealthLoading(false); }
  };

  const autoFix = async (issue: HealthIssue, idx: number) => {
    if (!bridgeRef.current || !selected || !issue.cfgPatch) return;
    setFixingIdx(idx);
    try {
      let cfg = cfgEdited || cfgContent;
      if (!cfg) { cfg = await bridgeRef.current.getServerCfg(selected.cfgPath); }
      const newCfg = cfg.trimEnd() + '\n' + issue.cfgPatch.trim() + '\n';
      await bridgeRef.current.writeFile(selected.cfgPath, newCfg);
      setCfgContent(newCfg); setCfgEdited(newCfg);
      toast.success('Fixed: ' + issue.message);
      setHealthIssues(analyzeConfig(newCfg, selected.framework));
    } catch (e: any) { toast.error(e?.message || 'Fix failed'); }
    finally { setFixingIdx(null); }
  };

  // Auto-load tab data
  useEffect(() => {
    if (!connected || !selected) return;
    if (tab === 'resources' && resources.length === 0) loadResources();
    if (tab === 'config' && !cfgContent) loadCfg();
    if (tab === 'health' && healthIssues.length === 0) runHealth();
    if (tab === 'files' && dirEntries.length === 0 && filePath) loadDir(filePath, false);
  }, [tab, selected]);

  // ── Tab definitions ────────────────────────────────────────────────────────
  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview',  label: 'Overview',  icon: <Activity size={12} /> },
    { id: 'console',   label: 'Console',   icon: <Terminal size={12} /> },
    { id: 'resources', label: 'Resources', icon: <Package size={12} /> },
    { id: 'config',    label: 'Config',    icon: <FileCode size={12} /> },
    { id: 'files',     label: 'Files',     icon: <FolderOpen size={12} /> },
    { id: 'install',   label: 'Install',   icon: <Download size={12} /> },
    { id: 'vehicles',  label: 'Vehicles',  icon: <Car size={12} /> },
    { id: 'health',    label: 'Health',    icon: <HeartPulse size={12} /> },
  ];

  const wsDot = { connected: 'bg-green-400', connecting: 'bg-amber-400 animate-pulse', error: 'bg-red-500', disconnected: 'bg-surface-600' }[wsState];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col overflow-hidden">

      {/* Connection Bar */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-overlay-6 bg-surface-950/60 backdrop-blur-sm flex-wrap">
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
              <span className="font-semibold text-surface-200">{fmt(stats.cpu)}%</span> CPU
            </div>
            <div className="flex items-center gap-1.5 text-xs text-surface-400">
              <HardDrive size={12} className="text-indigo-400" />
              <span className="font-semibold text-surface-200">{fmt(stats.ram_used)}/{fmt(stats.ram_total)} GB</span> RAM
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">

        {/* Server sidebar */}
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
          {!connected && <p className="text-center text-xs text-surface-600 px-3 mt-2">Connect above to manage</p>}
        </div>

        {/* Main panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <Server size={48} className="text-surface-700 mb-4" />
              <p className="text-surface-400 font-medium mb-1">No server selected</p>
              <p className="text-xs text-surface-600">{connected ? 'Pick a server on the left' : 'Connect to bridge first'}</p>
            </div>
          ) : (
            <>
              {/* Server header */}
              <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-overlay-6 flex-wrap gap-y-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-surface-100">{selected.name}</h2>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${FW_BADGE[selected.framework] ?? ''}`}>{selected.framework}</span>
                    <span className={`text-[10px] font-semibold ${(SC[selected.status] ?? SC.unknown).cls}`}>
                      ● {(SC[selected.status] ?? SC.unknown).text}
                    </span>
                  </div>
                  <p className="text-xs text-surface-500 mt-0.5 font-mono">{selected.processName}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {(['start', 'stop', 'restart'] as const).map(a => {
                    const styles = { start: 'bg-green-600/20 text-green-400 border-green-500/30 hover:bg-green-600/30', stop: 'bg-red-600/20 text-red-400 border-red-500/30 hover:bg-red-600/30', restart: 'bg-amber-600/20 text-amber-400 border-amber-500/30 hover:bg-amber-600/30' }[a];
                    const Icon = { start: Play, stop: Square, restart: RefreshCw }[a];
                    return (
                      <button key={a} onClick={() => serverAction(a)} disabled={!!actionLoading}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-all disabled:opacity-40 capitalize ${styles}`}>
                        {actionLoading === a ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}{a}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tabs */}
              <div className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-overlay-6 overflow-x-auto">
                {TABS.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${tab === t.id ? 'bg-primary-600/20 text-primary-300 border border-primary-500/25' : 'text-surface-400 hover:text-surface-200 hover:bg-overlay-4'}`}>
                    {t.icon}{t.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-auto p-5">

                {/* OVERVIEW */}
                {tab === 'overview' && (
                  <div className="space-y-4 max-w-2xl">
                    <div className="glass-panel p-4 flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${(SC[selected.status] ?? SC.unknown).dot}`} />
                      <span className="text-sm font-medium text-surface-200">
                        {selected.name} is <span className={(SC[selected.status] ?? SC.unknown).cls}>{(SC[selected.status] ?? SC.unknown).text}</span>
                      </span>
                      <button onClick={() => { if (bridgeRef.current) refreshStatuses(bridgeRef.current); }} className="ml-auto text-xs text-surface-500 hover:text-surface-300 flex items-center gap-1">
                        <RefreshCw size={11} /> Refresh
                      </button>
                    </div>
                    {stats ? (
                      <div className="grid grid-cols-2 gap-4">
                        {[
                          { label: 'CPU', val: fmt(stats.cpu) + '%', pct: stats.cpu, from: 'from-primary-700', to: 'to-primary-400', textCls: 'text-primary-300', icon: <Cpu size={15} className="text-primary-400" />, sub: null },
                          { label: 'RAM', val: fmt(stats.ram_percent, 0) + '%', pct: stats.ram_percent, from: 'from-indigo-700', to: 'to-indigo-400', textCls: 'text-indigo-300', icon: <HardDrive size={15} className="text-indigo-400" />, sub: `${fmt(stats.ram_used)} / ${fmt(stats.ram_total)} GB` },
                        ].map(c => (
                          <div key={c.label} className="glass-panel p-4">
                            <div className="flex items-center gap-2 mb-3">
                              {c.icon}
                              <span className="text-sm font-medium text-surface-200">{c.label}</span>
                              <span className={`ml-auto text-xl font-bold ${c.textCls}`}>{c.val}</span>
                            </div>
                            <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
                              <motion.div animate={{ width: `${clamp(c.pct)}%` }} transition={{ duration: 0.5 }}
                                className={`h-full bg-gradient-to-r ${c.from} ${c.to} rounded-full`} />
                            </div>
                            {c.sub && <p className="text-[11px] text-surface-500 mt-1.5 text-right">{c.sub}</p>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="glass-panel p-8 flex items-center justify-center text-surface-600 gap-2">
                        <Loader2 size={16} className="animate-spin" /> Loading stats…
                      </div>
                    )}
                    <div className="glass-panel p-4 space-y-2.5">
                      {[
                        { icon: <Package size={13} />, label: 'Resources Path', val: selected.resourcesPath },
                        { icon: <FileCode size={13} />, label: 'Config', val: selected.cfgPath },
                        { icon: <Server size={13} />, label: 'PM2 Name', val: selected.processName },
                      ].map((row, i) => (
                        <div key={i} className={`flex items-start gap-3 ${i > 0 ? 'border-t border-overlay-4 pt-2.5' : ''}`}>
                          <span className="text-surface-500 shrink-0 mt-0.5">{row.icon}</span>
                          <div>
                            <p className="text-[10px] text-surface-600 mb-0.5 uppercase tracking-wider">{row.label}</p>
                            <p className="text-xs text-surface-400 font-mono break-all">{row.val}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* CONSOLE */}
                {tab === 'console' && (
                  <div className="h-full flex flex-col gap-2" style={{ minHeight: 420 }}>
                    <div className="flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${wsDot}`} />
                        <span className="text-xs text-surface-500 capitalize">{wsState}</span>
                        {(wsState === 'error' || wsState === 'disconnected') && connected && (
                          <button onClick={() => openWs(host, apiKey)} className="text-xs text-primary-400 hover:text-primary-300 ml-1">Reconnect</button>
                        )}
                      </div>
                      <button onClick={() => setLogs([])} className="text-xs text-surface-500 hover:text-surface-300">Clear</button>
                    </div>
                    <div className="flex-1 overflow-auto font-mono text-xs bg-black/50 rounded-xl border border-overlay-6 p-3">
                      {logs.length === 0 ? (
                        <p className="text-surface-600 text-center mt-8">
                          {connected ? 'Waiting for logs — or type a command below' : 'Connect first'}
                        </p>
                      ) : logs.map((l, i) => (
                        <div key={i} className={`leading-5 break-all whitespace-pre-wrap ${l.startsWith('[Error]') ? 'text-red-400/80' : l.startsWith('>') ? 'text-amber-300' : l.startsWith('[Bridge]') || l.startsWith('[Console]') ? 'text-blue-300/80' : l.startsWith('[Resource]') ? 'text-cyan-300/80' : 'text-green-300/80'}`}>{l}</div>
                      ))}
                      <div ref={logsEndRef} />
                    </div>
                    <div className="shrink-0 flex gap-2">
                      <input value={cmd} onChange={e => setCmd(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') sendConsoleCmd(); }}
                        placeholder="FXServer or shell command — e.g. restart ox_inventory  or  pm2 list"
                        className="flex-1 px-3 py-2 text-sm bg-overlay-4 border border-overlay-6 rounded-lg text-surface-200 placeholder-surface-600 focus:outline-none focus:border-primary-500/40 font-mono" />
                      <button onClick={sendConsoleCmd} disabled={sendingCmd || !cmd.trim()}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium btn-primary disabled:opacity-50">
                        {sendingCmd ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Send
                      </button>
                    </div>
                  </div>
                )}

                {/* RESOURCES */}
                {tab === 'resources' && (
                  <div>
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <input value={resFilter} onChange={e => setResFilter(e.target.value)} placeholder="Filter…"
                        className="flex-1 max-w-xs px-3 py-1.5 text-sm bg-overlay-4 border border-overlay-6 rounded-lg text-surface-200 placeholder-surface-600 focus:outline-none" />
                      <span className="text-xs text-surface-500">{resources.length} resources</span>
                      <button onClick={loadResources} disabled={loadingRes}
                        className="flex items-center gap-1.5 text-xs btn-secondary px-3 py-1.5 ml-auto">
                        {loadingRes ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Refresh
                      </button>
                    </div>
                    {loadingRes ? (
                      <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-primary-500" /></div>
                    ) : resources.length === 0 ? (
                      <div className="flex flex-col items-center py-12 text-surface-600 gap-2">
                        <Package size={36} className="opacity-40" /><p className="text-sm">No resources found</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {resources.filter(r => !resFilter || r.toLowerCase().includes(resFilter.toLowerCase())).map(name => (
                          <div key={name} className="flex items-center gap-2 px-3 py-2 bg-overlay-4 border border-overlay-6 rounded-xl group">
                            <Package size={12} className="text-surface-600 shrink-0" />
                            <span className="text-xs text-surface-300 flex-1 truncate font-mono">{name}</span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {(['restart', 'start', 'stop', 'ensure'] as const).map(a => (
                                <button key={a} onClick={() => resourceCmd(name, a)} disabled={!!resAction}
                                  className={`text-[10px] px-2 py-0.5 rounded font-medium transition-all disabled:opacity-50 ${a === 'restart' ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30' : a === 'start' ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30' : a === 'stop' ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30' : 'bg-primary-500/20 text-primary-300 hover:bg-primary-500/30'}`}>
                                  {resAction === `${a}:${name}` ? '…' : a}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* CONFIG */}
                {tab === 'config' && (
                  <div className="flex flex-col gap-3" style={{ minHeight: 420 }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-surface-500 font-mono truncate flex-1">{selected.cfgPath}</p>
                      <button onClick={loadCfg} disabled={loadingCfg} className="flex items-center gap-1.5 text-xs btn-secondary px-3 py-1.5">
                        {loadingCfg ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Reload
                      </button>
                      <button onClick={saveCfg} disabled={savingCfg || cfgEdited === cfgContent || !cfgEdited}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-600/20 text-green-400 border border-green-500/30 rounded-lg hover:bg-green-600/30 disabled:opacity-40 font-medium">
                        {savingCfg ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                      </button>
                    </div>
                    {cfgEdited !== cfgContent && cfgEdited && <p className="text-[10px] text-amber-400">● Unsaved changes</p>}
                    {loadingCfg ? (
                      <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-primary-500" /></div>
                    ) : (
                      <textarea value={cfgEdited} onChange={e => setCfgEdited(e.target.value)}
                        placeholder="Click Reload to load server.cfg…" spellCheck={false}
                        className="font-mono text-xs bg-black/50 rounded-xl border border-overlay-6 p-4 text-green-300/90 resize-none focus:outline-none focus:border-primary-500/30"
                        style={{ minHeight: 380 }} />
                    )}
                  </div>
                )}

                {/* FILES */}
                {tab === 'files' && (
                  <div className="flex flex-col gap-3" style={{ minHeight: 420 }}>
                    {/* Toolbar */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={navBack} disabled={pathHistory.length === 0}
                        className="flex items-center gap-1 text-xs btn-secondary px-2.5 py-1.5 disabled:opacity-40">
                        <ChevronLeft size={12} /> Back
                      </button>
                      <button onClick={navUp} className="flex items-center gap-1 text-xs btn-secondary px-2.5 py-1.5">
                        <ArrowUp size={12} /> Up
                      </button>
                      <div className="flex-1 px-3 py-1.5 bg-overlay-4 border border-overlay-6 rounded-lg font-mono text-xs text-surface-400 truncate min-w-0">
                        {filePath || '/'}
                      </div>
                      <button onClick={() => loadDir(filePath, false)} disabled={loadingDir}
                        className="flex items-center gap-1 text-xs btn-secondary px-2.5 py-1.5">
                        {loadingDir ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      </button>
                      {openFile && (
                        <button onClick={() => { setOpenFile(null); loadDir(filePath, false); }}
                          className="text-xs text-surface-400 hover:text-surface-200 px-2">✕ Close</button>
                      )}
                    </div>

                    {openFile ? (
                      <div className="flex flex-col gap-2" style={{ minHeight: 360 }}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-surface-400 font-mono">{openFile.name}</span>
                          {fileEdited !== fileContent && <span className="text-[10px] text-amber-400">● Unsaved</span>}
                          <button onClick={saveFile} disabled={savingFile || fileEdited === fileContent}
                            className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-600/20 text-green-400 border border-green-500/30 rounded-lg hover:bg-green-600/30 disabled:opacity-40 font-medium">
                            {savingFile ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                          </button>
                        </div>
                        {loadingFile ? (
                          <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-primary-500" /></div>
                        ) : (
                          <textarea value={fileEdited} onChange={e => setFileEdited(e.target.value)} spellCheck={false}
                            className="font-mono text-xs bg-black/50 rounded-xl border border-overlay-6 p-4 text-green-300/90 resize-none focus:outline-none focus:border-primary-500/30"
                            style={{ minHeight: 360 }} />
                        )}
                      </div>
                    ) : loadingDir ? (
                      <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-primary-500" /></div>
                    ) : dirEntries.length === 0 ? (
                      <div className="flex flex-col items-center py-12 text-surface-600 gap-2">
                        <FolderOpen size={36} className="opacity-40" />
                        <p className="text-sm">Empty or could not load directory</p>
                        <button onClick={() => loadDir(filePath, false)} className="text-xs text-primary-400 hover:text-primary-300">Retry</button>
                      </div>
                    ) : (
                      <div className="space-y-0.5 overflow-auto" style={{ maxHeight: 480 }}>
                        {dirEntries.map(entry => (
                          <button key={entry.path} onClick={() => entry.type === 'dir' ? loadDir(entry.path) : openFileForEdit(entry)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-overlay-4 text-left transition-all group">
                            {entry.type === 'dir'
                              ? <FolderOpen size={14} className="text-amber-400 shrink-0" />
                              : <FileIcon size={14} className="text-surface-500 shrink-0" />}
                            <span className={`text-sm truncate ${entry.type === 'dir' ? 'text-surface-200 font-medium' : 'text-surface-400'}`}>{entry.name}</span>
                            <span className="ml-auto text-[10px] text-surface-600 opacity-0 group-hover:opacity-100">
                              {entry.type === 'dir' ? 'Open' : 'Edit'}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* INSTALL */}
                {tab === 'install' && (
                  <div className="space-y-5 max-w-2xl">
                    {/* Custom URL install */}
                    <div className="glass-panel p-5 space-y-3">
                      <h3 className="font-semibold text-surface-200 flex items-center gap-2"><Download size={15} /> Install from GitHub URL</h3>
                      <p className="text-xs text-surface-500">Runs git clone directly on your Linux server.</p>
                      <input value={installUrl} onChange={e => setInstallUrl(e.target.value)}
                        placeholder="https://github.com/user/repo.git"
                        className="w-full px-3 py-2 text-sm bg-overlay-4 border border-overlay-6 rounded-lg text-surface-200 placeholder-surface-600 focus:outline-none focus:border-primary-500/40" />
                      <input value={installName} onChange={e => setInstallName(e.target.value)}
                        placeholder="Folder name (optional)"
                        className="w-full px-3 py-2 text-sm bg-overlay-4 border border-overlay-6 rounded-lg text-surface-200 placeholder-surface-600 focus:outline-none focus:border-primary-500/40" />
                      <button onClick={() => installResource(installUrl.trim(), installName.trim())}
                        disabled={!!installing || !installUrl.trim()}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium btn-primary disabled:opacity-50">
                        {installing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                        {installing ? `Installing ${installing}…` : 'Install'}
                      </button>
                    </div>

                    {installOut && (
                      <div>
                        <p className="text-xs text-surface-500 mb-1">Output</p>
                        <pre className="font-mono text-xs bg-black/50 rounded-xl border border-overlay-6 p-4 text-green-300/80 whitespace-pre-wrap max-h-40 overflow-auto">{installOut}</pre>
                      </div>
                    )}

                    {/* Quick install presets */}
                    <div className="glass-panel p-5">
                      <h3 className="font-semibold text-surface-200 flex items-center gap-2 mb-3"><Zap size={14} /> Quick Install — Popular Resources</h3>
                      <div className="space-y-1.5">
                        {QUICK_RESOURCES.map(r => (
                          <div key={r.name} className="flex items-center gap-3 px-3 py-2 bg-overlay-4 border border-overlay-6 rounded-xl">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-surface-200 font-mono">{r.name}</p>
                              <p className="text-[10px] text-surface-500">{r.desc}</p>
                            </div>
                            <button onClick={() => installResource(r.repo, r.name, true)}
                              disabled={!!installing}
                              className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium btn-primary disabled:opacity-50 shrink-0">
                              {installing === r.name ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />} Install
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Update installed */}
                    {resources.length > 0 && (
                      <div className="glass-panel p-5">
                        <h3 className="font-semibold text-surface-200 flex items-center gap-2 mb-3"><RotateCcw size={14} /> Update Installed (git pull)</h3>
                        <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                          {resources.map(name => (
                            <button key={name} onClick={async () => {
                              if (!bridgeRef.current || !selected) return;
                              setResAction(`update:${name}`);
                              try {
                                const out = await bridgeRef.current.execute(`cd "${selected.resourcesPath}/${name}" && git pull 2>&1`);
                                setInstallOut(`git pull ${name}:\n${out || 'Already up to date'}`);
                                toast.success('Updated ' + name);
                              } catch (e: any) { toast.error(e?.message); }
                              setResAction(null);
                            }} disabled={!!resAction}
                              className="flex items-center gap-1 px-2 py-1.5 text-[10px] bg-overlay-4 border border-overlay-6 rounded-lg text-surface-300 hover:bg-overlay-6 transition-all truncate disabled:opacity-50">
                              {resAction === `update:${name}` ? <Loader2 size={9} className="animate-spin shrink-0" /> : <RotateCcw size={9} className="shrink-0" />}
                              <span className="truncate">{name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* VEHICLES */}
                {tab === 'vehicles' && (
                  <div className="space-y-5 max-w-2xl">
                    <div>
                      <h3 className="text-sm font-semibold text-surface-200 mb-1 flex items-center gap-2"><Car size={15} /> Vehicle & Transport Resources</h3>
                      <p className="text-xs text-surface-500 mb-4">All open-source. Installs via git clone into your resources folder.</p>
                      <div className="space-y-2">
                        {VEHICLE_PACKS.map(pack => (
                          <div key={pack.name} className="glass-panel p-3.5 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-surface-200 font-mono">{pack.name}</p>
                              <p className="text-xs text-surface-500 mt-0.5">{pack.desc}</p>
                            </div>
                            <button onClick={() => installVehiclePack(pack.repo, pack.name)}
                              disabled={!!vehicleInstalling}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium btn-primary disabled:opacity-50 shrink-0">
                              {vehicleInstalling === pack.name.toLowerCase().replace(/[^a-z0-9_]/g, '_') ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Install
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="glass-panel p-5 space-y-3">
                      <h3 className="font-semibold text-surface-200 flex items-center gap-2"><Car size={14} /> Custom Vehicle Pack URL</h3>
                      <input value={customVehUrl} onChange={e => setCustomVehUrl(e.target.value)}
                        placeholder="https://github.com/user/vehicle-pack.git"
                        className="w-full px-3 py-2 text-sm bg-overlay-4 border border-overlay-6 rounded-lg text-surface-200 placeholder-surface-600 focus:outline-none" />
                      <input value={customVehName} onChange={e => setCustomVehName(e.target.value)}
                        placeholder="Folder name (optional)"
                        className="w-full px-3 py-2 text-sm bg-overlay-4 border border-overlay-6 rounded-lg text-surface-200 placeholder-surface-600 focus:outline-none" />
                      <button onClick={() => { if (customVehUrl.trim()) installVehiclePack(customVehUrl.trim(), customVehName.trim() || customVehUrl.split('/').pop() || 'vehicle_pack'); }}
                        disabled={!!vehicleInstalling || !customVehUrl.trim()}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium btn-primary disabled:opacity-50">
                        {vehicleInstalling ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Install Custom
                      </button>
                    </div>

                    {vehicleOut && (
                      <div>
                        <p className="text-xs text-surface-500 mb-1">Output</p>
                        <pre className="font-mono text-xs bg-black/50 rounded-xl border border-overlay-6 p-4 text-green-300/80 whitespace-pre-wrap max-h-40 overflow-auto">{vehicleOut}</pre>
                      </div>
                    )}
                  </div>
                )}

                {/* HEALTH */}
                {tab === 'health' && (
                  <div className="space-y-3 max-w-2xl">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-surface-200 flex items-center gap-2"><HeartPulse size={15} /> Config Health Scanner</h3>
                      <button onClick={runHealth} disabled={healthLoading}
                        className="flex items-center gap-1.5 text-xs btn-secondary px-3 py-1.5">
                        {healthLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Re-scan
                      </button>
                    </div>

                    {healthLoading && <div className="flex items-center justify-center py-10"><Loader2 size={24} className="animate-spin text-primary-500" /></div>}

                    {!healthLoading && healthIssues.length === 0 && (
                      <div className="flex flex-col items-center py-12 text-surface-600 gap-2">
                        <HeartPulse size={32} className="opacity-40" />
                        <p className="text-sm">Click Re-scan to analyze server.cfg</p>
                      </div>
                    )}

                    {!healthLoading && healthIssues.length > 0 && (
                      <div className="space-y-2">
                        {healthIssues.map((issue, i) => {
                          const isOk = issue.severity === 'ok';
                          const Icon = isOk ? CheckCircle2 : issue.severity === 'error' ? AlertCircle : issue.severity === 'warning' ? AlertTriangle : Info;
                          const c = isOk ? 'border-green-500/30 bg-green-400/10 text-green-400'
                                  : issue.severity === 'error' ? 'border-red-500/30 bg-red-400/10 text-red-400'
                                  : issue.severity === 'warning' ? 'border-amber-500/30 bg-amber-400/10 text-amber-400'
                                  : 'border-blue-500/30 bg-blue-400/10 text-blue-400';
                          return (
                            <div key={i} className={`flex items-start gap-3 p-3.5 rounded-xl border ${c}`}>
                              <Icon size={15} className="shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{issue.message}</p>
                                {issue.suggestion && (
                                  <p className="text-xs opacity-70 mt-0.5 font-mono">{issue.suggestion}</p>
                                )}
                              </div>
                              {issue.cfgPatch && !isOk && (
                                <button onClick={() => autoFix(issue, i)} disabled={fixingIdx === i}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium bg-white/10 hover:bg-white/20 rounded-lg transition-all shrink-0 disabled:opacity-50">
                                  {fixingIdx === i ? <Loader2 size={10} className="animate-spin" /> : <Wrench size={10} />} Auto-fix
                                </button>
                              )}
                            </div>
                          );
                        })}
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
