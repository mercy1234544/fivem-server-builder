import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import { ServerManager } from './services/ServerManager';
import { ResourceScanner } from './services/ResourceScanner';
import { BackupManager } from './services/BackupManager';
import { HealthScanner } from './services/HealthScanner';
import { GitManager } from './services/GitManager';
import { FileManager } from './services/FileManager';
import { ArtifactDownloader } from './services/ArtifactDownloader';

let mainWindow: BrowserWindow | null = null;
let serverManager: ServerManager;
let resourceScanner: ResourceScanner;
let backupManager: BackupManager;
let healthScanner: HealthScanner;
let gitManager: GitManager;
let fileManager: FileManager;
let artifactDownloader: ArtifactDownloader;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../../public/icon.svg'),
  });

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function initializeServices() {
  const userDataPath = app.getPath('userData');
  serverManager = new ServerManager(userDataPath);
  resourceScanner = new ResourceScanner();
  backupManager = new BackupManager(userDataPath);
  healthScanner = new HealthScanner();
  gitManager = new GitManager();
  fileManager = new FileManager();
  artifactDownloader = new ArtifactDownloader();
}

function registerIpcHandlers() {
  // Window controls
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.handle('window:close', () => mainWindow?.close());

  // Dialog
  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
    });
    return result.filePaths[0] || null;
  });

  ipcMain.handle('dialog:openFile', async (_, filters) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters,
    });
    return result.filePaths[0] || null;
  });

  // Shell
  ipcMain.handle('shell:openPath', (_, path) => shell.openPath(path));
  ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url));

  // Server Management
  ipcMain.handle('server:getAll', () => serverManager.getAllServers());
  ipcMain.handle('server:get', (_, id) => serverManager.getServer(id));
  ipcMain.handle('server:create', (_, config) => serverManager.createServer(config));
  ipcMain.handle('server:update', (_, id, data) => serverManager.updateServer(id, data));
  ipcMain.handle('server:delete', (_, id) => serverManager.deleteServer(id));
  ipcMain.handle('server:start', (_, id) => serverManager.startServer(id));
  ipcMain.handle('server:stop', (_, id) => serverManager.stopServer(id));

  // Resource Management
  ipcMain.handle('resource:scan', (_, serverPath) => resourceScanner.scanResources(serverPath));
  ipcMain.handle('resource:getInfo', (_, resourcePath) => resourceScanner.getResourceInfo(resourcePath));
  ipcMain.handle('resource:toggle', (_, serverPath, resourceName, enabled) =>
    resourceScanner.toggleResource(serverPath, resourceName, enabled)
  );
  ipcMain.handle('resource:categorize', (_, resources) => resourceScanner.categorizeResources(resources));

  // Health Scanner
  ipcMain.handle('health:scan', (_, serverPath) => healthScanner.scanServer(serverPath));
  ipcMain.handle('health:fix', (_, serverPath, issue) => healthScanner.fixIssue(serverPath, issue));

  // Backup Management
  ipcMain.handle('backup:create', (_, serverId, options) => backupManager.createBackup(serverId, options));
  ipcMain.handle('backup:restore', (_, backupId) => backupManager.restoreBackup(backupId));
  ipcMain.handle('backup:list', (_, serverId) => backupManager.listBackups(serverId));
  ipcMain.handle('backup:delete', (_, backupId) => backupManager.deleteBackup(backupId));

  // Git Management
  ipcMain.handle('git:clone', (_, url, dest) => gitManager.cloneRepo(url, dest));
  ipcMain.handle('git:pull', (_, repoPath) => gitManager.pullUpdates(repoPath));
  ipcMain.handle('git:getStatus', (_, repoPath) => gitManager.getStatus(repoPath));

  // File Management
  ipcMain.handle('file:readDir', (_, dirPath) => fileManager.readDirectory(dirPath));
  ipcMain.handle('file:readFile', (_, filePath) => fileManager.readFile(filePath));
  ipcMain.handle('file:writeFile', (_, filePath, content) => fileManager.writeFile(filePath, content));
  ipcMain.handle('file:rename', (_, oldPath, newPath) => fileManager.rename(oldPath, newPath));
  ipcMain.handle('file:createDir', (_, dirPath) => fileManager.createDirectory(dirPath));
  ipcMain.handle('file:delete', (_, targetPath) => fileManager.delete(targetPath));
  ipcMain.handle('file:exists', (_, targetPath) => fileManager.exists(targetPath));

  // Artifact Downloads
  ipcMain.handle('artifact:download', (_, version, dest) => {
    artifactDownloader.removeAllListeners('progress');
    artifactDownloader.on('progress', (progress) => {
      mainWindow?.webContents.send('artifact:progress', progress);
    });
    return artifactDownloader.download(version, dest);
  });
  ipcMain.handle('artifact:getVersions', () => artifactDownloader.getAvailableVersions());
}

app.whenReady().then(() => {
  initializeServices();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
