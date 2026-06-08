import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import extractZip from 'extract-zip';
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Resource Import — drag-and-drop folders/ZIPs with smart conflict detection
  // ═══════════════════════════════════════════════════════════════════════════

  // Pick folders/ZIPs to import via system dialog
  ipcMain.handle('import:pickResources', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      filters: [
        { name: 'Resource (folder or ZIP)', extensions: ['zip'] },
      ],
    });
    return result.filePaths || [];
  });

  // Analyze a resource path (folder or ZIP) — figure out what it is
  ipcMain.handle('import:analyze', async (_, resourcePath: string) => {
    return analyzeResource(resourcePath);
  });

  // Import a resource into the server — handles copy, conflict replacement, server.cfg update
  ipcMain.handle('import:install', async (_, opts: {
    sourcePath: string;
    serverPath: string;
    targetFolder: string;
    resourceName: string;
    replaceExisting: string[];
  }) => {
    return importResource(opts);
  });

  // Scan server for installed resources (names only, quick)
  ipcMain.handle('import:scanInstalled', async (_, serverPath: string) => {
    const resourcesDir = path.join(serverPath, 'resources');
    if (!fs.existsSync(resourcesDir)) return [];
    const installed: string[] = [];
    const scanDir = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const sub = path.join(dir, entry.name);
          if (fs.existsSync(path.join(sub, 'fxmanifest.lua')) || fs.existsSync(path.join(sub, '__resource.lua'))) {
            installed.push(entry.name);
          } else {
            scanDir(sub); // check inside category folders like [mlo], [jobs], etc.
          }
        }
      }
    };
    scanDir(resourcesDir);
    return installed;
  });
}

// ─── Resource conflict map ───────────────────────────────────────────────────
// Maps resource "types" to known resource names that serve the same purpose.
// When importing a resource that matches a type, any already-installed resource
// from the same type group gets flagged as a conflict for auto-replacement.
const RESOURCE_TYPE_MAP: Record<string, string[]> = {
  police:      ['qb-policejob', 'esx_policejob', 'wasabi_police', 'okokPoliceJob', 'rcore_police', 'linden_outlawalert', 'ps-mdt'],
  ambulance:   ['qb-ambulancejob', 'esx_ambulancejob', 'wasabi_ambulance', 'okokAmbulanceJob', 'cd_ambulance'],
  mechanic:    ['qb-mechanicjob', 'esx_mechanicjob', 'wasabi_mechanic', 'okokMechanicJob'],
  inventory:   ['ox_inventory', 'qb-inventory', 'qs-inventory', 'lj-inventory', 'core_inventory', 'codem-inventory'],
  phone:       ['qb-phone', 'npwd', 'gcphone', 'lb-phone', 'qs-smartphone', 'roadphone', 'high-phone'],
  hud:         ['qb-hud', 'esx_hud', 'wasabi_hud', 'okokHud', 'cd_hud', 'ox_hud', 'ps-hud'],
  housing:     ['qb-houses', 'esx_property', 'wasabi_housing', 'okokHousing', 'ps-housing', 'bcs_housing'],
  clothing:    ['qb-clothing', 'esx_skin', 'fivem-appearance', 'illenium-appearance', 'wasabi_clothing'],
  multichar:   ['qb-multicharacter', 'esx_multicharacter', 'wasabi_multichar', 'cd_multicharacter'],
  garage:      ['qb-garages', 'esx_garage', 'okokGarage', 'cd_garage', 'wasabi_garage', 'jg-mechanic'],
  vehicleshop: ['qb-vehicleshop', 'esx_vehicleshop', 'wasabi_vehicleshop', 'okokVehicleShop'],
  banking:     ['qb-banking', 'esx_banking', 'wasabi_banking', 'okokBanking', 'qb-atm', 'renewed-banking'],
  target:      ['qb-target', 'ox_target', 'qtarget', 'bt-target'],
  admin:       ['qb-adminmenu', 'AdvancesAdmin', 'txAdmin', 'vMenu', 'EasyAdmin', 'Starter_Admin'],
  weather:     ['qb-weathersync', 'AdvancesWeather', 'cd_easytime', 'vSync', 'wasabi_weather'],
  voice:       ['pma-voice', 'saltychat-fivem', 'mumble-voip', 'tokovoip'],
  racing:      ['cw-racingapp', 'qb-racing', 'cd_racing'],
  gangs:       ['qb-gangs', 'wasabi_gangs', 'okokGangs'],
  prison:      ['qb-prison', 'esx_jail', 'wasabi_prison', 'rcore_prison'],
  dispatch:    ['ps-dispatch', 'cd_dispatch', 'qs-dispatch', 'linden_outlawalert', 'okokDispatch'],
  doorlock:    ['qb-doorlock', 'ox_doorlock', 'nui_doorlock'],
  fuel:        ['LegacyFuel', 'ox_fuel', 'cdn-fuel', 'okokGasStation', 'ps-fuel'],
  mlo:         [], // MLOs don't typically conflict — they stack
};

