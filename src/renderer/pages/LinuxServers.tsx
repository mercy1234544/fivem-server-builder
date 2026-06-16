import React, { Component, useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Server, Wifi, WifiOff, Play, Square, RefreshCw, Terminal, Package,
  FileCode, Cpu, HardDrive, Loader2, ChevronRight, Eye, EyeOff, Globe,
  Activity, AlertTriangle, CheckCircle2, AlertCircle, Info, Send,
  Download, Save, Wrench, HeartPulse, RotateCcw, FolderOpen,
  File as FileIcon, ChevronLeft, Car, ArrowUp, Settings, Upload,
  X, CheckCircle,
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

// ── Types ──────────────────────────────────────────────────────────────────────
interface LinuxServer {
  name: string; framework: string; processName: string;
  resourcesPath: string; cfgPath: string;
  status: 'online' | 'stopped' | 'error' | 'unknown';
}
interface UploadItem {
  id: string; name: string; size: number;
  status: 'uploading' | 'extracting' | 'done' | 'error';
  progress: number; output?: string;
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
};
const SC = {
  online:  { dot: 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]', text: 'Online',    cls: 'text-green-400' },
  stopped: { dot: 'bg-surface-600',                                       text: 'Stopped',   cls: 'text-surface-500' },
  error:   { dot: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]',     text: 'Error',     cls: 'text-red-400' },
  unknown: { dot: 'bg-amber-400/60 animate-pulse',                         text: 'Checking…', cls: 'text-amber-400/70' },
} as const;

const VEHICLE_PACKS = [
  { name: 'qb-vehicleshop',    repo: 'https://github.com/qbcore-framework/qb-vehicleshop.git',    desc: 'QBCore vehicle dealership' },
  { name: 'qb-vehiclekeys',    repo: 'https://github.com/qbcore-framework/qb-vehiclekeys.git',    desc: 'Vehicle key system' },
  { name: 'qb-garages',        repo: 'https://github.com/qbcore-framework/qb-garages.git',        desc: 'Garage system' },
  { name: 'ox_fuel',           repo: 'https://github.com/overextended/ox_fuel.git',               desc: 'Fuel system with station support' },
  { name: 'ox_appearance',     repo: 'https://github.com/overextended/ox_appearance.git',         desc: 'Vehicle & ped appearance' },
  { name: 'wasabi_carjacking', repo: 'https://github.com/wasabscripts/wasabi_carjacking.git',     desc: 'Open source carjacking system' },
];
const QUICK_RESOURCES = [
  { name: 'ox_lib',            repo: 'https://github.com/overextended/ox_lib.git',                desc: 'Core utility library' },
  { name: 'oxmysql',           repo: 'https://github.com/overextended/oxmysql.git',               desc: 'Async MySQL library' },
  { name: 'ox_inventory',      repo: 'https://github.com/overextended/ox_inventory.git',          desc: 'Advanced inventory system' },
  { name: 'ox_target',         repo: 'https://github.com/overextended/ox_target.git',             desc: 'Entity targeting system' },
  { name: 'qb-core',           repo: 'https://github.com/qbcore-framework/qb-core.git',           desc: 'QBCore framework core' },
  { name: 'qb-hud',            repo: 'https://github.com/qbcore-framework/qb-hud.git',            desc: 'QBCore HUD' },
  { name: 'qb-phone',          repo: 'https://github.com/qbcore-framework/qb-phone.git',          desc: 'Smartphone system' },
  { name: 'qb-banking',        repo: 'https://github.com/qbcore-framework/qb-banking.git',        desc: 'Banking system' },
];

type Tab = 'overview' | 'console' | 'resources' | 'config' | 'files' | 'install' | 'vehicles' | 'health';

function fmt(n: any, dec = 1) { const v = Number(n); return isFinite(v) ? v.toFixed(dec) : '—'; }
function clamp(n: any) { const v = Number(n); return isFinite(v) ? Math.min(Math.max(v, 0), 100) : 0; }
function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Health ────────────────────────────────────────────────────────────────────
interface HealthIssue { severity: 'error'|'warning'|'info'|'ok'; message: string; suggestion: string; cfgPatch?: string; }
function analyzeConfig(cfg: string, framework: string): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const low = cfg.toLowerCase();
  const has = (s: string) => low.includes(s.toLowerCase());
  if (!has('sv_licensekey') && !has('sv_license'))
    issues.push({ severity:'error', message:'No license key found', suggestion:'sv_licenseKey "cfxk_your_key"', cfgPatch:'\nsv_licenseKey "cfxk_your_key_here"\n' });
  if (!has('onesync'))
    issues.push({ severity:'warning', message:'OneSync not configured', suggestion:'set onesync on', cfgPatch:'\nset onesync on\n' });
  if (!has('sv_maxclients'))
    issues.push({ severity:'info', message:'sv_maxClients not set', suggestion:'sv_maxClients 64', cfgPatch:'\nsv_maxClients 64\n' });
  if (!has('mysql_connection_string') && !has('set mysql') && !has('oxmysql'))
    issues.push({ severity:'warning', message:'No MySQL connection string', suggestion:'set mysql_connection_string "mysql://root:pass@localhost/fivem"', cfgPatch:'\nset mysql_connection_string "mysql://root:pass@localhost/fivem"\n' });
  if ((framework==='Qbox'||framework==='QBCore') && !has('ox_lib'))
    issues.push({ severity:'warning', message:'ox_lib not ensured in config', suggestion:'ensure ox_lib', cfgPatch:'\nensure ox_lib\n' });
  if ((framework==='Qbox'||framework==='QBCore') && !has('oxmysql'))
    issues.push({ severity:'warning', message:'oxmysql not ensured in config', suggestion:'ensure oxmysql', cfgPatch:'\nensure oxmysql\n' });
  if (!has('sv_hostname'))
    issues.push({ severity:'info', message:'Server hostname not set', suggestion:'sv_hostname "My FiveM Server"', cfgPatch:'\nsv_hostname "My FiveM Server"\n' });
  if (issues.length === 0)
    issues.push({ severity:'ok', message:'All checks passed — config looks great!', suggestion:'' });
  return issues;
}

// ── Upload Queue Item ─────────────────────────────────────────────────────────
function QueueItem({ item, onDismiss }: { item: UploadItem; onDismiss: () => void }) {
  const icon = item.status === 'done'  ? <CheckCircle size={14} className="text-green-400 shrink-0" />
             : item.status === 'error' ? <AlertCircle size={14} className="text-red-400 shrink-0" />
             : <Loader2 size={14} className="animate-spin text-primary-400 shrink-0" />;
  const statusText = { uploading:'Uploading…', extracting:'Extracting…', done:'Done', error:'Failed' }[item.status];
  return (
    <div className="glass-panel p-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium text-surface-200 truncate flex-1">{item.name}</span>
        <span className="text-[10px] text-surface-500 shrink-0">{fmtSize(item.size)}</span>
        {(item.status==='done'||item.status==='error') && (
          <button onClick={onDismiss} className="text-surface-600 hover:text-surface-300 ml-1"><X size={12}/></button>
        )}
      </div>
      {(item.status==='uploading'||item.status==='extracting') && (
        <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden">
          <motion.div animate={{ width:`${item.progress}%` }} className="h-full bg-primary-500 rounded-full" />
        </div>
      )}
      <span className={`text-[10px] font-medium ${item.status==='error'?'text-red-400':item.status==='done'?'text-green-400':'text-surface-500'}`}>
        {statusText}{item.status==='uploading'?` ${item.progress}%`:''}
      </span>
      {item.output && (item.status==='done'||item.status==='error') && (
        <pre className="text-[10px] text-surface-500 font-mono whitespace-pre-wrap max-h-16 overflow-auto">{item.output.slice(0,300)}</pre>
      )}
    </div>
  );
}

