export interface BridgeConfig { host: string; apiKey: string; }

export interface SystemStats {
  cpu: number; ram_used: number; ram_total: number; ram_percent: number;
}

export interface Pm2Process {
  name: string; pm_id?: number;
  pm2_env?: { status?: string; name?: string };
  status?: string; [key: string]: any;
}

export interface FileEntry { name: string; type: 'file' | 'dir'; path: string; }

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

// Strip ANSI color codes from terminal output
function stripAnsi(s: string): string {
  return s.replace(/\x1B\[[0-9;]*[mGKHF]/g, '').replace(/\x1B\[[\d;]*[A-Za-z]/g, '');
}

// Shell prefix that expands PATH to find pm2, node, etc.
const PM2_PATH_PREFIX = 'export PATH="$PATH:/usr/local/bin:/usr/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -1)/bin:$HOME/.npm-global/bin:$(npm root -g 2>/dev/null | head -1)/.bin" 2>/dev/null; ';

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
    else if (ram_total > 512)  { ram_used = ram_used / 1024;          ram_total = ram_total / 1024; }
    let ram_percent = toNum(d?.ram_percent ?? d?.memory_percent ?? d?.ramPercent ?? d?.ram?.percent);
    if (ram_percent === 0 && ram_total > 0) ram_percent = (ram_used / ram_total) * 100;
    if (ram_percent > 0 && ram_percent <= 1) ram_percent *= 100;
    return { cpu, ram_used, ram_total, ram_percent };
  }

  // Execute a shell command via bridge — the one endpoint that always works
  async execute(cmd: string): Promise<string> {
    // Try {cmd} body format first, then {command}
    for (const body of [{ cmd }, { command: cmd }]) {
      try {
        const d: any = await this.req('POST', '/execute', body);
        const out = String(d?.output ?? d?.result ?? d?.response ?? d?.stdout ?? d ?? '');
        if (out !== '[object Object]' && out !== 'null' && out !== 'undefined') {
          return stripAnsi(out);
        }
      } catch (e: any) {
        // 404 means wrong endpoint format, keep trying; other errors rethrow
        if (!String(e?.message).includes('404')) throw e;
      }
    }
    throw new Error('Execute endpoint not available');
  }

  async pm2List(): Promise<Pm2Process[]> {
    // First try REST (if bridge supports it)
    try {
      const d: any = await this.req('GET', '/pm2/list');
      const arr = Array.isArray(d) ? d
                : Array.isArray(d?.processes) ? d.processes
                : Array.isArray(d?.data) ? d.data
                : null;
      if (arr && arr.length > 0) return arr;
    } catch {}

    // Execute pm2 jlist with full PATH
    try {
      const raw = await this.execute(PM2_PATH_PREFIX + 'pm2 jlist 2>/dev/null');
      // Extract JSON array from output (might have extra text before/after)
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}

    // Parse pm2 list --no-color table output
    try {
      const raw = await this.execute(PM2_PATH_PREFIX + 'pm2 list --no-color 2>/dev/null');
      const result = parsePm2Table(raw);
      if (result.length > 0) return result;
    } catch {}

    return [];
  }

  // Get status of a single process by name (more reliable than listing all)
  async pm2Status(processName: string): Promise<string> {
    try {
      const raw = await this.execute(PM2_PATH_PREFIX + `pm2 show "${processName}" 2>/dev/null | grep -i "status" | head -1`);
      const m = raw.match(/(online|stopped|errored|stopping|launching)/i);
      if (m) return m[1].toLowerCase();
    } catch {}
    // Fallback: check if process is running via ps
    try {
      const raw = await this.execute(`ps aux 2>/dev/null | grep -i "${processName}" | grep -v grep | head -1`);
      if (raw.trim()) return 'online';
    } catch {}
    return 'unknown';
  }

  async getResources(resourcesPath: string): Promise<string[]> {
    // Try REST
    try {
      const d: any = await this.req('GET', `/resources?path=${encodeURIComponent(resourcesPath)}`);
      const arr = Array.isArray(d) ? d : Array.isArray(d?.resources) ? d.resources : null;
      if (arr && arr.length > 0) return arr.map(String).filter(Boolean);
    } catch {}
    // Execute ls -p (appends / to dirs) to get folder names only
    try {
      const raw = await this.execute(`ls -p --color=never "${resourcesPath}" 2>/dev/null`);
      return raw.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('ls:') && !l.includes('No such'))
        .map(l => l.replace(/\/$/, ''));
    } catch {}
    return [];
  }

  async getServerCfg(cfgPath: string): Promise<string> {
    try {
      const d: any = await this.req('GET', `/servercfg?path=${encodeURIComponent(cfgPath)}`);
      const s = String(d?.content ?? d?.data ?? d ?? '');
      if (s && s.length > 10 && !s.startsWith('{')) return s;
    } catch {}
    // cat the file via execute
    try {
      const raw = await this.execute(`cat "${cfgPath}" 2>/dev/null`);
      if (raw && !raw.includes('No such file')) return raw;
    } catch {}
    return '';
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    // Try REST /writefile
    try {
      await this.req('POST', '/writefile', { path: filePath, content });
      return;
    } catch {}
    // Base64 encode content and decode on server — handles any characters safely
    const b64 = btoa(unescape(encodeURIComponent(content)));
    try {
      await this.execute(`echo "${b64}" | base64 -d > "${filePath}"`);
      return;
    } catch {}
    // Python3 fallback
    const escaped = content.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '');
    await this.execute(`python3 -c "open('${filePath}', 'w').write('${escaped}')"`);
  }

  async listFiles(dirPath: string): Promise<FileEntry[]> {
    // Try REST
    try {
      const d: any = await this.req('GET', `/files?path=${encodeURIComponent(dirPath)}`);
      const arr = Array.isArray(d) ? d : Array.isArray(d?.files) ? d.files : null;
      if (arr && arr.length > 0) {
        return arr.map((f: any) => typeof f === 'string'
          ? { name: f, type: 'file' as const, path: `${dirPath}/${f}` }
          : { name: f.name ?? f, type: f.type ?? (f.isDir ? 'dir' : 'file'), path: f.path ?? `${dirPath}/${f.name}` }
        );
      }
    } catch {}
    // ls -p: directories get trailing slash
    try {
      const raw = await this.execute(`ls -p --color=never "${dirPath}" 2>/dev/null`);
      const lines = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('ls:') && !l.includes('No such'));
      if (lines.length > 0) {
        return lines.map(l => ({
          name: l.replace(/\/$/, ''),
          type: (l.endsWith('/') ? 'dir' : 'file') as 'dir' | 'file',
          path: `${dirPath}/${l.replace(/\/$/, '')}`,
        }));
      }
    } catch {}
    return [];
  }

  async readFile(filePath: string): Promise<string> {
    try {
      const d: any = await this.req('GET', `/file?path=${encodeURIComponent(filePath)}`);
      const s = String(d?.content ?? d?.data ?? d ?? '');
      if (s && s.length > 0 && !s.startsWith('{')) return s;
    } catch {}
    try { return await this.execute(`cat "${filePath}" 2>/dev/null`); } catch {}
    return '';
  }

  async startServer(processName: string): Promise<void> {
    try { await this.req('POST', '/server/start', { process_name: processName }); return; } catch {}
    const out = await this.execute(PM2_PATH_PREFIX + `pm2 start "${processName}" 2>&1`);
    if (out.toLowerCase().includes('error') && !out.toLowerCase().includes('restarted')) {
      throw new Error(out.slice(0, 200));
    }
  }

  async stopServer(processName: string): Promise<void> {
    try { await this.req('POST', '/server/stop', { process_name: processName }); return; } catch {}
    const out = await this.execute(PM2_PATH_PREFIX + `pm2 stop "${processName}" 2>&1`);
    if (out.toLowerCase().includes('error')) throw new Error(out.slice(0, 200));
  }

  async restartServer(processName: string): Promise<void> {
    try { await this.req('POST', '/server/restart', { process_name: processName }); return; } catch {}
    const out = await this.execute(PM2_PATH_PREFIX + `pm2 restart "${processName}" 2>&1`);
    if (out.toLowerCase().includes('error') && !out.toLowerCase().includes('restarted')) {
      throw new Error(out.slice(0, 200));
    }
  }

  createWebSocket(): WebSocket {
    return new WebSocket(`ws://${this.host}?key=${encodeURIComponent(this.apiKey)}`);
  }
}

function parsePm2Table(raw: string): Pm2Process[] {
  const result: Pm2Process[] = [];
  for (const line of raw.split('\n')) {
    const clean = stripAnsi(line);
    // Match │ id │ name │ ... │ status │ pattern
    const m = clean.match(/[│|]\s*(\d+)\s*[│|]\s*([\w.\-]+)\s*[│|].*[│|]\s*(online|stopped|errored|stopping|launching|errored)\s*[│|]/i);
    if (m) {
      const status = m[3].trim().toLowerCase();
      result.push({ name: m[2].trim(), pm_id: Number(m[1]), status, pm2_env: { status } });
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
