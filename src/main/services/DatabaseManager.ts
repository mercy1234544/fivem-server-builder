import fs from 'fs';
import path from 'path';
import os from 'os';
import net from 'net';
import { spawn, ChildProcess, execFile } from 'child_process';
import { app } from 'electron';
import axios from 'axios';
import extractZip from 'extract-zip';

const MARIADB_VERSION = '11.4.5';
const MARIADB_ZIP_URL = `https://archive.mariadb.org/mariadb-${MARIADB_VERSION}/winx64-packages/mariadb-${MARIADB_VERSION}-winx64.zip`;

// Common Windows service names for MySQL/MariaDB installs
const SERVICE_NAMES = ['MariaDB', 'MySQL', 'MySQL80', 'MySQL57', 'MySQL84', 'mysql', 'mariadb'];

export interface DbSetupResult {
  success: boolean;
  method?: 'already-running' | 'service-started' | 'portable-started' | 'portable-installed';
  error?: string;
  connectionString?: string;
}

export interface DbCredentials {
  host: string;
  port: number;
  user: string;
  password: string;
  database?: string;
}

/**
 * Manages a local MySQL/MariaDB database for FiveM servers.
 * Can start existing Windows services, or download and run a fully
 * portable MariaDB so the user never has to install anything manually.
 */
export class DatabaseManager {
  private baseDir: string;
  private mysqldProc: ChildProcess | null = null;

  constructor() {
    this.baseDir = path.join(app.getPath('userData'), 'mariadb');
  }

  // ─── Connection helpers ────────────────────────────────────────────────

