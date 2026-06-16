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

// All HTTP calls go through the Electron main process (Node.js / axios)
// so Chromium's CORS restrictions in the renderer never block them.
function ipcRequest(host: string, apiKey: string, method: string, path: string, body?: any) {
  const api = (window as any).electronAPI;
  if (!api?.bridge?.request) {
    // fallback for browser / dev without Electron (won't work if bridge has no CORS headers)
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

export class BridgeApi {
  constructor(public host: string, public apiKey: string) {}

  private req<T>(method: string, path: string, body?: any): Promise<T> {
    return ipcRequest(this.host, this.apiKey, method, path, body) as Promise<T>;
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
    return this.req('GET', '/stats');
  }

  async pm2List(): Promise<Pm2Process[]> {
    const data: any = await this.req('GET', '/pm2/list');
    return data?.processes ?? data ?? [];
  }

  async detectServers(): Promise<any[]> {
    const data: any = await this.req('GET', '/servers/detect');
    return data?.servers ?? data ?? [];
  }

  async getResources(resourcesPath: string): Promise<string[]> {
    const data: any = await this.req('GET', `/resources?path=${encodeURIComponent(resourcesPath)}`);
    return data?.resources ?? [];
  }

  async getServerCfg(cfgPath: string): Promise<string> {
    const data: any = await this.req('GET', `/servercfg?path=${encodeURIComponent(cfgPath)}`);
    return data?.content ?? '';
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

  // WebSocket stays in the renderer — WS has no CORS
  createWebSocket(): WebSocket {
    return new WebSocket(`ws://${this.host}?key=${encodeURIComponent(this.apiKey)}`);
  }
}
