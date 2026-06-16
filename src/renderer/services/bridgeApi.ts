export interface BridgeConfig { host: string; apiKey: string; }

export interface SystemStats {
  cpu: number; ram_used: number; ram_total: number; ram_percent: number;
}

export interface Pm2Process {
  name: string; pm_id?: number;
  pm2_env?: { status?: string; name?: string };
  status?: string; [key: string]: any;
}

const BRIDGE_CONFIG_KEY = 'fivem-bridge-config';

export function loadBridgeConfig(): BridgeConfig {
  try { const r = localStorage.getItem(BRIDGE_CONFIG_KEY); if (r) return JSON.parse(r); } catch {}
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
    let cpu = toNum(d?.cpu ?? d?.cpu_percent ?? d?.cpu_usage ?? d?.cpuPercent ?? d?.CPU);
    if (cpu > 0 && cpu < 1) cpu *= 100;
    let ram_used  = toNum(d?.ram_used  ?? d?.memory_used  ?? d?.ramUsed  ?? d?.ram?.used  ?? d?.used_memory);
    let ram_total = toNum(d?.ram_total ?? d?.memory_total ?? d?.ramTotal ?? d?.ram?.total ?? d?.total_memory, 1);
    if (ram_total <= 0) ram_total = 1;
    if (ram_total > 1_000_000) { ram_used = ram_used / 1_073_741_824; ram_total = ram_total / 1_073_741_824; }
    else if (ram_total > 512) { ram_used = ram_used / 1024; ram_total = ram_total / 1024; }
    let ram_percent = toNum(d?.ram_percent ?? d?.memory_percent ?? d?.ramPercent ?? d?.ram?.percent);
    if (ram_percent === 0 && ram_total > 0) ram_percent = (ram_used / ram_total) * 100;
    if (ram_percent > 0 && ram_percent <= 1) ram_percent *= 100;
    return { cpu, ram_used, ram_total, ram_percent };
  }

  // Try REST endpoint first; fall back to pm2 jlist via shell execute
  async pm2List(): Promise<Pm2Process[]> {
    // 1. Try REST
    try {
      const d: any = await this.req('GET', '/pm2/list');
      const arr = Array.isArray(d) ? d
                : Array.isArray(d?.processes) ? d.processes
                : Array.isArray(d?.data) ? d.data
                : Array.isArray(d?.list) ? d.list
                : null;
      if (arr && arr.length > 0) return arr;
    } catch {}

    // 2. Try execute pm2 jlist
    try {
      const raw = await this.execute('pm2 jlist');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {}

    // 3. Try execute pm2 list --no-color and parse text
    try {
      const raw = await this.execute('pm2 list --no-color');
      return parsePm2TextList(raw);
    } catch {}

    return [];
  }

  async getResources(resourcesPath: string): Promise<string[]> {
    try {
      const d: any = await this.req('GET', `/resources?path=${encodeURIComponent(resourcesPath)}`);
      const arr = Array.isArray(d) ? d : Array.isArray(d?.resources) ? d.resources : null;
      if (arr) return arr.map(String).filter(Boolean);
    } catch {}
    // Fallback: list files via execute
    try {
      const raw = await this.execute(`ls "${resourcesPath}"`);
      return raw.split('\n').map(s => s.trim()).filter(Boolean);
    } catch {}
    return [];
  }

  async getServerCfg(cfgPath: string): Promise<string> {
    try {
      const d: any = await this.req('GET', `/servercfg?path=${encodeURIComponent(cfgPath)}`);
      const s = String(d?.content ?? d?.data ?? d ?? '');
      if (s) return s;
    } catch {}
    // Fallback: read via file endpoint
    try { return await this.readFile(cfgPath); } catch {}
    return '';
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      await this.req('POST', '/writefile', { path: filePath, content });
      return;
    } catch {}
    // Fallback: use execute with heredoc
    const escaped = content.replace(/'/g, "'\\''");
    await this.execute(`cat > '${filePath}' << 'ENDOFFILE'\n${escaped}\nENDOFFILE`);
  }

  async listFiles(dirPath: string): Promise<FileEntry[]> {
    try {
      const d: any = await this.req('GET', `/files?path=${encodeURIComponent(dirPath)}`);
      const arr = Array.isArray(d) ? d : Array.isArray(d?.files) ? d.files : null;
      if (arr) return arr.map((f: any) => typeof f === 'string'
        ? { name: f, type: 'file' as const, path: `${dirPath}/${f}` }
        : { name: f.name ?? f, type: f.type ?? f.isDir ? 'dir' : 'file', path: f.path ?? `${dirPath}/${f.name ?? f}` }
      );
    } catch {}
    // Fallback: ls -la via execute
    try {
      const raw = await this.execute(`ls -la "${dirPath}" 2>/dev/null || ls "${dirPath}"`);
      return parseLsOutput(raw, dirPath);
    } catch {}
    return [];
  }

  async readFile(filePath: string): Promise<string> {
    try {
      const d: any = await this.req('GET', `/file?path=${encodeURIComponent(filePath)}`);
      const s = String(d?.content ?? d?.data ?? d ?? '');
      if (s) return s;
    } catch {}
    // Fallback
    try {
      const raw = await this.execute(`cat "${filePath}"`);
      return raw;
    } catch {}
    return '';
  }

  // Server control — try REST first, then PM2 CLI via execute
  async startServer(processName: string): Promise<void> {
    try { await this.req('POST', '/server/start', { process_name: processName }); return; } catch {}
    await this.execute(`pm2 start "${processName}"`);
  }

  async stopServer(processName: string): Promise<void> {
    try { await this.req('POST', '/server/stop', { process_name: processName }); return; } catch {}
    await this.execute(`pm2 stop "${processName}"`);
  }

  async restartServer(processName: string): Promise<void> {
    try { await this.req('POST', '/server/restart', { process_name: processName }); return; } catch {}
    await this.execute(`pm2 restart "${processName}"`);
  }

  async execute(cmd: string): Promise<string> {
    const d: any = await this.req('POST', '/execute', { cmd });
    return String(d?.output ?? d?.result ?? d?.response ?? d?.stdout ?? d ?? '');
  }

  createWebSocket(): WebSocket {
    return new WebSocket(`ws://${this.host}?key=${encodeURIComponent(this.apiKey)}`);
  }
}