// Keywords in fxmanifest description/name that hint at the resource type
const TYPE_KEYWORDS: Record<string, string[]> = {
  police:      ['police', 'cop', 'law enforcement', 'leo', 'lspd', 'bcso', 'sheriff', 'mdt'],
  ambulance:   ['ambulance', 'ems', 'medic', 'hospital', 'paramedic'],
  mechanic:    ['mechanic', 'repair', 'garage job', 'bennys', 'tuning'],
  inventory:   ['inventory', 'backpack', 'item system'],
  phone:       ['phone', 'smartphone', 'mobile'],
  hud:         ['hud', 'heads up', 'status bar', 'minimap'],
  housing:     ['housing', 'property', 'apartment', 'real estate', 'house'],
  clothing:    ['clothing', 'appearance', 'wardrobe', 'outfit', 'skin'],
  multichar:   ['multicharacter', 'character select', 'multi char'],
  garage:      ['garage', 'parking', 'vehicle storage'],
  vehicleshop: ['vehicle shop', 'dealership', 'car shop', 'pdm'],
  banking:     ['banking', 'bank', 'atm', 'finance'],
  target:      ['target', 'interaction', 'eye'],
  admin:       ['admin', 'staff menu', 'admin menu', 'moderation'],
  weather:     ['weather', 'dynamic weather', 'time sync', 'environment'],
  voice:       ['voice', 'voip', 'proximity chat', 'radio'],
  racing:      ['racing', 'race', 'street race'],
  gangs:       ['gang', 'faction', 'turf'],
  prison:      ['prison', 'jail'],
  dispatch:    ['dispatch', 'alert system', '911'],
  doorlock:    ['door', 'lock', 'doorlock'],
  fuel:        ['fuel', 'gas station', 'petrol'],
  mlo:         ['mlo', 'interior', 'map edit', 'ymap', 'ytyp'],
};

interface AnalysisResult {
  name: string;
  description: string;
  author: string;
  version: string;
  detectedType: string | null;
  suggestedFolder: string;
  isZip: boolean;
  dependencies: string[];
  conflicts: string[]; // known resource names that serve the same purpose
}

