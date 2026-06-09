import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, ChildProcess } from 'child_process';
import crypto from 'crypto';
import { BrowserWindow } from 'electron';
import axios from 'axios';
import extractZip from 'extract-zip';
import { ArtifactDownloader } from './ArtifactDownloader';

export interface ServerConfig {
  name: string;
  framework: 'esx' | 'qbcore' | 'custom' | 'blank';
  os: 'windows' | 'linux';
  database: 'mariadb' | 'mysql';
  artifactVersion: string;
  installPath: string;
}

export interface Server {
  id: string;
  name: string;
  framework: string;
  os: string;
  database: string;
  artifactVersion: string;
  installPath: string;
  resourceCount: number;
  status: 'stopped' | 'running' | 'error';
  lastBackup: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ResourceToClone {
  name: string;
  repo: string;
  folder: string;
}

// ─── Essential resources every FiveM server needs ─────────────────────────────
const CORE_RESOURCES: ResourceToClone[] = [
  { name: 'oxmysql', repo: 'https://github.com/overextended/oxmysql', folder: '[core]' },
  { name: 'ox_lib', repo: 'https://github.com/overextended/ox_lib', folder: '[core]' },
];

const ESX_RESOURCES: ResourceToClone[] = [
  { name: 'es_extended', repo: 'https://github.com/esx-framework/esx_core', folder: '[framework]' },
  { name: 'esx_multicharacter', repo: 'https://github.com/esx-framework/esx_multicharacter', folder: '[spawn]' },
  { name: 'esx_identity', repo: 'https://github.com/esx-framework/esx_identity', folder: '[spawn]' },
  { name: 'esx_skin', repo: 'https://github.com/esx-framework/esx_skin', folder: '[character]' },
  { name: 'esx_policejob', repo: 'https://github.com/esx-framework/esx_policejob', folder: '[jobs]' },
  { name: 'esx_ambulancejob', repo: 'https://github.com/esx-framework/esx_ambulancejob', folder: '[jobs]' },
  { name: 'esx_mechanicjob', repo: 'https://github.com/esx-framework/esx_mechanicjob', folder: '[jobs]' },
  { name: 'esx_basicneeds', repo: 'https://github.com/esx-framework/esx_basicneeds', folder: '[standalone]' },
  { name: 'esx_vehicleshop', repo: 'https://github.com/esx-framework/esx_vehicleshop', folder: '[vehiclescripts]' },
  { name: 'esx_property', repo: 'https://github.com/esx-framework/esx_property', folder: '[housing]' },
];

const QBCORE_RESOURCES: ResourceToClone[] = [
  { name: 'qb-core', repo: 'https://github.com/qbcore-framework/qb-core', folder: '[framework]' },
  { name: 'qb-multicharacter', repo: 'https://github.com/qbcore-framework/qb-multicharacter', folder: '[spawn]' },
  { name: 'qb-spawn', repo: 'https://github.com/qbcore-framework/qb-spawn', folder: '[spawn]' },
  { name: 'qb-clothing', repo: 'https://github.com/qbcore-framework/qb-clothing', folder: '[character]' },
  { name: 'qb-policejob', repo: 'https://github.com/qbcore-framework/qb-policejob', folder: '[jobs]' },
  { name: 'qb-ambulancejob', repo: 'https://github.com/qbcore-framework/qb-ambulancejob', folder: '[jobs]' },
  { name: 'qb-mechanicjob', repo: 'https://github.com/qbcore-framework/qb-mechanicjob', folder: '[jobs]' },
  { name: 'qb-smallresources', repo: 'https://github.com/qbcore-framework/qb-smallresources', folder: '[standalone]' },
  { name: 'qb-vehicleshop', repo: 'https://github.com/qbcore-framework/qb-vehicleshop', folder: '[vehiclescripts]' },
  { name: 'qb-vehiclekeys', repo: 'https://github.com/qbcore-framework/qb-vehiclekeys', folder: '[vehiclescripts]' },
  { name: 'qb-garages', repo: 'https://github.com/qbcore-framework/qb-garages', folder: '[vehiclescripts]' },
  { name: 'qb-houses', repo: 'https://github.com/qbcore-framework/qb-houses', folder: '[housing]' },
  { name: 'qb-inventory', repo: 'https://github.com/qbcore-framework/qb-inventory', folder: '[inventory]' },
  { name: 'qb-shops', repo: 'https://github.com/qbcore-framework/qb-shops', folder: '[economy]' },
  { name: 'qb-banking', repo: 'https://github.com/qbcore-framework/qb-banking', folder: '[economy]' },
  { name: 'qb-hud', repo: 'https://github.com/qbcore-framework/qb-hud', folder: '[hud]' },
  { name: 'qb-target', repo: 'https://github.com/qbcore-framework/qb-target', folder: '[core]' },
  { name: 'qb-menu', repo: 'https://github.com/qbcore-framework/qb-menu', folder: '[ui]' },
  { name: 'qb-input', repo: 'https://github.com/qbcore-framework/qb-input', folder: '[ui]' },
  { name: 'qb-phone', repo: 'https://github.com/qbcore-framework/qb-phone', folder: '[phone]' },
  { name: 'qb-weathersync', repo: 'https://github.com/qbcore-framework/qb-weathersync', folder: '[environment]' },
  { name: 'progressbar', repo: 'https://github.com/qbcore-framework/progressbar', folder: '[ui]' },
];

const SHARED_RESOURCES: ResourceToClone[] = [
  { name: 'pma-voice', repo: 'https://github.com/AvarianKnight/pma-voice', folder: '[voice]' },
  { name: 'ox_target', repo: 'https://github.com/overextended/ox_target', folder: '[core]' },
  { name: 'ox_inventory', repo: 'https://github.com/overextended/ox_inventory', folder: '[inventory]' },
  { name: 'ox_doorlock', repo: 'https://github.com/overextended/ox_doorlock', folder: '[utility]' },
  { name: 'bob74_ipl', repo: 'https://github.com/Bob74/bob74_ipl', folder: '[maps]' },
];

export class ServerManager {
  private dataPath: string;
  private serversFile: string;
  private servers: Map<string, Server> = new Map();
  private processes: Map<string, ChildProcess> = new Map();