export interface FileEntry { name: string; type: 'file' | 'dir'; path: string; }

function parseLsOutput(raw: string, dir: string): FileEntry[] {
  const lines = raw.split('\n').filter(l => l.trim() && !l.startsWith('total'));
  const result: FileEntry[] = [];
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const name = parts[parts.length - 1];
    if (!name || name === '.' || name === '..') continue;
    const isDir = line.startsWith('d');
    result.push({ name, type: isDir ? 'dir' : 'file', path: `${dir}/${name}` });
  }
  return result;
}

function parsePm2TextList(raw: string): Pm2Process[] {
  const result: Pm2Process[] = [];
  const lines = raw.split('\n');
  for (const line of lines) {
    // Match lines that look like pm2 table rows: │ 0 │ fxserver │ ... │ online │
    const m = line.match(/│\s*(\d+)\s*│\s*([\w-]+)\s*│.*?│\s*(online|stopped|errored|stopping|launching)\s*│/i);
    if (m) {
      result.push({ name: m[2].trim(), pm_id: Number(m[1]), status: m[3].trim().toLowerCase(), pm2_env: { status: m[3].trim().toLowerCase() } });
    }
  }
  return result;
}

export function parsePm2Status(proc: any): 'online' | 'stopped' | 'error' | 'unknown' {
  const s = String(proc?.pm2_env?.status ?? proc?.status ?? proc?.state ?? proc?.pm_status ?? '').toLowerCase().trim();
  if (['online', 'running', 'active', 'started', 'up', 'launching'].includes(s)) return 'online';
  if (['stopped', 'stopping', 'inactive', 'idle', 'down', 'offline'].includes(s)) return 'stopped';
  if (['errored', 'error', 'failed', 'crashed', 'restart_retries'].includes(s)) return 'error';
  return 'unknown';
}
