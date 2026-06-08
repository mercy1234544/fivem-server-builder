import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  // Window
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // Dialog
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  openFile: (filters?: any) => ipcRenderer.invoke('dialog:openFile', filters),

  // Shell
  openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // Server
  server: {
    getAll: () => ipcRenderer.invoke('server:getAll'),
    get: (id: string) => ipcRenderer.invoke('server:get', id),
    create: (config: any) => ipcRenderer.invoke('server:create', config),
    update: (id: string, data: any) => ipcRenderer.invoke('server:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('server:delete', id),
    start: (id: string) => ipcRenderer.invoke('server:start', id),
    stop: (id: string) => ipcRenderer.invoke('server:stop', id),
  },

  // Resources
  resource: {
    scan: (serverPath: string) => ipcRenderer.invoke('resource:scan', serverPath),
    getInfo: (resourcePath: string) => ipcRenderer.invoke('resource:getInfo', resourcePath),
    toggle: (serverPath: string, name: string, enabled: boolean) =>
      ipcRenderer.invoke('resource:toggle', serverPath, name, enabled),
    categorize: (resources: any[]) => ipcRenderer.invoke('resource:categorize', resources),
  },

  // Health
  health: {
    scan: (serverPath: string) => ipcRenderer.invoke('health:scan', serverPath),
    fix: (serverPath: string, issue: any) => ipcRenderer.invoke('health:fix', serverPath, issue),
  },

  // Backup
  backup: {
    create: (serverId: string, options?: any) => ipcRenderer.invoke('backup:create', serverId, options),
    restore: (backupId: string) => ipcRenderer.invoke('backup:restore', backupId),
    list: (serverId: string) => ipcRenderer.invoke('backup:list', serverId),
    delete: (backupId: string) => ipcRenderer.invoke('backup:delete', backupId),
  },

  // Git
  git: {
    clone: (url: string, dest: string) => ipcRenderer.invoke('git:clone', url, dest),
    pull: (repoPath: string) => ipcRenderer.invoke('git:pull', repoPath),
    getStatus: (repoPath: string) => ipcRenderer.invoke('git:getStatus', repoPath),
  },

  // File
  file: {
    readDir: (dirPath: string) => ipcRenderer.invoke('file:readDir', dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke('file:readFile', filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('file:writeFile', filePath, content),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('file:rename', oldPath, newPath),
    createDir: (dirPath: string) => ipcRenderer.invoke('file:createDir', dirPath),
    delete: (targetPath: string) => ipcRenderer.invoke('file:delete', targetPath),
    exists: (targetPath: string) => ipcRenderer.invoke('file:exists', targetPath),
  },

  // Artifacts
  artifact: {
    download: (version: string, dest: string) => ipcRenderer.invoke('artifact:download', version, dest),
    getVersions: () => ipcRenderer.invoke('artifact:getVersions'),
    onProgress: (callback: (progress: any) => void) => {
      ipcRenderer.on('artifact:progress', (_, progress) => callback(progress));
    },
  },

  // Build progress (server creation)
  onBuildProgress: (callback: (data: { current: number; total: number; resource: string; message: string }) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('server:buildProgress', handler);
    // Return cleanup function
    return () => { ipcRenderer.removeListener('server:buildProgress', handler); };
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
