import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import extractZip from 'extract-zip';

export interface Backup {
  id: string;
  serverId: string;
  name: string;
  path: string;
  size: number;
  type: 'full' | 'resources' | 'config' | 'database';
  createdAt: string;
}

export interface BackupOptions {
  name?: string;
  type?: 'full' | 'resources' | 'config' | 'database';
  includeResources?: boolean;
  includeConfig?: boolean;
  includeDatabase?: boolean;
}

export class BackupManager {
  private backupsDir: string;
  private indexFile: string;
  private backups: Backup[] = [];

  constructor(userDataPath: string) {
    this.backupsDir = path.join(userDataPath, 'backups');
    this.indexFile = path.join(this.backupsDir, 'index.json');
    this.ensureDir();
    this.loadIndex();
  }

  private ensureDir() {
    if (!fs.existsSync(this.backupsDir)) {
      fs.mkdirSync(this.backupsDir, { recursive: true });
    }
  }

  private loadIndex() {
    if (fs.existsSync(this.indexFile)) {
      this.backups = JSON.parse(fs.readFileSync(this.indexFile, 'utf-8'));
    }
  }

  private saveIndex() {
    fs.writeFileSync(this.indexFile, JSON.stringify(this.backups, null, 2));
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  }

  async createBackup(serverId: string, options: BackupOptions = {}): Promise<Backup> {
    const serverDataPath = this.resolveServerPath(serverId);
    const type = options.type || 'full';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = options.name || `backup-${type}-${timestamp}`;
    const backupPath = path.join(this.backupsDir, `${name}.zip`);

    await this.createZipBackup(serverDataPath, backupPath, type);

    const stats = fs.statSync(backupPath);
    const backup: Backup = {
      id: this.generateId(),
      serverId,
      name,
      path: backupPath,
      size: stats.size,
      type,
      createdAt: new Date().toISOString(),
    };

    this.backups.push(backup);
    this.saveIndex();
    return backup;
  }

  private resolveServerPath(serverId: string): string {
    const serversFile = path.join(path.dirname(this.backupsDir), 'data', 'servers.json');
    if (fs.existsSync(serversFile)) {
      const servers = JSON.parse(fs.readFileSync(serversFile, 'utf-8'));
      const server = servers.find((s: any) => s.id === serverId);
      if (server) return server.installPath;
    }
    return '';
  }

  private async createZipBackup(sourcePath: string, destPath: string, type: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(destPath);
      const archive = archiver('zip', { zlib: { level: 6 } });

      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);

      switch (type) {
        case 'full':
          archive.directory(sourcePath, false);
          break;
        case 'resources':
          const resourcesPath = path.join(sourcePath, 'resources');
          if (fs.existsSync(resourcesPath)) {
            archive.directory(resourcesPath, 'resources');
          }
          break;
        case 'config':
          const cfgPath = path.join(sourcePath, 'server.cfg');
          if (fs.existsSync(cfgPath)) {
            archive.file(cfgPath, { name: 'server.cfg' });
          }
          break;
        case 'database':
          // Database backup would typically use mysqldump
          break;
      }

      archive.finalize();
    });
  }

  async restoreBackup(backupId: string): Promise<boolean> {
    const backup = this.backups.find(b => b.id === backupId);
    if (!backup || !fs.existsSync(backup.path)) return false;

    const serverPath = this.resolveServerPath(backup.serverId);
    if (!serverPath) return false;

    try {
      await extractZip(backup.path, { dir: serverPath });
      return true;
    } catch {
      return false;
    }
  }

  async listBackups(serverId: string): Promise<Backup[]> {
    return this.backups.filter(b => b.serverId === serverId);
  }

  async deleteBackup(backupId: string): Promise<boolean> {
    const index = this.backups.findIndex(b => b.id === backupId);
    if (index === -1) return false;

    const backup = this.backups[index];
    if (fs.existsSync(backup.path)) {
      fs.unlinkSync(backup.path);
    }

    this.backups.splice(index, 1);
    this.saveIndex();
    return true;
  }
}