  constructor(userDataPath: string) {
    this.dataPath = path.join(userDataPath, 'data');
    this.serversFile = path.join(this.dataPath, 'servers.json');
    this.ensureDataDir();
    this.loadServers();
  }

  private ensureDataDir() {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
  }

  private loadServers() {
    if (fs.existsSync(this.serversFile)) {
      const data = JSON.parse(fs.readFileSync(this.serversFile, 'utf-8'));
      for (const server of data) {
        server.status = 'stopped';
        this.servers.set(server.id, server);
      }
    }
  }

  private saveServers() {
    const data = Array.from(this.servers.values());
    fs.writeFileSync(this.serversFile, JSON.stringify(data, null, 2));
  }

  private generateId(): string {
    const bytes = new Uint8Array(16);
    crypto.randomFillSync(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
  }

  getAllServers(): Server[] {
    return Array.from(this.servers.values()).map(s => {
      let resourceCount = 0;
      const resourcesPath = path.join(s.installPath, 'resources');
      if (fs.existsSync(resourcesPath)) {
        try {
          resourceCount = this.countResources(resourcesPath);
        } catch {}
      }
      return { ...s, resourceCount };
    });
  }

  private countResources(dir: string): number {
    let count = 0;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const manifestPath = path.join(dir, entry.name, 'fxmanifest.lua');
        const resourcePath = path.join(dir, entry.name, '__resource.lua');
        if (fs.existsSync(manifestPath) || fs.existsSync(resourcePath)) {
          count++;
        } else {
          count += this.countResources(path.join(dir, entry.name));
        }
      }
    }
    return count;
  }

  getServer(id: string): Server | null {
    return this.servers.get(id) || null;
  }

