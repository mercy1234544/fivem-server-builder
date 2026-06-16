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
  pm2_env?: {
    status?: string;
  };
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

export class BridgeApi {
  constructor(public host: string, public apiKey: string) {}

  private get baseUrl() {
    return `http://${this.host}`;
  }

  private get headers(): Record<string, string> {
    return { 'x-api-key': this.apiKey, 'Content-Type': 'application/json' };
  }

  async ping(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${this.baseUrl}/stats`, {
        headers: this.headers,
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  async getStats(): Promise<SystemStats> {
    const res = await fetch(`${this.baseUrl}/stats`, { headers: this.headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async pm2List(): Promise<Pm2Process[]> {
    const res = await fetch(`${this.baseUrl}/pm2/list`, { headers: this.headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.processes ?? data ?? [];
  }

  async detectServers(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/servers/detect`, { headers: this.headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.servers ?? data ?? [];
  }

  async getResources(resourcesPath: string): Promise<string[]> {
    const res = await fetch(
      `${this.baseUrl}/resources?path=${encodeURIComponent(resourcesPath)}`,
      { headers: this.headers }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.resources ?? [];
  }

  async getServerCfg(cfgPath: string): Promise<string> {
    const res = await fetch(
      `${this.baseUrl}/servercfg?path=${encodeURIComponent(cfgPath)}`,
      { headers: this.headers }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.content ?? '';
  }

  async startServer(processName: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/server/start`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ process_name: processName }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async stopServer(processName: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/server/stop`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ process_name: processName }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async restartServer(processName: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/server/restart`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ process_name: processName }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/writefile`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ path: filePath, content }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  createWebSocket(): WebSocket {
    return new WebSocket(`ws://${this.host}?key=${encodeURIComponent(this.apiKey)}`);
  }
}
