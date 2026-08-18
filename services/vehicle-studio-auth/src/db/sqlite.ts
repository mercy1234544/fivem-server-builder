import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { Store, UserRow, CodeRow, SessionRow, AuditRow, AttemptRow } from './store';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  discord_id TEXT PRIMARY KEY,
  username TEXT,
  first_verified_at INTEGER NOT NULL,
  last_verified_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS codes (
  code_hash TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  event TEXT NOT NULL,
  discord_id TEXT,
  ip TEXT,
  detail TEXT
);
CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS attempts (ip TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_sessions_discord ON sessions(discord_id);
CREATE INDEX IF NOT EXISTS idx_codes_discord ON codes(discord_id);
`;

export class SqliteStore implements Store {
  private db: Database.Database;

  constructor(file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  upsertUser(discordId: string, username: string | null, now: number): void {
    this.db.prepare(`INSERT INTO users (discord_id, username, first_verified_at, last_verified_at)
      VALUES (?,?,?,?)
      ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username, last_verified_at=excluded.last_verified_at`)
      .run(discordId, username, now, now);
  }
  getUser(discordId: string) { return this.db.prepare('SELECT * FROM users WHERE discord_id=?').get(discordId) as UserRow | undefined; }
  setUserRevoked(discordId: string, revoked: boolean) { this.db.prepare('UPDATE users SET revoked=? WHERE discord_id=?').run(revoked ? 1 : 0, discordId); }
  listUsers(limit: number) { return this.db.prepare('SELECT * FROM users ORDER BY last_verified_at DESC LIMIT ?').all(limit) as UserRow[]; }

  createCode(codeHash: string, discordId: string, createdAt: number, expiresAt: number) {
    this.db.prepare('INSERT INTO codes (code_hash, discord_id, created_at, expires_at) VALUES (?,?,?,?)').run(codeHash, discordId, createdAt, expiresAt);
  }
  getCode(codeHash: string) { return this.db.prepare('SELECT * FROM codes WHERE code_hash=?').get(codeHash) as CodeRow | undefined; }
  markCodeUsed(codeHash: string, now: number) { this.db.prepare('UPDATE codes SET used_at=? WHERE code_hash=?').run(now, codeHash); }

  createSession(tokenHash: string, discordId: string, createdAt: number, expiresAt: number) {
    this.db.prepare('INSERT INTO sessions (token_hash, discord_id, created_at, expires_at, last_seen_at) VALUES (?,?,?,?,?)').run(tokenHash, discordId, createdAt, expiresAt, createdAt);
  }
  getSession(tokenHash: string) { return this.db.prepare('SELECT * FROM sessions WHERE token_hash=?').get(tokenHash) as SessionRow | undefined; }
  touchSession(tokenHash: string, now: number, newExpiresAt?: number) {
    if (newExpiresAt) this.db.prepare('UPDATE sessions SET last_seen_at=?, expires_at=? WHERE token_hash=?').run(now, newExpiresAt, tokenHash);
    else this.db.prepare('UPDATE sessions SET last_seen_at=? WHERE token_hash=?').run(now, tokenHash);
  }
  revokeSession(tokenHash: string) { this.db.prepare('UPDATE sessions SET revoked=1 WHERE token_hash=?').run(tokenHash); }
  revokeUserSessions(discordId: string) { return this.db.prepare('UPDATE sessions SET revoked=1 WHERE discord_id=? AND revoked=0').run(discordId).changes; }
  listSessions(activeOnly: boolean, now: number, limit: number) {
    const sql = activeOnly
      ? 'SELECT * FROM sessions WHERE revoked=0 AND expires_at>? ORDER BY last_seen_at DESC LIMIT ?'
      : 'SELECT * FROM sessions ORDER BY last_seen_at DESC LIMIT ?';
    return (activeOnly ? this.db.prepare(sql).all(now, limit) : this.db.prepare(sql).all(limit)) as SessionRow[];
  }

  addAudit(ts: number, event: string, discordId: string | null, ip: string | null, detail: string | null) {
    this.db.prepare('INSERT INTO audit (ts, event, discord_id, ip, detail) VALUES (?,?,?,?,?)').run(ts, event, discordId, ip, detail);
  }
  listAudit(limit: number) { return this.db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(limit) as AuditRow[]; }

  getConfig(key: string) { const r = this.db.prepare('SELECT value FROM config WHERE key=?').get(key) as { value: string } | undefined; return r?.value; }
  setConfig(key: string, value: string) { this.db.prepare('INSERT INTO config (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value); }

  getAttempt(ip: string) { return this.db.prepare('SELECT * FROM attempts WHERE ip=?').get(ip) as AttemptRow | undefined; }
  setAttempt(ip: string, count: number, lockedUntil: number) { this.db.prepare('INSERT INTO attempts (ip,count,locked_until) VALUES (?,?,?) ON CONFLICT(ip) DO UPDATE SET count=excluded.count, locked_until=excluded.locked_until').run(ip, count, lockedUntil); }
  resetAttempt(ip: string) { this.db.prepare('DELETE FROM attempts WHERE ip=?').run(ip); }

  purgeExpired(now: number) {
    this.db.prepare('DELETE FROM codes WHERE expires_at < ?').run(now);
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ? AND revoked=0').run(now);
    this.db.prepare('DELETE FROM attempts WHERE locked_until < ?').run(now);
  }
}