// ── Drop Zone ─────────────────────────────────────────────────────────────────
function DropZone({ onFiles, accept, heading, sub, tags, accent='primary', fileInputRef }: {
  onFiles: (f: File[]) => void; accept?: string;
  heading: string; sub: string; tags: string[];
  accent?: 'primary'|'amber';
  fileInputRef: React.RefObject<HTMLInputElement>;
}) {
  const [over, setOver] = useState(false);
  const isAmber = accent==='amber';
  const border = over
    ? (isAmber ? 'border-amber-400/50 bg-amber-500/8' : 'border-primary-400/50 bg-primary-500/8')
    : (isAmber ? 'border-amber-500/20 hover:border-amber-500/35 hover:bg-amber-500/4' : 'border-primary-500/20 hover:border-primary-500/35 hover:bg-primary-500/4');
  const iconCls = isAmber ? 'bg-amber-500/15 border-amber-500/20 text-amber-400' : 'bg-primary-500/15 border-primary-500/20 text-primary-400';
  const btnCls  = isAmber ? 'bg-amber-500 hover:bg-amber-400 text-black' : 'btn-primary';

  return (
    <div
      onDrop={e => { e.preventDefault(); setOver(false); const files=Array.from(e.dataTransfer.files).filter(f=>f.size>0); if(files.length) onFiles(files); }}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onClick={() => fileInputRef.current?.click()}
      className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center text-center cursor-pointer transition-all ${border}`}
    >
      <input ref={fileInputRef} type="file" accept={accept} multiple className="hidden"
        onChange={e => { const f=Array.from(e.target.files||[]); if(f.length) onFiles(f); e.target.value=''; }} />
      <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center mb-4 ${iconCls}`}>
        {isAmber ? <Car size={28}/> : <Upload size={28}/>}
      </div>
      <h3 className="text-base font-bold text-surface-100 mb-1.5">{heading}</h3>
      <p className="text-sm text-surface-400 mb-4">{sub}</p>
      <div className="flex flex-wrap gap-1.5 justify-center mb-5">
        {tags.map(t => <span key={t} className="text-[11px] px-2.5 py-0.5 rounded-full bg-overlay-4 border border-overlay-6 text-surface-400">{t}</span>)}
      </div>
      <span className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold pointer-events-none ${btnCls}`}>
        <Upload size={15}/> Browse Files
      </span>
    </div>
  );
}

// ── GitHub URL secondary ──────────────────────────────────────────────────────
function GitHubInstall({ label, onInstall, loading }: { label: string; onInstall:(url:string,name:string)=>void; loading:boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl]   = useState('');
  const [name, setName] = useState('');
  return (
    <div className="border border-overlay-6 rounded-xl overflow-hidden">
      <button onClick={()=>setOpen(v=>!v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-surface-400 hover:text-surface-200 hover:bg-overlay-4 transition-all">
        <span className="flex items-center gap-2"><Download size={13}/> {label}</span>
        <ChevronRight size={13} className={`transition-transform ${open?'rotate-90':''}`}/>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-overlay-6 pt-3">
          <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://github.com/user/repo.git"
            className="w-full px-3 py-2 text-sm bg-overlay-4 border border-overlay-6 rounded-lg text-surface-200 placeholder-surface-600 focus:outline-none focus:border-primary-500/40"/>
          <div className="flex gap-2">
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Folder name (optional)"
              className="flex-1 px-3 py-2 text-sm bg-overlay-4 border border-overlay-6 rounded-lg text-surface-200 placeholder-surface-600 focus:outline-none"/>
            <button onClick={()=>{ if(url.trim()){ onInstall(url.trim(),name.trim()); setUrl(''); setName(''); } }}
              disabled={loading||!url.trim()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium btn-primary disabled:opacity-50">
              {loading?<Loader2 size={12} className="animate-spin"/>:<Download size={12}/>} Clone
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
function LinuxServersInner() {
  const saved = loadBridgeConfig();
  const [host, setHost]       = useState(saved.host);
  const [apiKey, setApiKey]   = useState(saved.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [connected, setConnected]   = useState(false);
  const [connecting, setConnecting] = useState(false);

  const bridgeRef   = useRef<BridgeApi|null>(null);
  const wsRef       = useRef<WebSocket|null>(null);
  const wsTimeout   = useRef<ReturnType<typeof setTimeout>|null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const logsEndRef  = useRef<HTMLDivElement>(null);
  const installFileRef = useRef<HTMLInputElement>(null);
  const vehFileRef     = useRef<HTMLInputElement>(null);

  const [servers, setServers]   = useState<LinuxServer[]>(KNOWN_SERVERS.map(s=>({...s,status:'unknown' as const})));
  const [selected, setSelected] = useState<LinuxServer|null>(null);
  const [stats, setStats]       = useState<SystemStats|null>(null);
  const [wsState, setWsState]   = useState<'disconnected'|'connecting'|'connected'|'error'>('disconnected');
  const [tab, setTab]           = useState<Tab>('overview');
  const [actionLoading, setActionLoading] = useState<string|null>(null);

  const [logs, setLogs]         = useState<string[]>([]);
  const [cmd, setCmd]           = useState('');
  const [sendingCmd, setSendingCmd] = useState(false);

  const [resources, setResources]   = useState<string[]>([]);
  const [loadingRes, setLoadingRes] = useState(false);
  const [resFilter, setResFilter]   = useState('');
  const [resAction, setResAction]   = useState<string|null>(null);

  const [cfgContent, setCfgContent] = useState('');
  const [cfgEdited, setCfgEdited]   = useState('');
  const [loadingCfg, setLoadingCfg] = useState(false);
  const [savingCfg, setSavingCfg]   = useState(false);

  const [filePath, setFilePath]       = useState('');
  const [pathHistory, setPathHistory] = useState<string[]>([]);
  const [dirEntries, setDirEntries]   = useState<FileEntry[]>([]);
  const [loadingDir, setLoadingDir]   = useState(false);
  const [dirError, setDirError]       = useState('');
  const [openFile, setOpenFile]       = useState<FileEntry|null>(null);
  const [fileContent, setFileContent] = useState('');
  const [fileEdited, setFileEdited]   = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [savingFile, setSavingFile]   = useState(false);

  const [installQueue, setInstallQueue] = useState<UploadItem[]>([]);
  const [gitInstalling, setGitInstalling] = useState(false);
  const [installOut, setInstallOut]     = useState('');
  const [resUpdating, setResUpdating]   = useState<string|null>(null);
  const [resUpdateOut, setResUpdateOut] = useState('');

  const [vehQueue, setVehQueue]         = useState<UploadItem[]>([]);
  const [vehGitLoading, setVehGitLoading] = useState(false);
  const [vehOut, setVehOut]             = useState('');

  const [healthIssues, setHealthIssues] = useState<HealthIssue[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [fixingIdx, setFixingIdx]       = useState<number|null>(null);

  useEffect(()=>{ logsEndRef.current?.scrollIntoView({behavior:'smooth'}); },[logs]);
  useEffect(()=>()=>{
    wsRef.current?.close();
    if(intervalRef.current) clearInterval(intervalRef.current);
    if(wsTimeout.current) clearTimeout(wsTimeout.current);
  },[]);

  const addLog = useCallback((line: unknown) => {
    setLogs(prev=>[...prev.slice(-1499), String(line)]);
  },[]);

  const refreshStatuses = useCallback(async (api: BridgeApi) => {
    try {
      const procs = await api.pm2List();
      if(procs.length>0) {
        setServers(prev=>prev.map(srv=>{
          const proc=procs.find((p:any)=>{
            const n=String(p?.name??p?.pm2_env?.name??'').toLowerCase();
            const t=srv.processName.toLowerCase();
            return n===t||n.includes(t)||t.includes(n);
          });
          return {...srv, status: proc?parsePm2Status(proc):'stopped'};
        }));
      } else {
        const updated=await Promise.all(KNOWN_SERVERS.map(async srv=>{
          const s=await api.pm2Status(srv.processName).catch(()=>'unknown');
          return {...srv, status:parsePm2Status({status:s}) as LinuxServer['status']};
        }));
        setServers(updated);
      }
    } catch {}
  },[]);

  const openWs = useCallback((wsHost:string, key:string)=>{
    if(wsTimeout.current) clearTimeout(wsTimeout.current);
    try {
      if(wsRef.current){wsRef.current.onclose=null;wsRef.current.onerror=null;try{wsRef.current.close();}catch{}}
      setWsState('connecting');
      const ws=new WebSocket(`ws://${wsHost}?key=${encodeURIComponent(key)}`);
      let opened=false;
      ws.onopen    =()=>{ opened=true; setWsState('connected'); addLog('[Console] Live streaming connected'); };
      ws.onmessage =(e)=>addLog(e.data);
      ws.onerror   =()=>{ if(!opened) setWsState('error'); };
      ws.onclose   =()=>{
        setWsState(opened?'disconnected':'error');
        if(!opened) addLog('[Console] WebSocket unavailable — use the command box below');
      };
      wsRef.current=ws;
      wsTimeout.current=setTimeout(()=>{
        if(ws.readyState!==WebSocket.OPEN){
          try{ws.close();}catch{}
          setWsState('error');
          addLog('[Console] WS timed out — command box still works.');
        }
      },8000);
    } catch(e){ setWsState('error'); addLog(`[Console] WS failed: ${e}`); }
  },[addLog]);

  const connect=async()=>{
    const h=host.trim(); const k=apiKey.trim();
    if(!h||!k){toast.error('Enter host and API key');return;}
    setConnecting(true);
    try {
      const api=new BridgeApi(h,k);
      if(!await api.ping()){toast.error('Cannot reach bridge at '+h);return;}
      saveBridgeConfig({host:h,apiKey:k});
      bridgeRef.current=api;
      setConnected(true);
      toast.success('Connected to bridge');
      try{setStats(await api.getStats());}catch{}
      await refreshStatuses(api);
      if(intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current=setInterval(async()=>{
        if(!bridgeRef.current) return;
        try{setStats(await bridgeRef.current.getStats());}catch{}
        await refreshStatuses(bridgeRef.current);
      },6000);
      openWs(h,k);
    } catch(e:any){ toast.error(e?.message||'Connection failed'); }
    finally{ setConnecting(false); }
  };

  const disconnect=()=>{
    try{wsRef.current?.close();}catch{}
    wsRef.current=null;
    if(intervalRef.current) clearInterval(intervalRef.current);
    if(wsTimeout.current) clearTimeout(wsTimeout.current);
    bridgeRef.current=null;
    setConnected(false);setStats(null);setLogs([]);setWsState('disconnected');
    setServers(KNOWN_SERVERS.map(s=>({...s,status:'unknown' as const})));
    setSelected(null);
    toast('Disconnected');
  };

  const selectServer=(srv:LinuxServer)=>{
    setSelected(srv);setTab('overview');
    setResources([]);setCfgContent('');setCfgEdited('');
    setHealthIssues([]);setInstallOut('');setVehOut('');
    setOpenFile(null);setDirEntries([]);setDirError('');
    const root=srv.resourcesPath.split('/').slice(0,-1).join('/');
    setFilePath(root);setPathHistory([]);
  };

  useEffect(()=>{
    if(!selected) return;
    const u=servers.find(s=>s.processName===selected.processName);
    if(u&&u.status!==selected.status) setSelected(u);
  },[servers]);

  const serverAction=async(action:'start'|'stop'|'restart')=>{
    if(!bridgeRef.current||!selected) return;
    setActionLoading(action);
    addLog(`[Bridge] ${action} → ${selected.processName}…`);
    try {
      if(action==='start')   await bridgeRef.current.startServer(selected.processName);
      if(action==='stop')    await bridgeRef.current.stopServer(selected.processName);
      if(action==='restart') await bridgeRef.current.restartServer(selected.processName);
      toast.success(`${action} sent`);
      addLog(`[Bridge] ${action} OK`);
      setTimeout(()=>{ if(bridgeRef.current) refreshStatuses(bridgeRef.current); },3000);
      setTimeout(()=>{ if(bridgeRef.current) refreshStatuses(bridgeRef.current); },9000);
    } catch(e:any){
      const msg=e?.message||`Failed to ${action}`;
      toast.error(msg);addLog(`[Error] ${msg}`);
    } finally{ setActionLoading(null); }
  };

  const sendConsoleCmd=async()=>{
    if(!bridgeRef.current||!cmd.trim()) return;
    setSendingCmd(true);
    const c=cmd.trim();setCmd('');
    addLog(`> ${c}`);
    try{
      const out=await bridgeRef.current.execute(c);
      if(out) out.split('\n').forEach(l=>{if(l.trim()) addLog(l);}); else addLog('[No output]');
    }catch(e:any){addLog(`[Error] ${e?.message}`);}
    setSendingCmd(false);
  };

  const loadResources=async()=>{
    if(!bridgeRef.current||!selected) return;
    setLoadingRes(true);
    try{
      const res=await bridgeRef.current.getResources(selected.resourcesPath);
      if(res.length===0) toast('No resources found — check path in Overview');
      else setResources(res);
    }catch(e:any){toast.error('Failed: '+e?.message);}
    finally{setLoadingRes(false);}
  };

  const resourceCmd=async(name:string,action:'restart'|'stop'|'start'|'ensure')=>{
    if(!bridgeRef.current) return;
    setResAction(`${action}:${name}`);
    try{
      const out=await bridgeRef.current.execute(`${action} ${name}`);
      toast.success(`${action} ${name}`);
      addLog(`[Resource] ${action} ${name}: ${out||'OK'}`);
    }catch(e:any){toast.error(e?.message||`Failed to ${action}`);}
    finally{setResAction(null);}
  };

  const loadCfg=async()=>{
    if(!bridgeRef.current||!selected) return;
    setLoadingCfg(true);
    try{
      const c=await bridgeRef.current.getServerCfg(selected.cfgPath);
      if(!c){toast.error('Config returned empty');return;}
      setCfgContent(c);setCfgEdited(c);
    }catch(e:any){toast.error('Failed: '+e?.message);}
    finally{setLoadingCfg(false);}
  };

  const saveCfg=async()=>{
    if(!bridgeRef.current||!selected) return;
    setSavingCfg(true);
    try{await bridgeRef.current.writeFile(selected.cfgPath,cfgEdited);setCfgContent(cfgEdited);toast.success('server.cfg saved');}
    catch(e:any){toast.error(e?.message||'Save failed');}
    finally{setSavingCfg(false);}
  };

  const loadDir=async(path:string,pushCurrent=true)=>{
    if(!bridgeRef.current) return;
    setLoadingDir(true);setOpenFile(null);setDirError('');
    try{
      const entries=await bridgeRef.current.listFiles(path);
      const sorted=[...entries].sort((a,b)=>a.type!==b.type?(a.type==='dir'?-1:1):a.name.localeCompare(b.name));
      setDirEntries(sorted);
      if(pushCurrent) setPathHistory(h=>[...h,filePath]);
      setFilePath(path);
    }catch(e:any){
      setDirError(String(e?.message||'Unknown error'));
      setDirEntries([]);
      if(pushCurrent) setPathHistory(h=>[...h,filePath]);
      setFilePath(path);
    }finally{setLoadingDir(false);}
  };

  const openFileForEdit=async(entry:FileEntry)=>{
    if(!bridgeRef.current) return;
    setLoadingFile(true);setOpenFile(entry);
    try{const c=await bridgeRef.current.readFile(entry.path);setFileContent(c);setFileEdited(c);}
    catch(e:any){toast.error('Cannot read: '+e?.message);setOpenFile(null);}
    finally{setLoadingFile(false);}
  };

  const saveFile=async()=>{
    if(!bridgeRef.current||!openFile) return;
    setSavingFile(true);
    try{await bridgeRef.current.writeFile(openFile.path,fileEdited);setFileContent(fileEdited);toast.success('Saved');}
    catch(e:any){toast.error(e?.message||'Save failed');}
    finally{setSavingFile(false);}
  };

  const doUpload=async(file:File,resourcesPath:string,setQueue:React.Dispatch<React.SetStateAction<UploadItem[]>>)=>{
    if(!bridgeRef.current){toast.error('Not connected');return;}
    if(!file.name.match(/\.zip$/i)){toast.error(`${file.name}: only .zip files supported for direct upload`);return;}
    const id=`${Date.now()}-${file.name}`;
    setQueue(q=>[...q,{id,name:file.name,size:file.size,status:'uploading',progress:0}]);
    try{
      const buffer=await file.arrayBuffer();
      const out=await bridgeRef.current.uploadAndExtract(buffer,file.name,resourcesPath,(pct)=>{
        setQueue(q=>q.map(i=>i.id===id?{...i,progress:pct,status:pct>=75?'extracting':'uploading'}:i));
      });
      setQueue(q=>q.map(i=>i.id===id?{...i,status:'done',progress:100,output:out}:i));
      toast.success('Installed '+file.name.replace(/\.zip$/i,''));
      if(resources.length>0) loadResources();
    }catch(e:any){
      setQueue(q=>q.map(i=>i.id===id?{...i,status:'error',output:e?.message||'Failed'}:i));
      toast.error(e?.message||'Upload failed');
    }
  };

  const handleInstallFiles=(files:File[])=>{ if(!selected){toast.error('Select a server first');return;} files.forEach(f=>doUpload(f,selected.resourcesPath,setInstallQueue)); };
  const handleVehFiles    =(files:File[])=>{ if(!selected){toast.error('Select a server first');return;} files.forEach(f=>doUpload(f,selected.resourcesPath,setVehQueue)); };

  const gitInstall=async(url:string,name:string)=>{
    if(!bridgeRef.current||!selected) return;
    const folder=(name||url.split('/').pop()?.replace('.git','')||'resource').replace(/[^a-zA-Z0-9_\-]/g,'_');
    setGitInstalling(true);setInstallOut('');
    try{
      setInstallOut(`Cloning "${folder}"…\n`);
      const out=await bridgeRef.current.execute(`cd "${selected.resourcesPath}" && git clone "${url}" "${folder}" 2>&1`);
      setInstallOut(p=>p+(out||'Done.')+`\n\n✓ Add "ensure ${folder}" to server.cfg`);
      toast.success('Installed '+folder);
      if(resources.length>0) loadResources();
    }catch(e:any){setInstallOut(p=>p+`\nError: ${e?.message}`);toast.error('Clone failed');}
    finally{setGitInstalling(false);}
  };

  const gitVehInstall=async(url:string,name:string)=>{
    if(!bridgeRef.current||!selected) return;
    const folder=(name||url.split('/').pop()?.replace('.git','')||'vehicle_pack').replace(/[^a-zA-Z0-9_\-]/g,'_');
    setVehGitLoading(true);setVehOut('');
    try{
      setVehOut(`Cloning "${folder}"…\n`);
      const out=await bridgeRef.current.execute(`cd "${selected.resourcesPath}" && git clone "${url}" "${folder}" 2>&1`);
      setVehOut(p=>p+(out||'Done.')+`\n\n✓ Add "ensure ${folder}" to server.cfg`);
      toast.success('Installed '+folder);
      if(resources.length>0) loadResources();
    }catch(e:any){setVehOut(p=>p+`\nError: ${e?.message}`);toast.error('Clone failed');}
    finally{setVehGitLoading(false);}
  };

  const runHealth=async()=>{
    if(!bridgeRef.current||!selected) return;
    setHealthLoading(true);
    try{
      let cfg=cfgContent;
      if(!cfg){cfg=await bridgeRef.current.getServerCfg(selected.cfgPath);setCfgContent(cfg);setCfgEdited(cfg);}
      if(!cfg){toast.error('Could not load config');return;}
      setHealthIssues(analyzeConfig(cfg,selected.framework));
    }catch(e:any){toast.error('Health check failed: '+e?.message);}
    finally{setHealthLoading(false);}
  };

  const autoFix=async(issue:HealthIssue,idx:number)=>{
    if(!bridgeRef.current||!selected||!issue.cfgPatch) return;
    setFixingIdx(idx);
    try{
      let cfg=cfgEdited||cfgContent;
      if(!cfg) cfg=await bridgeRef.current.getServerCfg(selected.cfgPath);
      const newCfg=cfg.trimEnd()+'\n'+issue.cfgPatch.trim()+'\n';
      await bridgeRef.current.writeFile(selected.cfgPath,newCfg);
      setCfgContent(newCfg);setCfgEdited(newCfg);
      toast.success('Fixed: '+issue.message);
      setHealthIssues(analyzeConfig(newCfg,selected.framework));
    }catch(e:any){toast.error(e?.message||'Fix failed');}
    finally{setFixingIdx(null);}
  };

  useEffect(()=>{
    if(!connected||!selected) return;
    if(tab==='resources'&&resources.length===0) loadResources();
    if(tab==='config'&&!cfgContent) loadCfg();
    if(tab==='health'&&healthIssues.length===0) runHealth();
    if(tab==='files'&&dirEntries.length===0&&!dirError&&filePath) loadDir(filePath,false);
  },[tab,selected]);

  const TABS:{id:Tab;label:string;icon:React.ReactNode}[]=[
    {id:'overview',  label:'Overview',  icon:<Activity size={12}/>},
    {id:'console',   label:'Console',   icon:<Terminal size={12}/>},
    {id:'resources', label:'Resources', icon:<Package size={12}/>},
    {id:'config',    label:'Config',    icon:<FileCode size={12}/>},
    {id:'files',     label:'Files',     icon:<FolderOpen size={12}/>},
    {id:'install',   label:'Install',   icon:<Download size={12}/>},
    {id:'vehicles',  label:'Vehicles',  icon:<Car size={12}/>},
    {id:'health',    label:'Health',    icon:<HeartPulse size={12}/>},
  ];

  const wsDot={connected:'bg-green-400',connecting:'bg-amber-400 animate-pulse',error:'bg-red-500',disconnected:'bg-surface-600'}[wsState];

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} className="h-full flex flex-col overflow-hidden">

      {/* Connection Bar */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-overlay-6 bg-surface-950/60 backdrop-blur-sm flex-wrap">
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${connected?'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]':'bg-red-500'}`}/>
        <span className="text-xs font-semibold text-surface-400 shrink-0">Bridge</span>
        <div className="flex items-center gap-1.5 bg-overlay-4 border border-overlay-6 rounded-lg px-2.5 py-1.5">
          <Globe size={12} className="text-surface-500 shrink-0"/>
          <input value={host} onChange={e=>setHost(e.target.value)} placeholder="192.168.1.148:3142" disabled={connected}
            className="w-44 text-sm bg-transparent text-surface-200 placeholder-surface-600 focus:outline-none disabled:opacity-50"/>
        </div>
        <div className="flex items-center gap-1.5 bg-overlay-4 border border-overlay-6 rounded-lg px-2.5 py-1.5">
          <span className="text-[10px] font-medium text-surface-500 shrink-0">KEY</span>
          <input value={apiKey} onChange={e=>setApiKey(e.target.value)} type={showKey?'text':'password'} placeholder="API Key" disabled={connected}
            className="w-28 text-sm bg-transparent text-surface-200 placeholder-surface-600 focus:outline-none disabled:opacity-50"/>
          <button onClick={()=>setShowKey(v=>!v)} className="text-surface-500 hover:text-surface-300">
            {showKey?<EyeOff size={12}/>:<Eye size={12}/>}
          </button>
        </div>
        {connected?(
          <button onClick={disconnect} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-600/30 transition-all">
            <WifiOff size={12}/> Disconnect
          </button>
        ):(
          <button onClick={connect} disabled={connecting} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium btn-primary disabled:opacity-50">
            {connecting?<Loader2 size={12} className="animate-spin"/>:<Wifi size={12}/>}
            {connecting?'Connecting…':'Connect'}
          </button>
        )}
        {stats&&(
          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-surface-400"><Cpu size={12} className="text-primary-400"/><span className="font-semibold text-surface-200">{fmt(stats.cpu)}%</span> CPU</div>
            <div className="flex items-center gap-1.5 text-xs text-surface-400"><HardDrive size={12} className="text-indigo-400"/><span className="font-semibold text-surface-200">{fmt(stats.ram_used)}/{fmt(stats.ram_total)} GB</span> RAM</div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-52 shrink-0 flex flex-col border-r border-overlay-6 bg-surface-950/20 overflow-y-auto">
          <div className="px-3 pt-3 pb-1"><span className="text-[10px] font-semibold uppercase tracking-widest text-surface-600">Servers</span></div>
          <div className="px-2 space-y-1 pb-3">
            {servers.map(srv=>{
              const sc=SC[srv.status]??SC.unknown;
              const fw=FW_BADGE[srv.framework]??'bg-surface-700/40 text-surface-400 border border-surface-600/30';
              const isActive=selected?.processName===srv.processName;
              return(
                <button key={srv.processName} onClick={()=>selectServer(srv)} disabled={!connected}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${isActive?'bg-primary-600/15 border border-primary-500/25 text-surface-100':'hover:bg-overlay-4 text-surface-300 border border-transparent'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${sc.dot}`}/>
                    <span className="text-sm font-medium truncate flex-1">{srv.name}</span>
                    {isActive&&<ChevronRight size={12} className="text-primary-400 shrink-0"/>}
                  </div>
                  <div className="flex items-center gap-2 pl-4">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${fw}`}>{srv.framework}</span>
                    <span className={`text-[10px] font-medium ${sc.cls}`}>{sc.text}</span>
                  </div>
                </button>
              );
            })}
          </div>
          {!connected&&<p className="text-center text-xs text-surface-600 px-3 mt-2">Connect bridge above</p>}
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selected?(
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <Server size={48} className="text-surface-700 mb-4"/>
              <p className="text-surface-400 font-medium mb-1">No server selected</p>
              <p className="text-xs text-surface-600">{connected?'Pick a server on the left':'Connect to bridge first'}</p>
            </div>
          ):(
            <>
              {/* Header */}
              <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-overlay-6 flex-wrap gap-y-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-surface-100">{selected.name}</h2>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${FW_BADGE[selected.framework]??''}`}>{selected.framework}</span>
                    <span className={`text-[10px] font-semibold ${(SC[selected.status]??SC.unknown).cls}`}>● {(SC[selected.status]??SC.unknown).text}</span>
                  </div>
                  <p className="text-xs text-surface-500 mt-0.5 font-mono">{selected.processName}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {(['start','stop','restart'] as const).map(a=>{
                    const s={start:'bg-green-600/20 text-green-400 border-green-500/30 hover:bg-green-600/30',stop:'bg-red-600/20 text-red-400 border-red-500/30 hover:bg-red-600/30',restart:'bg-amber-600/20 text-amber-400 border-amber-500/30 hover:bg-amber-600/30'}[a];
                    const I={start:Play,stop:Square,restart:RefreshCw}[a];
                    return(
                      <button key={a} onClick={()=>serverAction(a)} disabled={!!actionLoading}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-all disabled:opacity-40 capitalize ${s}`}>
                        {actionLoading===a?<Loader2 size={12} className="animate-spin"/>:<I size={12}/>}{a}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tabs */}
              <div className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-overlay-6 overflow-x-auto">
                {TABS.map(t=>(
                  <button key={t.id} onClick={()=>setTab(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${tab===t.id?'bg-primary-600/20 text-primary-300 border border-primary-500/25':'text-surface-400 hover:text-surface-200 hover:bg-overlay-4'}`}>
                    {t.icon}{t.label}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto p-5">

                {/* OVERVIEW */}
                {tab==='overview'&&(
                  <div className="space-y-4 max-w-2xl">
                    <div className="glass-panel p-4 flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${(SC[selected.status]??SC.unknown).dot}`}/>
                      <span className="text-sm font-medium text-surface-200">{selected.name} is <span className={(SC[selected.status]??SC.unknown).cls}>{(SC[selected.status]??SC.unknown).text}</span></span>
                      <button onClick={()=>{if(bridgeRef.current)refreshStatuses(bridgeRef.current);}} className="ml-auto text-xs text-surface-500 hover:text-surface-300 flex items-center gap-1">
                        <RefreshCw size={11}/> Refresh
                      </button>
                    </div>
                    {stats?(
                      <div className="grid grid-cols-2 gap-4">
                        {[
                          {label:'CPU',val:fmt(stats.cpu)+'%',pct:stats.cpu,bar:'from-primary-700 to-primary-400',tc:'text-primary-300',icon:<Cpu size={15} className="text-primary-400"/>,sub:null},
                          {label:'RAM',val:fmt(stats.ram_percent,0)+'%',pct:stats.ram_percent,bar:'from-indigo-700 to-indigo-400',tc:'text-indigo-300',icon:<HardDrive size={15} className="text-indigo-400"/>,sub:`${fmt(stats.ram_used)} / ${fmt(stats.ram_total)} GB`},
                        ].map(c=>(
                          <div key={c.label} className="glass-panel p-4">
                            <div className="flex items-center gap-2 mb-3">{c.icon}<span className="text-sm font-medium text-surface-200">{c.label}</span><span className={`ml-auto text-xl font-bold ${c.tc}`}>{c.val}</span></div>
                            <div className="h-2 bg-surface-800 rounded-full overflow-hidden"><motion.div animate={{width:`${clamp(c.pct)}%`}} transition={{duration:0.5}} className={`h-full bg-gradient-to-r ${c.bar} rounded-full`}/></div>
                            {c.sub&&<p className="text-[11px] text-surface-500 mt-1.5 text-right">{c.sub}</p>}
                          </div>
                        ))}
                      </div>
                    ):(
                      <div className="glass-panel p-8 flex items-center justify-center text-surface-600 gap-2"><Loader2 size={16} className="animate-spin"/> Loading stats…</div>
                    )}
                    <div className="glass-panel p-4 space-y-2.5">
                      {[
                        {icon:<Package size={13}/>,label:'Resources Path',val:selected.resourcesPath},
                        {icon:<FileCode size={13}/>,label:'Config Path',val:selected.cfgPath},
                        {icon:<Server size={13}/>,label:'PM2 Process',val:selected.processName},
                      ].map((row,i)=>(
                        <div key={i} className={`flex items-start gap-3 ${i>0?'border-t border-overlay-4 pt-2.5':''}`}>
                          <span className="text-surface-500 shrink-0 mt-0.5">{row.icon}</span>
                          <div><p className="text-[10px] text-surface-600 mb-0.5 uppercase tracking-wider">{row.label}</p><p className="text-xs text-surface-400 font-mono break-all">{row.val}</p></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* CONSOLE */}
                {tab==='console'&&(
                  <div className="flex flex-col gap-2" style={{minHeight:420}}>
                    <div className="flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${wsDot}`}/>
                        <span className="text-xs text-surface-500 capitalize">{wsState}</span>
                        {(wsState==='error'||wsState==='disconnected')&&connected&&(
                          <button onClick={()=>openWs(host,apiKey)} className="text-xs text-primary-400 hover:text-primary-300 ml-1">Reconnect</button>
                        )}
                      </div>
                      <button onClick={()=>setLogs([])} className="text-xs text-surface-500 hover:text-surface-300">Clear</button>
                    </div>
                    <div className="flex-1 overflow-auto font-mono text-xs bg-black/50 rounded-xl border border-overlay-6 p-3" style={{minHeight:300}}>
                      {logs.length===0?<p className="text-surface-600 text-center mt-8">Type a command below to run it on the server</p>
                        :logs.map((l,i)=><div key={i} className={`leading-5 break-all whitespace-pre-wrap ${l.startsWith('[Error]')?'text-red-400/80':l.startsWith('>')?'text-amber-300':l.startsWith('[Bridge]')||l.startsWith('[Console]')?'text-blue-300/80':l.startsWith('[Resource]')?'text-cyan-300/80':'text-green-300/80'}`}>{l}</div>)}
                      <div ref={logsEndRef}/>
                    </div>
                    <div className="shrink-0 flex gap-2">
                      <input value={cmd} onChange={e=>setCmd(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')sendConsoleCmd();}}
                        placeholder="e.g: pm2 list  /  restart ox_inventory  /  ls /home/harperlinux"
                        className="flex-1 px-3 py-2 text-sm bg-overlay-4 border border-overlay-6 rounded-lg text-surface-200 placeholder-surface-600 focus:outline-none focus:border-primary-500/40 font-mono"/>
                      <button onClick={sendConsoleCmd} disabled={sendingCmd||!cmd.trim()} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium btn-primary disabled:opacity-50">
                        {sendingCmd?<Loader2 size={12} className="animate-spin"/>:<Send size={12}/>} Send
                      </button>
                    </div>
                  </div>
                )}

                {/* RESOURCES */}
                {tab==='resources'&&(
                  <div>
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <input value={resFilter} onChange={e=>setResFilter(e.target.value)} placeholder="Filter…"
                        className="flex-1 max-w-xs px-3 py-1.5 text-sm bg-overlay-4 border border-overlay-6 rounded-lg text-surface-200 placeholder-surface-600 focus:outline-none"/>
                      <span className="text-xs text-surface-500">{resources.length} resources</span>
                      <button onClick={loadResources} disabled={loadingRes} className="flex items-center gap-1.5 text-xs btn-secondary px-3 py-1.5 ml-auto">
                        {loadingRes?<Loader2 size={12} className="animate-spin"/>:<RefreshCw size={12}/>} Refresh
                      </button>
                    </div>
                    {loadingRes?<div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-primary-500"/></div>
                    :resources.length===0?<div className="flex flex-col items-center py-12 text-surface-600 gap-2"><Package size={36} className="opacity-40"/><p className="text-sm">No resources loaded</p></div>
                    :(
                      <div className="space-y-1">
                        {resources.filter(r=>!resFilter||r.toLowerCase().includes(resFilter.toLowerCase())).map(name=>(
                          <div key={name} className="flex items-center gap-2 px-3 py-2 bg-overlay-4 border border-overlay-6 rounded-xl group">
                            <Package size={12} className="text-surface-600 shrink-0"/>
                            <span className="text-xs text-surface-300 flex-1 truncate font-mono">{name}</span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {(['restart','start','stop','ensure'] as const).map(a=>(
                                <button key={a} onClick={()=>resourceCmd(name,a)} disabled={!!resAction}
                                  className={`text-[10px] px-2 py-0.5 rounded font-medium transition-all disabled:opacity-50 ${a==='restart'?'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30':a==='start'?'bg-green-500/20 text-green-300 hover:bg-green-500/30':a==='stop'?'bg-red-500/20 text-red-300 hover:bg-red-500/30':'bg-primary-500/20 text-primary-300 hover:bg-primary-500/30'}`}>
                                  {resAction===`${a}:${name}`?'…':a}
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
                {tab==='config'&&(
                  <div className="flex flex-col gap-3" style={{minHeight:420}}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-surface-500 font-mono truncate flex-1">{selected.cfgPath}</p>
                      <button onClick={loadCfg} disabled={loadingCfg} className="flex items-center gap-1.5 text-xs btn-secondary px-3 py-1.5">
                        {loadingCfg?<Loader2 size={12} className="animate-spin"/>:<RefreshCw size={12}/>} Reload
                      </button>
                      <button onClick={saveCfg} disabled={savingCfg||cfgEdited===cfgContent||!cfgEdited}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-600/20 text-green-400 border border-green-500/30 rounded-lg hover:bg-green-600/30 disabled:opacity-40 font-medium">
                        {savingCfg?<Loader2 size={12} className="animate-spin"/>:<Save size={12}/>} Save
                      </button>
                    </div>
                    {cfgEdited!==cfgContent&&cfgEdited&&<p className="text-[10px] text-amber-400">● Unsaved changes</p>}
                    <textarea value={cfgEdited} onChange={e=>setCfgEdited(e.target.value)} placeholder="Click Reload to load server.cfg…" spellCheck={false}
                      className="font-mono text-xs bg-black/50 rounded-xl border border-overlay-6 p-4 text-green-300/90 resize-none focus:outline-none focus:border-primary-500/30" style={{minHeight:380}}/>
                  </div>
                )}

                {/* FILES */}
                {tab==='files'&&(
                  <div className="flex flex-col gap-3" style={{minHeight:420}}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={()=>{if(pathHistory.length>0){const p=pathHistory[pathHistory.length-1];setPathHistory(h=>h.slice(0,-1));loadDir(p,false);}}} disabled={pathHistory.length===0}
                        className="flex items-center gap-1 text-xs btn-secondary px-2.5 py-1.5 disabled:opacity-40">
                        <ChevronLeft size={12}/> Back
                      </button>
                      <button onClick={()=>{const p=filePath.split('/').slice(0,-1).join('/')||'/';setPathHistory(h=>[...h,filePath]);loadDir(p,false);}}
                        className="flex items-center gap-1 text-xs btn-secondary px-2.5 py-1.5">
                        <ArrowUp size={12}/> Up
                      </button>
                      <div className="flex-1 px-3 py-1.5 bg-overlay-4 border border-overlay-6 rounded-lg font-mono text-xs text-surface-400 truncate min-w-0">{filePath||'/'}</div>
                      <button onClick={()=>loadDir(filePath,false)} disabled={loadingDir} className="flex items-center gap-1 text-xs btn-secondary px-2.5 py-1.5">
                        {loadingDir?<Loader2 size={12} className="animate-spin"/>:<RefreshCw size={12}/>}
                      </button>
                      {openFile&&<button onClick={()=>{setOpenFile(null);loadDir(filePath,false);}} className="text-xs text-surface-400 hover:text-surface-200 px-2">✕ Close</button>}
                    </div>

                    {openFile?(
                      <div className="flex flex-col gap-2" style={{minHeight:360}}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-surface-400 font-mono flex-1 truncate">{openFile.path}</span>
                          {fileEdited!==fileContent&&<span className="text-[10px] text-amber-400">● Unsaved</span>}
                          <button onClick={saveFile} disabled={savingFile||fileEdited===fileContent}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-600/20 text-green-400 border border-green-500/30 rounded-lg hover:bg-green-600/30 disabled:opacity-40 font-medium">
                            {savingFile?<Loader2 size={12} className="animate-spin"/>:<Save size={12}/>} Save
                          </button>
                        </div>
                        {loadingFile?<div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-primary-500"/></div>
                        :<textarea value={fileEdited} onChange={e=>setFileEdited(e.target.value)} spellCheck={false}
                          className="font-mono text-xs bg-black/50 rounded-xl border border-overlay-6 p-4 text-green-300/90 resize-none focus:outline-none focus:border-primary-500/30" style={{minHeight:360}}/>}
                      </div>
                    ):loadingDir?(
                      <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-primary-500"/></div>
                    ):dirError?(
                      <div className="flex flex-col items-center py-12 gap-2">
                        <AlertCircle size={36} className="text-red-400/60"/>
                        <p className="text-sm text-red-400">Path not found or permission denied</p>
                        <p className="text-xs text-surface-500 font-mono max-w-sm text-center break-all">{dirError}</p>
                        <p className="text-xs text-surface-600 mt-1">Run <code className="text-green-300/70">ls /home/harperlinux</code> in Console to find the correct path</p>
                        <button onClick={()=>loadDir(filePath,false)} className="text-xs text-primary-400 hover:text-primary-300 mt-1">Retry</button>
                      </div>
                    ):dirEntries.length===0?(
                      <div className="flex flex-col items-center py-12 text-surface-600 gap-2">
                        <FolderOpen size={36} className="opacity-40"/><p className="text-sm">Empty directory</p>
                        <button onClick={()=>loadDir(filePath,false)} className="text-xs text-primary-400 hover:text-primary-300">Retry</button>
                      </div>
                    ):(
                      <div className="space-y-0.5 overflow-auto" style={{maxHeight:500}}>
                        {dirEntries.map(entry=>(
                          <button key={entry.path} onClick={()=>entry.type==='dir'?loadDir(entry.path):openFileForEdit(entry)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-overlay-4 text-left transition-all group">
                            {entry.type==='dir'?<FolderOpen size={14} className="text-amber-400 shrink-0"/>:<FileIcon size={14} className="text-surface-500 shrink-0"/>}
                            <span className={`text-sm truncate ${entry.type==='dir'?'text-surface-200 font-medium':'text-surface-400'}`}>{entry.name}</span>
                            <span className="ml-auto text-[10px] text-surface-600 opacity-0 group-hover:opacity-100">{entry.type==='dir'?'Open':'Edit'}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* INSTALL */}
                {tab==='install'&&(
                  <div className="space-y-4 max-w-2xl">
                    <DropZone onFiles={handleInstallFiles} accept=".zip"
                      heading="Drag & drop resource folders or ZIPs here"
                      sub="Or click to browse • Supports .zip files • MLOs, scripts, jobs, anything"
                      tags={['MLO','Police','EMS','Phone','HUD','Inventory','Admin','Weather','+ more']}
                      accent="primary" fileInputRef={installFileRef}/>

                    {installQueue.length>0&&(
                      <div className="space-y-2">
                        {installQueue.map(item=><QueueItem key={item.id} item={item} onDismiss={()=>setInstallQueue(q=>q.filter(i=>i.id!==item.id))}/>)}
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-3">
                      {[
                        {icon:<FolderOpen size={15}/>,title:'MLOs & Interiors',desc:'ZIP extracted directly into your resources folder, ensure added to server.cfg automatically'},
                        {icon:<RefreshCw size={15}/>,title:'Smart Replace',desc:'Installing a replacement script? Old folder is overwritten — no duplicate conflicts'},
                        {icon:<FileCode size={15}/>,title:'Auto Config',desc:'server.cfg updated automatically — old ensures removed, new ones added. No manual editing'},
                      ].map(c=>(
                        <div key={c.title} className="glass-panel p-4 border border-overlay-6">
                          <div className="w-9 h-9 rounded-xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center mb-3 text-primary-400">{c.icon}</div>
                          <p className="text-sm font-semibold text-surface-200 mb-1">{c.title}</p>
                          <p className="text-xs text-surface-500 leading-relaxed">{c.desc}</p>
                        </div>
                      ))}
                    </div>

                    <GitHubInstall label="Install from GitHub URL (git clone)" onInstall={gitInstall} loading={gitInstalling}/>

                    {installOut&&<pre className="font-mono text-xs bg-black/50 rounded-xl border border-overlay-6 p-4 text-green-300/80 whitespace-pre-wrap max-h-36 overflow-auto">{installOut}</pre>}

                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-surface-600 mb-3">Quick Install — Popular Resources</p>
                      <div className="space-y-1.5">
                        {QUICK_RESOURCES.map(r=>(
                          <div key={r.name} className="flex items-center gap-3 px-3 py-2 bg-overlay-4 border border-overlay-6 rounded-xl">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-surface-200 font-mono">{r.name}</p>
                              <p className="text-[10px] text-surface-500">{r.desc}</p>
                            </div>
                            <button onClick={()=>gitInstall(r.repo,r.name)} disabled={gitInstalling}
                              className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium btn-primary disabled:opacity-50 shrink-0">
                              {gitInstalling?<Loader2 size={10} className="animate-spin"/>:<Download size={10}/>} Install
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {resources.length>0&&(
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-surface-600 mb-2">Update Installed (git pull)</p>
                        <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                          {resources.map(name=>(
                            <button key={name} onClick={async()=>{
                              if(!bridgeRef.current||!selected) return;
                              setResUpdating(name);
                              try{const out=await bridgeRef.current.execute(`cd "${selected.resourcesPath}/${name}" && git pull 2>&1`);setResUpdateOut(`git pull ${name}:\n${out||'Already up to date'}`);toast.success('Updated '+name);}
                              catch(e:any){toast.error(e?.message);}
                              setResUpdating(null);
                            }} disabled={!!resUpdating}
                              className="flex items-center gap-1 px-2 py-1.5 text-[10px] bg-overlay-4 border border-overlay-6 rounded-lg text-surface-300 hover:bg-overlay-6 transition-all truncate disabled:opacity-50">
                              {resUpdating===name?<Loader2 size={9} className="animate-spin shrink-0"/>:<RotateCcw size={9} className="shrink-0"/>}
                              <span className="truncate">{name}</span>
                            </button>
                          ))}
                        </div>
                        {resUpdateOut&&<pre className="font-mono text-xs bg-black/50 rounded-xl border border-overlay-6 p-3 text-green-300/80 whitespace-pre-wrap max-h-28 overflow-auto mt-2">{resUpdateOut}</pre>}
                      </div>
                    )}
                  </div>
                )}

                {/* VEHICLES */}
                {tab==='vehicles'&&(
                  <div className="space-y-4 max-w-2xl">
                    <DropZone onFiles={handleVehFiles} accept=".zip"
                      heading="Drag & drop vehicle packs or ZIPs here"
                      sub="Or click to browse • Supports .zip files • Cars, bikes, trucks, aircraft"
                      tags={['Cars','Bikes','Trucks','Aircraft','Emergency','Civilian','+ more']}
                      accent="amber" fileInputRef={vehFileRef}/>

                    {vehQueue.length>0&&(
                      <div className="space-y-2">
                        {vehQueue.map(item=><QueueItem key={item.id} item={item} onDismiss={()=>setVehQueue(q=>q.filter(i=>i.id!==item.id))}/>)}
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-3">
                      {[
                        {icon:<Settings size={15}/>,title:'Auto Manifest',desc:'Detects vehicles.meta, handling.meta, carcols — generates fxmanifest.lua if missing'},
                        {icon:<Activity size={15}/>,title:'Stream Detection',desc:'Finds .ytf, .ytd, .ydr stream files and sets up the stream folder automatically'},
                        {icon:<FileCode size={15}/>,title:'Auto Config',desc:'Adds ensure lines to server.cfg and places the pack in the [vehicles] category folder'},
                      ].map(c=>(
                        <div key={c.title} className="glass-panel p-4 border border-overlay-6">
                          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-3 text-amber-400">{c.icon}</div>
                          <p className="text-sm font-semibold text-surface-200 mb-1">{c.title}</p>
                          <p className="text-xs text-surface-500 leading-relaxed">{c.desc}</p>
                        </div>
                      ))}
                    </div>

                    <GitHubInstall label="Install from GitHub URL (git clone)" onInstall={gitVehInstall} loading={vehGitLoading}/>

                    {vehOut&&<pre className="font-mono text-xs bg-black/50 rounded-xl border border-overlay-6 p-4 text-green-300/80 whitespace-pre-wrap max-h-36 overflow-auto">{vehOut}</pre>}

                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-surface-600 mb-3">Quick Install Presets</p>
                      <div className="space-y-2">
                        {VEHICLE_PACKS.map(pack=>(
                          <div key={pack.name} className="flex items-center gap-3 px-4 py-3 glass-panel border border-overlay-6">
                            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                              <Car size={14} className="text-amber-400"/>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-surface-200 font-mono">{pack.name}</p>
                              <p className="text-xs text-surface-500">{pack.desc}</p>
                            </div>
                            <button onClick={()=>gitVehInstall(pack.repo,pack.name)} disabled={vehGitLoading}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/25 rounded-lg hover:bg-amber-500/25 transition-all disabled:opacity-50 shrink-0">
                              {vehGitLoading?<Loader2 size={11} className="animate-spin"/>:<Download size={11}/>} Install
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* HEALTH */}
                {tab==='health'&&(
                  <div className="space-y-3 max-w-2xl">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-surface-200 flex items-center gap-2"><HeartPulse size={15}/> Config Health Scanner</h3>
                      <button onClick={runHealth} disabled={healthLoading} className="flex items-center gap-1.5 text-xs btn-secondary px-3 py-1.5">
                        {healthLoading?<Loader2 size={12} className="animate-spin"/>:<RefreshCw size={12}/>} Scan
                      </button>
                    </div>
                    {healthLoading&&<div className="flex items-center justify-center py-10"><Loader2 size={24} className="animate-spin text-primary-500"/></div>}
                    {!healthLoading&&healthIssues.length===0&&(
                      <div className="flex flex-col items-center py-12 text-surface-600 gap-2"><HeartPulse size={32} className="opacity-40"/><p className="text-sm">Click Scan to analyze your server.cfg</p></div>
                    )}
                    {!healthLoading&&healthIssues.length>0&&(
                      <div className="space-y-2">
                        {healthIssues.map((issue,i)=>{
                          const isOk=issue.severity==='ok';
                          const Icon=isOk?CheckCircle2:issue.severity==='error'?AlertCircle:issue.severity==='warning'?AlertTriangle:Info;
                          const c=isOk?'border-green-500/30 bg-green-400/10 text-green-400':issue.severity==='error'?'border-red-500/30 bg-red-400/10 text-red-400':issue.severity==='warning'?'border-amber-500/30 bg-amber-400/10 text-amber-400':'border-blue-500/30 bg-blue-400/10 text-blue-400';
                          return(
                            <div key={i} className={`flex items-start gap-3 p-3.5 rounded-xl border ${c}`}>
                              <Icon size={15} className="shrink-0 mt-0.5"/>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{issue.message}</p>
                                {issue.suggestion&&<p className="text-xs opacity-70 mt-0.5 font-mono">{issue.suggestion}</p>}
                              </div>
                              {issue.cfgPatch&&!isOk&&(
                                <button onClick={()=>autoFix(issue,i)} disabled={fixingIdx===i}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium bg-white/10 hover:bg-white/20 rounded-lg transition-all shrink-0 disabled:opacity-50">
                                  {fixingIdx===i?<Loader2 size={10} className="animate-spin"/>:<Wrench size={10}/>} Auto-fix
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
  return <ErrBoundary><LinuxServersInner/></ErrBoundary>;
}
