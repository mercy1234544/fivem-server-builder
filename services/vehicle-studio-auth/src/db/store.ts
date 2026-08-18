// Storage abstraction. The default implementation is SQLite (a real embedded
// SQL database — see sqlite.ts). Swap in a Postgres implementation later by
// implementing this same interface; nothing else in the app changes.

export interface UserRow { discord_id: string; username: string | null; first_verified_at: number; last_verified_at: number; revoked: number; }
export interface CodeRow { code_hash: string; discord_id: string; created_at: number; expires_at: number; used_at: number | null; }
export interface SessionRow { token_hash: string; discord_id: string; created_at: number; expires_at: number; revoked: number; last_seen_at: number; }
export interface AuditRow { id: number; ts: number; event: string; discord_id: string | null; ip: string | null; detail: string | null; }
export interface AttemptRow { ip: string; count: number; locked_until: number; }

export interface Store {
  // users
  upsertUser(discordId: string, username: string | null, now: number): void;
  getUser(discordId: string): UserRow | undefined;
  setUserRevoked(discordId: string, revoked: boolean): void;
  listUsers(limit: number): UserRow[];

  // one-time verification codes (stored hashed)
  createCode(codeHash: string, discordId: string, createdAt: number, expiresAt: number): void;
  getCode(codeHash: string): CodeRow | undefined;
  markCodeUsed(codeHash: string, now: number): void;

  // sessions (tokens stored hashed)
  createSession(tokenHash: string, discordId: string, createdAt: number, expiresAt: number): void;
  getSession(tokenHash: string): SessionRow | undefined;
  touchSession(tokenHash: string, now: number, newExpiresAt?: number): void;
  revokeSession(tokenHash: string): void;
  revokeUserSessions(discordId: string): number;
  listSessions(activeOnly: boolean, now: number, limit: number): SessionRow[];

  // audit
  addAudit(ts: number, event: string, discordId: string | null, ip: string | null, detail: string | null): void;
  listAudit(limit: number): AuditRow[];

  // config (admin-editable overrides; falls back to env)
  getConfig(key: string): string | undefined;
  setConfig(key: string, value: string): void;

  // failed-attempt tracking (per IP)
  getAttempt(ip: string): AttemptRow | undefined;
  setAttempt(ip: string, count: number, lockedUntil: number): void;
  resetAttempt(ip: string): void;

  // maintenance
  purgeExpired(now: number): void;
}
