export interface BridgeConfig {
  host: string;
  apiKey: string;
}

export interface SystemStats {
  cpu: number;
  ram_used: number;
  ram_total: number;
  ram_percent: number;
}

export interface Pm2Process {
  name: string;
  pm_id?: number;
  pm2_env?: { status?: string; name?: string };
  status?: string;
  [key: string]: any;
}

const BRIDGE_CONFIG_KEY = 'fivem-bridge-config';

export function loadBridgeConfig(): BridgeConfig {
  try {
    const raw = localStorage.getItem(BRIDGE_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { host: '192.168.1.148:3142', apiKey: 'changethis123' };
}

export function saveBridgeConfig(cfg: BridgeConfig) {
  localStorage.setItem(BRIDGE_CONFIG_KEY, JSON.stringify(cfg));
}

function ipcRequest(host: string, apiKey: string, method: string, path: string, body?: any): Promise<any> {
  const api = (window as any).electronAPI;
  if (!api?.bridge?.request) {
    return fetch(`http://${host}${path}`, {
      method,
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
  }
  return api.bridge.request({ host, apiKey, method, path, body });
}

function toNum(v: any, fallback = 0): number {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

export class BridgeApi {
  constructor(public host: string, public apiKey: string) {}

  private req<T>(method: string, path: string, body?: any): Promise<T> {
    return ipcRequest(this.host, this.apiKey, method, path, body);
  }

  async ping(): Promise<boolean> {
    try { await this.req('GET', '/stats'); return true; } catch { return false; }
  }

  async getStats(): Promise<SystemStats> {
    const d: any = await this.req('GET', '/stats');

    // CPU — handle fraction (0–1) and percent (0–100)
    let cpu = toNum(d?.cpu ?? d?.cpu_percent ?? d?.cpu_usage ?? d?.cpuPercent ?? d?.CPU);
    if (cpu > 0 && cpu < 1) cpu *= 100; // fraction → percent

    // RAM — handle bytes, MB, GB
    let ram_used  = toNum(d?.ram_used  ?? d?.memory_used  ?? d?.ramUsed  ?? d?.ram?.used  ?? d?.used_memory);
    let ram_total = toNum(d?.ram_total ?? d?.memory_total ?? d?.ramTotal ?? d?.ram?.total ?? d?.total_memory, 1);
    if (ram_total <= 0) ram_total = 1;

    // Auto-scale: bytes → GB, MB → GB
    if (ram_total > 1_000_000) {       // looks like bytes
      ram_used  = ram_used  / 1_073_741_824;
      ram_total = ram_total / 1_073_741_824;
    } else if (ram_total > 512) {      // looks like MB
      ram_used  = ram_used  / 1024;
      ram_total = ram_total / 1024;
    }

    let ram_percent = toNum(d?.ram_percent ?? d?.memory_percent ?? d?.ramPercent ?? d?.ram?.percent);
    if (ram_percent === 0 && ram_total > 0) ram_percent = (ram_used / ram_total) * 100;
    if (ram_percent > 0 && ram_percent <= 1) ram_percent *= 100; // fraction → percent

    return { cpu, ram_used, ram_total, ram_percent };
  }

  async pm2List(): Promise<Pm2Process[]> {
    const d: any = await this.req('GET', '/pm2/list');
    const arr = Array.isArray(d) ? d
              : Array.isArray(d?.processes) ? d.processes
              : Array.isArray(d?.data) ? d.data
              : Array.isArray(d?.list) ? d.list
              : [];
    return arr;
  }

  async getResources(resourcesPath: string): Promise<string[]> {
    const d: any = await this.req('GET', `/resources?path=${encodeURIComponent(resourcesPath)}`);
    const arr = Array.isArray(d) ? d : Array.isArray(d?.resources) ? d.resources : [];
    return arr.map(String).filter(Boolean);
  }

  async getServerCfg(cfgPath: string): Promise<string> {
    const d: any = await this.req('GET', `/servercfg?path=${encodeURIComponent(cfgPath)}`);
    return String(d?.content ?? d?.data ?? d ?? '');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await this.req('POST', '/writefile', { path: filePath, content });
  }

  async listFiles(dirPath: string): Promise<string[]> {
    const d: any = await this.req('GET', `/files?path=${encodeURIComponent(dirPath)}`);
    const arr = Array.isArray(d) ? d : Array.isArray(d?.files) ? d.files : [];
    return arr.map(String);
  }

  async readFile(filePath: string): Promise<string> {
    const d: any = await this.req('GET', `/file?path=${encodeURIComponent(filePath)}`);
    return String(d?.content ?? d?.data ?? d ?? '');
  }

  async startServer(processName: string): Promise<void> {
    await this.req('POST', '/server/start', { process_name: processName });
  }

  async stopServer(processName: string): Promise<void> {
    await this.req('POST', '/server/stop', { process_name: processName });
  }

  async restartServer(processName: string): Promise<void> {
    await this.req('POST', '/server/restart', { process_name: processName });
  }

  // Send a command to FXServer console or shell — what /execute accepts
  async execute(cmd: string): Promise<string> {
    const d: any = await this.req('POST', '/execute', { cmd });
    return String(d?.output ?? d?.result ?? d?.response ?? d?.stdout ?? '');
  }

  createWebSocket(): WebSocket {
    return new WebSocket(`ws://${this.host}?key=${encodeURIComponent(this.apiKey)}`);
  }
}

// Determine PM2 process status from whatever shape the bridge returns
export function parsePm2Status(proc: any): 'online' | 'stopped' | 'error' | 'unknown' {
  const s = String(
    proc?.pm2_env?.status ?? proc?.status ?? proc?.state ?? proc?.pm_status ?? ''
  ).toLowerCase().trim();
  if (['online', 'running', 'active', 'started', 'up'].includes(s)) return 'online';
  if (['stopped', 'stopping', 'inactive', 'idle', 'down', 'offline'].includes(s)) return 'stopped';
  if (['errored', 'error', 'failed', 'crashed', 'restart_retries'].includes(s)) return 'error';
  return 'unknown';
}
