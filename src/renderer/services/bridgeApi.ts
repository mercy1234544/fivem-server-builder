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
  pm2_env?: { status?: string };
  status?: string;
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

// All HTTP goes through Electron main process (Node.js/axios) — no CORS issues
function ipcRequest(host: string, apiKey: string, method: string, path: string, body?: any): Promise<any> {
  const api = (window as any).electronAPI;
  if (!api?.bridge?.request) {
    // Non-Electron fallback
    return fetch(`http://${host}${path}`, {
      method,
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
  }
  return api.bridge.request({ host, apiKey, method, path, body });
}

// Safely coerce any value to a finite number with a fallback
function num(v: any, fallback = 0): number {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

export class BridgeApi {
  constructor(public host: string, public apiKey: string) {}

  private req<T>(method: string, path: string, body?: any): Promise<T> {
    return ipcRequest(this.host, this.apiKey, method, path, body);
  }

  async ping(): Promise<boolean> {
    try {
      await this.req('GET', '/stats');
      return true;
    } catch {
      return false;
    }
  }

  async getStats(): Promise<SystemStats> {
    const d: any = await this.req('GET', '/stats');
    // Normalize — bridge may use different field names
    const cpu = num(d?.cpu ?? d?.cpu_percent ?? d?.cpu_usage ?? d?.cpuPercent);
    const ram_used = num(d?.ram_used ?? d?.memory_used ?? d?.ramUsed ?? d?.ram?.used);
    const ram_total = num(d?.ram_total ?? d?.memory_total ?? d?.ramTotal ?? d?.ram?.total, 1);
    const ram_percent = num(
      d?.ram_percent ?? d?.memory_percent ?? d?.ramPercent ?? d?.ram?.percent ??
      (ram_total > 0 ? (ram_used / ram_total) * 100 : 0)
    );
    return { cpu, ram_used, ram_total, ram_percent };
  }

  async pm2List(): Promise<Pm2Process[]> {
    const d: any = await this.req('GET', '/pm2/list');
    const arr = d?.processes ?? d?.data ?? d;
    return Array.isArray(arr) ? arr : [];
  }

  async detectServers(): Promise<any[]> {
    const d: any = await this.req('GET', '/servers/detect');
    const arr = d?.servers ?? d;
    return Array.isArray(arr) ? arr : [];
  }

  async getResources(resourcesPath: string): Promise<string[]> {
    const d: any = await this.req('GET', `/resources?path=${encodeURIComponent(resourcesPath)}`);
    const arr = d?.resources ?? d;
    return Array.isArray(arr) ? arr : [];
  }

  async getServerCfg(cfgPath: string): Promise<string> {
    const d: any = await this.req('GET', `/servercfg?path=${encodeURIComponent(cfgPath)}`);
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

  async writeFile(filePath: string, content: string): Promise<void> {
    await this.req('POST', '/writefile', { path: filePath, content });
  }

  // WebSocket stays in renderer — WS has no CORS
  createWebSocket(): WebSocket {
    return new WebSocket(`ws://${this.host}?key=${encodeURIComponent(this.apiKey)}`);
  }
}