async function analyzeResource(resourcePath: string): Promise<AnalysisResult> {
  const isZip = resourcePath.toLowerCase().endsWith('.zip');
  let manifestContent = '';
  let resourceName = path.basename(resourcePath, '.zip');

  if (isZip) {
    // Extract to temp to read manifest
    const os = await import('os');
    const tempDir = path.join(os.tmpdir(), `fivem-builder-analyze-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    try {
      await extractZip(resourcePath, { dir: tempDir });
      // Find manifest inside — could be in root or in a subfolder
      const manifest = findManifest(tempDir);
      if (manifest) {
        manifestContent = fs.readFileSync(manifest, 'utf-8');
        // Resource name is the folder containing the manifest
        const manifestDir = path.dirname(manifest);
        if (manifestDir !== tempDir) {
          resourceName = path.basename(manifestDir);
        }
      }
    } catch {} finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } else {
    // It's a folder — look for manifest
    const manifestPath = path.join(resourcePath, 'fxmanifest.lua');
    const legacyPath = path.join(resourcePath, '__resource.lua');
    if (fs.existsSync(manifestPath)) {
      manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    } else if (fs.existsSync(legacyPath)) {
      manifestContent = fs.readFileSync(legacyPath, 'utf-8');
    }
    resourceName = path.basename(resourcePath);
  }

  // Parse manifest
  const nameMatch = manifestContent.match(/name\s+['"](.*?)['"]/);
  const descMatch = manifestContent.match(/description\s+['"](.*?)['"]/);
  const authorMatch = manifestContent.match(/author\s+['"](.*?)['"]/);
  const versionMatch = manifestContent.match(/version\s+['"](.*?)['"]/);
  const depMatches = manifestContent.match(/dependenc(?:y|ies)\s*\{([^}]*)\}/s);

  const parsedName = nameMatch?.[1] || resourceName;
  const description = descMatch?.[1] || '';
  const author = authorMatch?.[1] || 'Unknown';
  const version = versionMatch?.[1] || '1.0.0';

  let dependencies: string[] = [];
  if (depMatches) {
    dependencies = depMatches[1].match(/['"]([^'"]+)['"]/g)?.map(d => d.replace(/['"]/g, '')) || [];
  }

  // Detect type from name + description + dependencies
  const searchText = `${parsedName} ${description} ${resourceName}`.toLowerCase();
  let detectedType: string | null = null;

  // First try exact name match against known resources
  for (const [type, names] of Object.entries(RESOURCE_TYPE_MAP)) {
    if (names.some(n => n.toLowerCase() === resourceName.toLowerCase() || n.toLowerCase() === parsedName.toLowerCase())) {
      detectedType = type;
      break;
    }
  }

  // Then try keyword matching
  if (!detectedType) {
    for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
      if (keywords.some(kw => searchText.includes(kw))) {
        detectedType = type;
        break;
      }
    }
  }

  // Determine target folder
  let suggestedFolder = '[custom]';
  if (detectedType === 'mlo') suggestedFolder = '[mlo]';
  else if (detectedType === 'police' || detectedType === 'ambulance' || detectedType === 'mechanic') suggestedFolder = '[jobs]';
  else if (detectedType === 'inventory') suggestedFolder = '[inventory]';
  else if (detectedType === 'phone') suggestedFolder = '[phone]';
  else if (detectedType === 'hud') suggestedFolder = '[hud]';
  else if (detectedType === 'housing') suggestedFolder = '[housing]';
  else if (detectedType === 'clothing' || detectedType === 'multichar') suggestedFolder = '[character]';
  else if (detectedType === 'garage' || detectedType === 'vehicleshop') suggestedFolder = '[vehicles]';
  else if (detectedType === 'banking') suggestedFolder = '[economy]';
  else if (detectedType === 'admin') suggestedFolder = '[admin]';
  else if (detectedType === 'weather') suggestedFolder = '[environment]';
  else if (detectedType === 'voice') suggestedFolder = '[voice]';
  else if (detectedType === 'target') suggestedFolder = '[core]';
  else if (detectedType === 'gangs') suggestedFolder = '[gangs]';
  else if (detectedType === 'prison') suggestedFolder = '[jobs]';
  else if (detectedType === 'racing') suggestedFolder = '[fun]';
  else if (detectedType === 'dispatch') suggestedFolder = '[jobs]';
  else if (detectedType === 'doorlock') suggestedFolder = '[core]';
  else if (detectedType === 'fuel') suggestedFolder = '[standalone]';

  // Get conflict list
  const conflicts = detectedType ? (RESOURCE_TYPE_MAP[detectedType] || []).filter(
    n => n.toLowerCase() !== resourceName.toLowerCase() && n.toLowerCase() !== parsedName.toLowerCase()
  ) : [];

  return {
    name: resourceName,
    description,
    author,
    version,
    detectedType,
    suggestedFolder,
    isZip,
    dependencies,
    conflicts,
  };
}

function findManifest(dir: string): string | null {
  const fxPath = path.join(dir, 'fxmanifest.lua');
  const legPath = path.join(dir, '__resource.lua');
  if (fs.existsSync(fxPath)) return fxPath;
  if (fs.existsSync(legPath)) return legPath;
  // Check one level deep (ZIP might have a subfolder)
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const sub = path.join(dir, entry.name, 'fxmanifest.lua');
      const subLeg = path.join(dir, entry.name, '__resource.lua');
      if (fs.existsSync(sub)) return sub;
      if (fs.existsSync(subLeg)) return subLeg;
    }
  }
  return null;
}

async function importResource(opts: {
  sourcePath: string;
  serverPath: string;
  targetFolder: string;
  resourceName: string;
  replaceExisting: string[];
}): Promise<{ success: boolean; error?: string; replaced: string[] }> {
  try {
    const resourcesDir = path.join(opts.serverPath, 'resources');
    const targetDir = path.join(resourcesDir, opts.targetFolder);
    const destDir = path.join(targetDir, opts.resourceName);

    // Create target folder
    fs.mkdirSync(targetDir, { recursive: true });

    // Remove conflicting resources
    const replaced: string[] = [];
    for (const conflictName of opts.replaceExisting) {
      // Search for the conflict resource in all subfolders of resources/
      const found = findResourceDir(resourcesDir, conflictName);
      if (found) {
        fs.rmSync(found, { recursive: true, force: true });
        replaced.push(conflictName);
        console.log(`Replaced conflicting resource: ${conflictName} at ${found}`);
      }
    }

    // Copy or extract to destination
    const isZip = opts.sourcePath.toLowerCase().endsWith('.zip');
    if (isZip) {
      const os = await import('os');
      const tempDir = path.join(os.tmpdir(), `fivem-builder-import-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      await extractZip(opts.sourcePath, { dir: tempDir });

      // Find the actual resource folder inside the extracted content
      const manifest = findManifest(tempDir);
      const sourceDir = manifest ? path.dirname(manifest) : tempDir;

      // Copy to destination
      if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
      copyDirRecursiveSync(sourceDir, destDir);
      fs.rmSync(tempDir, { recursive: true, force: true });
    } else {
      // Copy folder
      if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
      copyDirRecursiveSync(opts.sourcePath, destDir);
    }

    // Update server.cfg
    const cfgPath = path.join(opts.serverPath, 'server.cfg');
    if (fs.existsSync(cfgPath)) {
      let cfg = fs.readFileSync(cfgPath, 'utf-8');

      // Remove old ensure lines for replaced resources
      for (const old of replaced) {
        cfg = cfg.replace(new RegExp(`^\\s*ensure\\s+${old}\\s*$`, 'gm'), '');
      }

      // Clean up double blank lines from removals
      cfg = cfg.replace(/\n{3,}/g, '\n\n');

      // Add new ensure if not already present
      if (!cfg.match(new RegExp(`^\\s*ensure\\s+${opts.resourceName}\\s*$`, 'm'))) {
        // Try to add after similar resources or at the end
        cfg = cfg.trimEnd() + `\nensure ${opts.resourceName}\n`;
      }

      fs.writeFileSync(cfgPath, cfg, 'utf-8');
    }

    return { success: true, replaced };
  } catch (error: any) {
    return { success: false, error: error.message, replaced: [] };
  }
}

function findResourceDir(resourcesDir: string, name: string): string | null {
  // Search recursively through category folders
  for (const entry of fs.readdirSync(resourcesDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const sub = path.join(resourcesDir, entry.name);
      if (entry.name === name) return sub;
      // Check inside category brackets folders
      if (entry.name.startsWith('[')) {
        const inner = path.join(sub, name);
        if (fs.existsSync(inner)) return inner;
      }
    }
  }
  return null;
}

function copyDirRecursiveSync(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursiveSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
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