  tcpPing(host: string, port: number, timeout = 2000): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeout);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
      socket.connect(port, host);
    });
  }

  /** Parse a mysql_connection_string (URI or key=value) into credentials. */
  parseConnectionString(connString: string): DbCredentials {
    const creds: DbCredentials = { host: '127.0.0.1', port: 3306, user: 'root', password: '' };
    if (!connString) return creds;

    const uriMatch = connString.match(/mysql:\/\/(?:([^:@/]+)(?::([^@/]*))?@)?([^/:?]+)(?::(\d+))?(?:\/([^?]+))?/);
    if (uriMatch) {
      if (uriMatch[1]) creds.user = decodeURIComponent(uriMatch[1]);
      if (uriMatch[2]) creds.password = decodeURIComponent(uriMatch[2]);
      if (uriMatch[3]) creds.host = uriMatch[3];
      if (uriMatch[4]) creds.port = parseInt(uriMatch[4]);
      if (uriMatch[5]) creds.database = uriMatch[5];
      return creds;
    }

    const kv = (key: string) => {
      const m = connString.match(new RegExp(`${key}=([^;]+)`, 'i'));
      return m ? m[1].trim() : undefined;
    };
    creds.host = kv('host') || kv('server') || creds.host;
    creds.port = parseInt(kv('port') || '3306');
    creds.user = kv('user') || kv('userid') || kv('uid') || creds.user;
    creds.password = kv('password') || kv('pwd') || creds.password;
    creds.database = kv('database') || creds.database;
    return creds;
  }

  isLocalHost(host: string): boolean {
    return ['127.0.0.1', 'localhost', '::1', '0.0.0.0'].includes(host.toLowerCase());
  }

  buildConnectionString(dbName: string, creds?: Partial<DbCredentials>): string {
    const user = creds?.user || 'root';
    const password = creds?.password || '';
    const host = creds?.host || 'localhost';
    const port = creds?.port || 3306;
    const auth = password ? `${user}:${encodeURIComponent(password)}` : user;
    return `mysql://${auth}@${host}:${port}/${dbName}?charset=utf8mb4`;
  }

  // ─── Service management ────────────────────────────────────────────────

  /** Try to start an already-installed MySQL/MariaDB Windows service. */
  private async tryStartService(): Promise<boolean> {
    for (const name of SERVICE_NAMES) {
      const exists = await new Promise<boolean>((resolve) => {
        execFile('sc', ['query', name], (err, stdout) => {
          resolve(!err && stdout.includes('SERVICE_NAME'));
        });
      });
      if (!exists) continue;

      console.log(`[Database] Found service "${name}" — attempting to start`);
      const started = await new Promise<boolean>((resolve) => {
        execFile('net', ['start', name], (err, stdout, stderr) => {
          // "already been started" also counts as success
          const out = `${stdout}${stderr}`;
          resolve(!err || out.includes('already been started'));
        });
      });
      if (started && await this.waitForDb(15000)) return true;
    }
    return false;
  }

  // ─── Portable MariaDB ──────────────────────────────────────────────────

  /** Locate an already-installed portable MariaDB under userData. */
  private findPortable(): { binDir: string; dataDir: string } | null {
    if (!fs.existsSync(this.baseDir)) return null;
    try {
      for (const entry of fs.readdirSync(this.baseDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const binDir = path.join(this.baseDir, entry.name, 'bin');
        if (fs.existsSync(path.join(binDir, 'mysqld.exe'))) {
          return { binDir, dataDir: path.join(this.baseDir, 'data') };
        }
      }
    } catch {}
    return null;
  }

  private async startPortable(): Promise<boolean> {
    const portable = this.findPortable();
    if (!portable) return false;
    if (this.mysqldProc && !this.mysqldProc.killed) {
      return this.waitForDb(5000);
    }

    // Initialize data directory if it doesn't exist yet
    if (!fs.existsSync(path.join(portable.dataDir, 'mysql'))) {
      console.log('[Database] Initializing MariaDB data directory...');
      const installDb = path.join(portable.binDir, 'mariadb-install-db.exe');
      const initOk = await new Promise<boolean>((resolve) => {
        execFile(installDb, [`--datadir=${portable.dataDir}`], { timeout: 120000 }, (err) => {
          resolve(!err);
        });
      });
      if (!initOk || !fs.existsSync(path.join(portable.dataDir, 'mysql'))) {
        console.error('[Database] mariadb-install-db failed');
        return false;
      }
    }

    console.log('[Database] Starting portable MariaDB (mysqld)...');
    try {
      const proc = spawn(path.join(portable.binDir, 'mysqld.exe'), [
        `--datadir=${portable.dataDir}`,
        '--port=3306',
        '--bind-address=127.0.0.1',
        '--console',
      ], {
        cwd: portable.binDir,
        stdio: 'ignore',
        detached: false,
        windowsHide: true,
      });
      if (!proc.pid) return false;
      this.mysqldProc = proc;
      proc.on('exit', () => { this.mysqldProc = null; });
    } catch (err: any) {
      console.error('[Database] Failed to spawn mysqld:', err.message);
      return false;
    }

    return this.waitForDb(30000);
  }

  /** Download and extract portable MariaDB into userData. */
  private async installPortable(onProgress?: (msg: string, pct: number) => void): Promise<boolean> {
    try {
      onProgress?.('Downloading MariaDB (~90 MB)...', 0);
      console.log(`[Database] Downloading ${MARIADB_ZIP_URL}`);

      const response = await axios.get(MARIADB_ZIP_URL, {
        responseType: 'arraybuffer',
        timeout: 600000,
        maxRedirects: 5,
        onDownloadProgress: (e) => {
          if (e.total) {
            const pct = Math.round((e.loaded / e.total) * 100);
            onProgress?.(`Downloading MariaDB: ${pct}%`, pct);
          }
        },
      });

      const zipPath = path.join(os.tmpdir(), `mariadb-${Date.now()}.zip`);
      fs.writeFileSync(zipPath, Buffer.from(response.data));

      onProgress?.('Extracting MariaDB...', 100);
      if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir, { recursive: true });
      await extractZip(zipPath, { dir: this.baseDir });
      try { fs.unlinkSync(zipPath); } catch {}

      return this.findPortable() !== null;
    } catch (err: any) {
      console.error('[Database] Portable install failed:', err.message);
      return false;
    }
  }

  private async waitForDb(timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await this.tcpPing('127.0.0.1', 3306, 1500)) return true;
      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  }

  // ─── Main entry points ─────────────────────────────────────────────────

  /**
   * Make sure a MySQL-compatible database is running on localhost:3306.
   * Tries (in order): already running → existing Windows service →
   * portable MariaDB we manage → download + install portable MariaDB.
   */
  async ensureRunning(allowInstall: boolean, onProgress?: (msg: string, pct: number) => void): Promise<DbSetupResult> {
    if (await this.tcpPing('127.0.0.1', 3306)) {
      return { success: true, method: 'already-running' };
    }

    onProgress?.('Checking for an installed MySQL/MariaDB service...', 0);
    if (await this.tryStartService()) {
      return { success: true, method: 'service-started' };
    }

    if (this.findPortable()) {
      onProgress?.('Starting bundled MariaDB...', 0);
      if (await this.startPortable()) {
        return { success: true, method: 'portable-started' };
      }
    }

    if (!allowInstall) {
      return { success: false, error: 'MySQL is not running and no installed database was found' };
    }

    if (!(await this.installPortable(onProgress))) {
      return { success: false, error: 'Failed to download portable MariaDB' };
    }

    onProgress?.('Initializing and starting MariaDB...', 100);
    if (await this.startPortable()) {
      return { success: true, method: 'portable-installed' };
    }
    return { success: false, error: 'MariaDB installed but failed to start' };
  }

  /** Create the database if it doesn't exist. Returns true on success. */
  async createDatabase(dbName: string, creds?: Partial<DbCredentials>): Promise<boolean> {
    try {
      const mysql = require('mysql2/promise');
      const conn = await mysql.createConnection({
        host: creds?.host || '127.0.0.1',
        port: creds?.port || 3306,
        user: creds?.user || 'root',
        password: creds?.password || '',
        connectTimeout: 10000,
      });
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName.replace(/[^a-zA-Z0-9_]/g, '_')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await conn.end();
      console.log(`[Database] Database "${dbName}" ready`);
      return true;
    } catch (err: any) {
      console.error('[Database] createDatabase failed:', err.message);
      return false;
    }
  }

  /** Run a .sql file (framework schema) against a database. */
  async importSqlFile(dbName: string, sqlPath: string, creds?: Partial<DbCredentials>): Promise<boolean> {
    try {
      if (!fs.existsSync(sqlPath)) {
        console.error(`[Database] SQL file not found: ${sqlPath}`);
        return false;
      }
      const sql = fs.readFileSync(sqlPath, 'utf-8');
      return this.importSql(dbName, sql, creds);
    } catch (err: any) {
      console.error('[Database] importSqlFile failed:', err.message);
      return false;
    }
  }

  /** Run raw SQL (possibly many statements) against a database. */
  async importSql(dbName: string, sql: string, creds?: Partial<DbCredentials>): Promise<boolean> {
    try {
      const mysql = require('mysql2/promise');
      const conn = await mysql.createConnection({
        host: creds?.host || '127.0.0.1',
        port: creds?.port || 3306,
        user: creds?.user || 'root',
        password: creds?.password || '',
        database: dbName,
        multipleStatements: true,
        connectTimeout: 10000,
      });
      await conn.query(sql);
      await conn.end();
      console.log(`[Database] Imported SQL into "${dbName}" (${sql.length} chars)`);
      return true;
    } catch (err: any) {
      console.error('[Database] importSql failed:', err.message);
      return false;
    }
  }

  /** Verify credentials actually work (not just TCP reachable). */
  async verifyCredentials(creds: DbCredentials): Promise<{ ok: boolean; error?: string }> {
    try {
      const mysql = require('mysql2/promise');
      const conn = await mysql.createConnection({
        host: creds.host,
        port: creds.port,
        user: creds.user,
        password: creds.password,
        database: creds.database,
        connectTimeout: 8000,
      });
      await conn.query('SELECT 1');
      await conn.end();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /** Stop the portable mysqld if we started it. */
  shutdown() {
    if (this.mysqldProc && !this.mysqldProc.killed) {
      try { this.mysqldProc.kill(); } catch {}
      this.mysqldProc = null;
    }
  }
}
