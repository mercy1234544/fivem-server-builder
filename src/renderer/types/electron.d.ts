interface ElectronAPI {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  openDirectory: () => Promise<string | null>;
  openFile: (filters?: any) => Promise<string | null>;
  openPath: (path: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;

  server: {
    getAll: () => Promise<any[]>;
    get: (id: string) => Promise<any>;
    create: (config: any) => Promise<any>;
    update: (id: string, data: any) => Promise<any>;
    delete: (id: string) => Promise<boolean>;
    start: (id: string) => Promise<{ success: boolean; error?: string }>;
    stop: (id: string) => Promise<boolean>;
    sendCommand: (id: string, command: string) => Promise<boolean>;
    maintenance: (id: string) => Promise<string[]>;
    import: (serverPath: string, name?: string) => Promise<{
      success: boolean;
      server?: any;
      error?: string;
      detected?: {
        framework: string;
        artifactVersion: string;
        resourceCount: number;
        hasServerCfg: boolean;
        hasFXServer: boolean;
      };
    }>;
    scan: (serverPath: string) => Promise<{
      framework: string;
      artifactVersion: string;
      resourceCount: number;
      hasServerCfg: boolean;
      hasFXServer: boolean;
      serverName: string;
    }>;
  };

  resource: {
    scan: (serverPath: string) => Promise<any[]>;
    getInfo: (resourcePath: string) => Promise<any>;
    toggle: (serverPath: string, name: string, enabled: boolean) => Promise<boolean>;
    categorize: (resources: any[]) => Promise<Record<string, any[]>>;
  };

  health: {
    scan: (serverPath: string) => Promise<any>;
    fix: (serverPath: string, issue: any) => Promise<boolean>;
  };

  backup: {
    create: (serverId: string, options?: any) => Promise<any>;
    restore: (backupId: string) => Promise<boolean>;
    list: (serverId: string) => Promise<any[]>;
    delete: (backupId: string) => Promise<boolean>;
  };

  git: {
    clone: (url: string, dest: string) => Promise<{ success: boolean; error?: string }>;
    pull: (repoPath: string) => Promise<{ success: boolean; changes?: number; error?: string }>;
    getStatus: (repoPath: string) => Promise<any>;
  };

  file: {
    readDir: (dirPath: string) => Promise<any[]>;
    readFile: (filePath: string) => Promise<{ content: string; encoding: string } | null>;
    writeFile: (filePath: string, content: string) => Promise<boolean>;
    rename: (oldPath: string, newPath: string) => Promise<boolean>;
    createDir: (dirPath: string) => Promise<boolean>;
    delete: (targetPath: string) => Promise<boolean>;
    exists: (targetPath: string) => Promise<boolean>;
  };

  import: {
    pickResources: () => Promise<string[]>;
    analyze: (resourcePath: string) => Promise<{
      name: string;
      description: string;
      author: string;
      version: string;
      detectedType: string | null;
      suggestedFolder: string;
      isZip: boolean;
      dependencies: string[];
      conflicts: string[];
    }>;
    install: (opts: {
      sourcePath: string;
      serverPath: string;
      targetFolder: string;
      resourceName: string;
      replaceExisting: string[];
    }) => Promise<{ success: boolean; error?: string; replaced: string[] }>;
    scanInstalled: (serverPath: string) => Promise<string[]>;
  };

  artifact: {
    download: (version: string, dest: string) => Promise<{ success: boolean; error?: string }>;
    getVersions: () => Promise<any[]>;
    getInstalled: (serverPath: string) => Promise<string | null>;
    update: (opts: { serverPath: string; version: string }) => Promise<{ success: boolean; error?: string }>;
    onProgress: (callback: (progress: any) => void) => void;
  };

  txAdmin: {
    open: (serverPath: string) => Promise<{ url: string; port: number }>;
  };

  updates: {
    check: (serverPath: string) => Promise<{
      name: string;
      path: string;
      repoUrl: string;
      version: string;
      folder: string;
      hasUpdate: boolean;
      latestCommitDate: string;
      installedDate: string;
    }[]>;
    update: (opts: { resourcePath: string; repoUrl: string; serverPath: string }) =>
      Promise<{ success: boolean; error?: string }>;
  };

  vehicle: {
    pick: () => Promise<string[]>;
    analyze: (vehiclePath: string) => Promise<{
      name: string;
      isZip: boolean;
      hasManifest: boolean;
      hasStream: boolean;
      metaFiles: string[];
      streamFileCount: number;
      vehicleCount: number;
      needsManifest: boolean;
    }>;
    import: (opts: { sourcePath: string; serverPath: string; resourceName: string }) =>
      Promise<{ success: boolean; error?: string; generatedManifest?: boolean }>;
  };

  livery: {
    pickFolder: () => Promise<string | null>;
    scanFolder: (dir: string) => Promise<{
      root: string;
      vehicles: {
        name: string; yft: string | null; hiYft: string | null; ytds: string[]; dir: string;
      }[];
      meta: { handling: string[]; carvariations: string[]; vehiclelayouts: string[]; vehicles: string[] };
    }>;
    readBinary: (filePath: string) => Promise<string>;
    writeFile: (filePath: string, b64: string) => Promise<boolean>;
    showSaveDialog: (opts: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
    inflateRaw: (b64: string) => Promise<string | null>;
    inflate: (b64: string) => Promise<string | null>;
  };

  system: {
    getInfo: () => Promise<{
      cpuModel: string;
      cpuCores: number;
      cpuUsage: number;
      totalMem: number;
      freeMem: number;
      platform: string;
      hostname: string;
      disk: { total: number; free: number } | null;
      appVersion: string;
      electron: string;
    }>;
  };

  appUpdater: {
    check: () => Promise<any>;
    download: () => Promise<{ success: boolean; error?: string }>;
    install: () => Promise<void>;
    getVersion: () => Promise<string>;
    onStatus: (callback: (data: {
      status: 'available' | 'current' | 'downloading' | 'ready' | 'error';
      version?: string;
      percent?: number;
      error?: string;
    }) => void) => () => void;
  };

  onServerConsole: (callback: (data: { serverId: string; line: string }) => void) => () => void;
  onServerStatusChange: (callback: (data: { serverId: string; status: string }) => void) => () => void;

  onBuildProgress: (callback: (data: { current: number; total: number; resource: string; message: string }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