  async createServer(config: ServerConfig): Promise<Server> {
    const id = this.generateId();
    const server: Server = {
      id,
      name: config.name,
      framework: config.framework,
      os: config.os,
      database: config.database,
      artifactVersion: config.artifactVersion,
      installPath: config.installPath,
      resourceCount: 0,
      status: 'stopped',
      lastBackup: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mainWindow = BrowserWindow.getAllWindows()[0];
    const sendProgress = (message: string, current: number, total: number) => {
      if (mainWindow) {
        mainWindow.webContents.send('server:buildProgress', { current, total, resource: '', message });
      }
    };

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: Create base directory
    // ═══════════════════════════════════════════════════════════════════
    if (!fs.existsSync(config.installPath)) {
      fs.mkdirSync(config.installPath, { recursive: true });
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: Download REAL FiveM server artifacts
    // This gives us FXServer.exe, cache/, citizen/, txAdmin, all DLLs
    // ═══════════════════════════════════════════════════════════════════
    sendProgress('Downloading FiveM server artifacts...', 0, 100);

    const artifactDownloader = new ArtifactDownloader();
    artifactDownloader.on('progress', (progress: any) => {
      if (mainWindow) {
        mainWindow.webContents.send('server:buildProgress', {
          current: Math.round(progress.percent || 0),
          total: 100,
          resource: '',
          message: progress.message || `Downloading artifacts: ${Math.round(progress.percent || 0)}%`,
        });
      }
    });

    const artifactResult = await artifactDownloader.download(config.artifactVersion, config.installPath);
    if (!artifactResult.success) {
      console.error('Artifact download failed:', artifactResult.error);
      sendProgress(`ERROR: Artifact download failed — ${artifactResult.error}`, 0, 100);
      artifactDownloader.removeAllListeners();
      throw new Error(`FiveM artifact download failed: ${artifactResult.error}`);
    } else {
      sendProgress('✓ FiveM artifacts installed (FXServer.exe, txAdmin, cache, citizen). Setting up resources...', 100, 100);
      // Save artifact version marker for update tracking
      try {
        const fs = require('fs');
        const path = require('path');
        const versions = await artifactDownloader.getAvailableVersions();
        const picked = versions.find((v: any) =>
          v.version === config.artifactVersion ||
          (config.artifactVersion === 'recommended' && v.recommended) ||
          (!v.recommended && config.artifactVersion === 'latest')
        );
        const buildNum = picked?.version || config.artifactVersion;
        fs.writeFileSync(path.join(config.installPath, '.artifact-version'), buildNum, 'utf-8');
      } catch {}
    }

    artifactDownloader.removeAllListeners();

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: Build resource list based on framework choice
    // ═══════════════════════════════════════════════════════════════════
    const resourcesToClone: ResourceToClone[] = [];
    const allFolders = new Set<string>();

    if (config.framework !== 'blank') {
      resourcesToClone.push(...CORE_RESOURCES);

      if (config.framework === 'esx') {
        resourcesToClone.push(...ESX_RESOURCES);
        resourcesToClone.push(...SHARED_RESOURCES);
      } else if (config.framework === 'qbcore') {
        resourcesToClone.push(...QBCORE_RESOURCES);
        resourcesToClone.push(...SHARED_RESOURCES);
      } else if (config.framework === 'custom') {
        resourcesToClone.push(...SHARED_RESOURCES);
      }
    }

    // Collect all folder names we need
    allFolders.add('[core]');
    allFolders.add('[standalone]');
    allFolders.add('[custom]');
    allFolders.add('[mlo]');
    for (const res of resourcesToClone) {
      allFolders.add(res.folder);
    }

    // Create resource directory structure
    const resourcesDir = path.join(config.installPath, 'resources');
    if (!fs.existsSync(resourcesDir)) {
      fs.mkdirSync(resourcesDir, { recursive: true });
    }
    for (const folder of allFolders) {
      const folderPath = path.join(resourcesDir, folder);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: Download all framework resources
    // ═══════════════════════════════════════════════════════════════════
    let cloned = 0;
    const total = resourcesToClone.length;

    for (const res of resourcesToClone) {
      const destDir = path.join(resourcesDir, res.folder, res.name);
      cloned++;

      sendProgress(`Installing ${res.name} (${cloned}/${total})...`, cloned, total);

      // Skip if already exists
      if (fs.existsSync(destDir)) continue;

      try {
        await this.downloadAndExtractRepo(res.repo, destDir);
      } catch (err) {
        console.error(`Failed to download ${res.name}:`, err);
        // Continue with other resources even if one fails
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 5: Generate server.cfg
    // ═══════════════════════════════════════════════════════════════════
    sendProgress('Generating server.cfg...', total, total);
    const serverCfg = this.generateServerCfg(config, resourcesToClone);
    fs.writeFileSync(path.join(config.installPath, 'server.cfg'), serverCfg);

    // ═══════════════════════════════════════════════════════════════════
    // DONE
    // ═══════════════════════════════════════════════════════════════════
    this.servers.set(id, server);
    this.saveServers();

    sendProgress('Server build complete!', total, total);
    return server;
  }

  private generateServerCfg(config: ServerConfig, resources: ResourceToClone[] = []): string {
    const dbName = config.name.toLowerCase().replace(/\s+/g, '_');

    // Build ensure lines grouped by folder
    const folderOrder = [
      '[core]', '[framework]', '[spawn]', '[character]', '[voice]',
      '[hud]', '[ui]', '[inventory]', '[economy]', '[phone]',
      '[jobs]', '[vehiclescripts]', '[vehicles]', '[housing]', '[criminal]', '[utility]',
      '[admin]', '[environment]', '[maps]', '[standalone]', '[custom]',
    ];

    const grouped = new Map<string, string[]>();
    for (const res of resources) {
      if (!grouped.has(res.folder)) grouped.set(res.folder, []);
      grouped.get(res.folder)!.push(res.name);
    }

    let ensureLines = '';
    for (const folder of folderOrder) {
      const names = grouped.get(folder);
      if (!names || names.length === 0) continue;
      ensureLines += `\n# ${folder}\n`;
      for (const name of names) {
        ensureLines += `ensure ${name}\n`;
      }
    }

    return `# ═══════════════════════════════════════════════════════════════════════
# FiveM Server Configuration
# Generated by FiveM Server Builder
# Framework: ${config.framework.toUpperCase()}
# ═══════════════════════════════════════════════════════════════════════

# ─── Server Info ──────────────────────────────────────────────────────
sv_hostname "${config.name}"
sv_maxclients 48
sets sv_projectName "${config.name}"
sets sv_projectDesc "Powered by FiveM Server Builder"
sets locale "en-US"
sets tags "default"

# ─── License & Keys ──────────────────────────────────────────────────
# Get your license key from https://keymaster.fivem.net
sv_licenseKey "changeme"

# Steam Web API key (https://steamcommunity.com/dev/apikey)
# set steam_webApiKey ""

# ─── Connection ───────────────────────────────────────────────────────
endpoint_add_tcp "0.0.0.0:30120"
endpoint_add_udp "0.0.0.0:30120"

# ─── Database ─────────────────────────────────────────────────────────
set mysql_connection_string "mysql://root:password@localhost/${dbName}?charset=utf8mb4"

# ─── OneSync ──────────────────────────────────────────────────────────
set onesync on

# ─── Default FiveM Resources ─────────────────────────────────────────
ensure mapmanager
ensure chat
ensure spawnmanager
ensure sessionmanager
ensure basic-gamemode
ensure hardcap
ensure baseevents

# ═══════════════════════════════════════════════════════════════════════
# Server Resources
# ═══════════════════════════════════════════════════════════════════════
${ensureLines}
# ─── Custom Resources ────────────────────────────────────────────────
# Add your custom resources below
`;
  }

  /**
   * Download a GitHub repo as ZIP and extract to destination.
   * No git needed, no auth prompts.
   */
  private async downloadAndExtractRepo(repoUrl: string, destination: string): Promise<void> {
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) throw new Error('Invalid GitHub URL');
    const [, owner, repo] = match;
    const repoName = repo.replace(/\.git$/, '');

    // Try main branch, fall back to master
    let zipUrl = `https://github.com/${owner}/${repoName}/archive/refs/heads/main.zip`;
    let response;
    try {
      response = await axios.get(zipUrl, { responseType: 'arraybuffer', timeout: 60000 });
    } catch {
      zipUrl = `https://github.com/${owner}/${repoName}/archive/refs/heads/master.zip`;
      response = await axios.get(zipUrl, { responseType: 'arraybuffer', timeout: 60000 });
    }

    const tempDir = os.tmpdir();
    const zipPath = path.join(tempDir, `${repoName}-${Date.now()}.zip`);
    fs.writeFileSync(zipPath, Buffer.from(response.data));

    const extractDir = path.join(tempDir, `${repoName}-extract-${Date.now()}`);
    fs.mkdirSync(extractDir, { recursive: true });
    await extractZip(zipPath, { dir: extractDir });

    // GitHub ZIPs have a single subfolder like "repo-main/"
    const extracted = fs.readdirSync(extractDir);
    const innerDir = extracted.length === 1
      ? path.join(extractDir, extracted[0])
      : extractDir;

    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    // Copy all files to destination
    this.copyDirRecursive(innerDir, destination);

    // Save source URL for future updates
    fs.writeFileSync(path.join(destination, '.fivem-builder-source'), repoUrl);

    // Cleanup
    try {
      fs.unlinkSync(zipPath);
      fs.rmSync(extractDir, { recursive: true, force: true });
    } catch {}
  }

  private copyDirRecursive(src: string, dest: string) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this.copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  async updateServer(id: string, data: Partial<Server>): Promise<Server | null> {
    const server = this.servers.get(id);
    if (!server) return null;

    const updated = { ...server, ...data, updatedAt: new Date().toISOString() };
    this.servers.set(id, updated);
    this.saveServers();
    return updated;
  }

  /**
   * Import an existing FiveM server from a folder on disk.
   * Auto-detects framework, artifact version, resources, etc.
   */
  async importExistingServer(serverPath: string, name?: string): Promise<{
    success: boolean;
    server?: Server;
    error?: string;
    detected?: {
      framework: string;
      artifactVersion: string;
      resourceCount: number;
      hasServerCfg: boolean;
      hasFXServer: boolean;
    };
  }> {
    try {
      if (!fs.existsSync(serverPath)) {
        return { success: false, error: 'Directory does not exist' };
      }

      // Check if this server is already imported
      for (const [, existing] of this.servers) {
        const existingNorm = path.resolve(existing.installPath).toLowerCase();
        const newNorm = path.resolve(serverPath).toLowerCase();
        if (existingNorm === newNorm) {
          return { success: false, error: `This server is already imported as "${existing.name}"` };
        }
      }

      // ── Detect FXServer.exe ──
      const hasFXServer = fs.existsSync(path.join(serverPath, 'FXServer.exe'))
        || fs.existsSync(path.join(serverPath, 'run.sh'));

      // ── Detect server.cfg ──
      const hasServerCfg = fs.existsSync(path.join(serverPath, 'server.cfg'));

      // ── Detect artifact version ──
      let artifactVersion = 'unknown';
      const versionMarker = path.join(serverPath, '.artifact-version');
      if (fs.existsSync(versionMarker)) {
        artifactVersion = fs.readFileSync(versionMarker, 'utf-8').trim();
      }

      // ── Detect framework from resources ──
      let framework = 'custom';
      const resourcesDir = path.join(serverPath, 'resources');
      if (fs.existsSync(resourcesDir)) {
        // Check for QBCore
        if (this.findResourceRecursive(resourcesDir, 'qb-core')) {
          framework = 'qbcore';
        } else if (this.findResourceRecursive(resourcesDir, 'es_extended')) {
          framework = 'esx';
        }
      }

      // ── Detect server name from server.cfg ──
      let detectedName = name || path.basename(serverPath);
      if (hasServerCfg && !name) {
        try {
          const cfg = fs.readFileSync(path.join(serverPath, 'server.cfg'), 'utf-8');
          const hostnameMatch = cfg.match(/sv_hostname\s+"([^"]+)"/);
          if (hostnameMatch) {
            detectedName = hostnameMatch[1];
          }
        } catch {}
      }

      // ── Count resources ──
      let resourceCount = 0;
      if (fs.existsSync(resourcesDir)) {
        resourceCount = this.countResources(resourcesDir);
      }

      // ── Detect OS ──
      const detectedOS = fs.existsSync(path.join(serverPath, 'FXServer.exe')) ? 'windows' : 'linux';

      // ── Create server entry ──
      const id = this.generateId();
      const server: Server = {
        id,
        name: detectedName,
        framework,
        os: detectedOS,
        database: 'mysql',
        artifactVersion,
        installPath: serverPath,
        resourceCount,
        status: 'stopped',
        lastBackup: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.servers.set(id, server);
      this.saveServers();

      return {
        success: true,
        server,
        detected: {
          framework,
          artifactVersion,
          resourceCount,
          hasServerCfg,
          hasFXServer,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Scan an existing server folder WITHOUT importing — just detect what's there.
   */
  async scanExistingServer(serverPath: string): Promise<{
    framework: string;
    artifactVersion: string;
    resourceCount: number;
    hasServerCfg: boolean;
    hasFXServer: boolean;
    serverName: string;
  }> {
    const hasFXServer = fs.existsSync(path.join(serverPath, 'FXServer.exe'))
      || fs.existsSync(path.join(serverPath, 'run.sh'));

    const hasServerCfg = fs.existsSync(path.join(serverPath, 'server.cfg'));

    let artifactVersion = 'unknown';
    const versionMarker = path.join(serverPath, '.artifact-version');
    if (fs.existsSync(versionMarker)) {
      artifactVersion = fs.readFileSync(versionMarker, 'utf-8').trim();
    }

    let framework = 'custom';
    const resourcesDir = path.join(serverPath, 'resources');
    if (fs.existsSync(resourcesDir)) {
      if (this.findResourceRecursive(resourcesDir, 'qb-core')) {
        framework = 'qbcore';
      } else if (this.findResourceRecursive(resourcesDir, 'es_extended')) {
        framework = 'esx';
      }
    }

    let serverName = path.basename(serverPath);
    if (hasServerCfg) {
      try {
        const cfg = fs.readFileSync(path.join(serverPath, 'server.cfg'), 'utf-8');
        const hostnameMatch = cfg.match(/sv_hostname\s+"([^"]+)"/);
        if (hostnameMatch) serverName = hostnameMatch[1];
      } catch {}
    }

    let resourceCount = 0;
    if (fs.existsSync(resourcesDir)) {
      resourceCount = this.countResources(resourcesDir);
    }

    return { framework, artifactVersion, resourceCount, hasServerCfg, hasFXServer, serverName };
  }

  /**
   * Recursively search for a resource directory by name.
   */
  private findResourceRecursive(dir: string, resourceName: string, depth = 0): boolean {
    if (depth > 4) return false;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === resourceName) {
          const manifestPath = path.join(dir, entry.name, 'fxmanifest.lua');
          const resourcePath = path.join(dir, entry.name, '__resource.lua');
          if (fs.existsSync(manifestPath) || fs.existsSync(resourcePath)) {
            return true;
          }
        }
        if (this.findResourceRecursive(path.join(dir, entry.name), resourceName, depth + 1)) {
          return true;
        }
      }
    } catch {}
    return false;
  }

  async deleteServer(id: string): Promise<boolean> {
    const deleted = this.servers.delete(id);
    if (deleted) this.saveServers();
    return deleted;
  }

  async startServer(id: string): Promise<{ success: boolean; error?: string }> {
    const server = this.servers.get(id);
    if (!server) {
      console.error(`[StartServer] No server found with id: ${id}`);
      return { success: false, error: `Server not found (id: ${id}). Try removing and re-importing it.` };
    }

    console.log(`[StartServer] Starting "${server.name}" at ${server.installPath}`);

    // Kill existing process if any
    if (this.processes.has(id)) {
      try { this.processes.get(id)!.kill(); } catch {}
      this.processes.delete(id);
    }

    const executable = server.os === 'windows'
      ? path.join(server.installPath, 'FXServer.exe')
      : path.join(server.installPath, 'run.sh');

    if (!fs.existsSync(executable)) {
      console.error(`[StartServer] FXServer.exe not found at: ${executable}`);
      server.status = 'error';
      this.saveServers();
      return { success: false, error: `FXServer.exe not found at:\n${executable}\n\nUse the Resource Updater to download artifacts first.` };
    }

    // Check for server.cfg
    const cfgPath = path.join(server.installPath, 'server.cfg');
    if (!fs.existsSync(cfgPath)) {
      console.error(`[StartServer] server.cfg not found at: ${cfgPath}`);
      return { success: false, error: 'server.cfg not found. The server needs a config file to start.' };
    }

    console.log(`[StartServer] Launching: ${executable} +exec server.cfg`);

    try {
      const proc = spawn(executable, ['+exec', 'server.cfg'], {
        cwd: server.installPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: false,
      });

      // Check if process spawned successfully
      if (!proc || !proc.pid) {
        console.error('[StartServer] Failed to spawn process — no PID');
        server.status = 'error';
        this.saveServers();
        return { success: false, error: 'Failed to launch FXServer process.' };
      }

      console.log(`[StartServer] FXServer launched with PID: ${proc.pid}`);

      this.processes.set(id, proc);
      server.status = 'running';
      this.saveServers();

      const mainWin = BrowserWindow.getAllWindows()[0];

      // Capture stdout for console output
      if (proc.stdout) {
        proc.stdout.on('data', (data: Buffer) => {
          const line = data.toString();
          if (mainWin && !mainWin.isDestroyed()) {
            mainWin.webContents.send('server:console', { serverId: id, line });
          }
        });
      }
      if (proc.stderr) {
        proc.stderr.on('data', (data: Buffer) => {
          const line = data.toString();
          if (mainWin && !mainWin.isDestroyed()) {
            mainWin.webContents.send('server:console', { serverId: id, line: `[ERROR] ${line}` });
          }
        });
      }

      proc.on('error', (err) => {
        console.error(`FXServer process error for ${server.name}:`, err);
        server.status = 'error';
        this.processes.delete(id);
        this.saveServers();
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('server:statusChange', { serverId: id, status: 'error' });
        }
      });

      proc.on('exit', (code, signal) => {
        console.log(`FXServer exited for ${server.name}: code=${code}, signal=${signal}`);
        server.status = 'stopped';
        this.processes.delete(id);
        this.saveServers();
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('server:statusChange', { serverId: id, status: 'stopped' });
        }
      });

      return { success: true };
    } catch (err: any) {
      console.error('Failed to start FXServer:', err);
      server.status = 'error';
      this.saveServers();
      return { success: false, error: `Launch error: ${err.message}` };
    }
  }

  async stopServer(id: string): Promise<boolean> {
    const proc = this.processes.get(id);
    const server = this.servers.get(id);

    if (proc) {
      try {
        // On Windows, use taskkill to properly terminate the process tree
        if (process.platform === 'win32' && proc.pid) {
          spawn('taskkill', ['/pid', proc.pid.toString(), '/f', '/t'], { stdio: 'ignore' });
        } else {
          proc.kill('SIGTERM');
        }
      } catch {}
      this.processes.delete(id);
    }

    if (server) {
      server.status = 'stopped';
      this.saveServers();
    }
    return true;
  }
}
