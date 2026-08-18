import { Store } from './db/store';
import { DiscordClient } from './discord';
import { config } from './config';
import { generateCode, generateToken, hash, normalizeCode } from './crypto';

export type ErrKind =
  | 'not_member' | 'missing_role' | 'revoked' | 'invalid_code' | 'expired_code'
  | 'used_code' | 'wrong_account' | 'rate_limited' | 'invalid_session' | 'discord_error';

export class AuthError extends Error {
  constructor(public kind: ErrKind, message: string) { super(message); }
}

export interface AuthServiceOpts {
  store: Store;
  discord: DiscordClient;
  now?: () => number;                 // injectable clock for tests
}

/**
 * All authorization decisions happen here, server-side. The desktop client can
 * never grant itself access — it can only present an OAuth code or a session
 * token, both of which are validated here against the database + Discord.
 */
export class AuthService {
  private store: Store;
  private discord: DiscordClient;
  private now: () => number;

  constructor(o: AuthServiceOpts) { this.store = o.store; this.discord = o.discord; this.now = o.now || (() => Date.now()); }

  // config overrides (admin-editable) fall back to env defaults
  get requireRole() { return this.store.getConfig('require_role') != null ? this.store.getConfig('require_role') === 'true' : config.requireRole; }
  get codeExpirationMs() { const c = this.store.getConfig('code_expiration'); return (c ? Number(c) : config.codeExpiration) * 1000; }
  get sessionTtlMs() { return config.sessionTtl * 1000; }

  authorizeUrl(state: string) { return this.discord.authorizeUrl(state); }

  private audit(event: string, discordId: string | null, ip: string | null, detail?: string) {
    this.store.addAudit(this.now(), event, discordId, ip, detail ?? null);
  }

  /** After Discord OAuth: verify membership/role, then mint a one-time code. */
  async completeOAuth(oauthCode: string, ip: string | null): Promise<{ code: string; expiresAt: number; username: string; discordId: string }> {
    let identity;
    try { identity = await this.discord.exchangeCode(oauthCode); }
    catch (e: any) { this.audit('discord_error', null, ip, 'oauth exchange'); throw new AuthError('discord_error', 'Discord verification is temporarily unavailable.'); }
    this.audit('discord_authenticated', identity.discordId, ip, identity.username);

    const access = await this.discord.checkAccess(identity.discordId);
    if (!access.member) { this.audit('not_member', identity.discordId, ip); throw new AuthError('not_member', 'You must be a member of the Discord server.'); }
    if (this.requireRole && !access.hasRole) { this.audit('missing_role', identity.discordId, ip); throw new AuthError('missing_role', "You don't have the required Vehicle Studio role."); }

    this.store.upsertUser(identity.discordId, identity.username, this.now());
    const user = this.store.getUser(identity.discordId);
    if (user?.revoked) { this.audit('revoked_blocked', identity.discordId, ip); throw new AuthError('revoked', 'Your access has been revoked.'); }

    const code = generateCode();
    const now = this.now();
    const expiresAt = now + this.codeExpirationMs;
    this.store.createCode(hash(code), identity.discordId, now, expiresAt);
    this.audit('code_generated', identity.discordId, ip);
    return { code, expiresAt, username: identity.username, discordId: identity.discordId };
  }

  /** Redeem a one-time code → issue a secure session. Rate-limited per IP. */
  async redeem(codeInput: string, ip: string): Promise<{ token: string; expiresAt: number; username: string; discordId: string }> {
    const now = this.now();
    const att = this.store.getAttempt(ip);
    if (att && att.locked_until > now) { this.audit('rate_limited', null, ip); throw new AuthError('rate_limited', 'Too many attempts. Please try again later.'); }

    const fail = (kind: ErrKind, msg: string): never => {
      const count = (att?.count || 0) + 1;
      const locked = count >= config.maxFailedAttempts ? now + config.failedAttemptLockout * 1000 : 0;
      this.store.setAttempt(ip, locked ? 0 : count, locked);
      this.audit('failed_verification', null, ip, kind);
      throw new AuthError(kind, msg);
    };

    const row = this.store.getCode(hash(normalizeCode(codeInput)));
    if (!row) return fail('invalid_code', 'Invalid verification code.');
    if (row.used_at) return fail('used_code', 'This verification code has already been used.');
    if (row.expires_at < now) return fail('expired_code', 'This verification code has expired.');

    const user = this.store.getUser(row.discord_id);
    if (user?.revoked) return fail('revoked', 'Your access has been revoked.');

    // Re-check Discord authorization at redemption time (membership can change).
    let access;
    try { access = await this.discord.checkAccess(row.discord_id); }
    catch { throw new AuthError('discord_error', 'Discord verification is temporarily unavailable.'); }
    if (!access.member) return fail('not_member', 'You must be a member of the Discord server.');
    if (this.requireRole && !access.hasRole) return fail('missing_role', "You don't have the required Vehicle Studio role.");

    this.store.markCodeUsed(row.code_hash, now);
    const token = generateToken();
    const expiresAt = now + this.sessionTtlMs;
    this.store.createSession(hash(token), row.discord_id, now, expiresAt);
    this.store.resetAttempt(ip);
    this.audit('access_granted', row.discord_id, ip);
    return { token, expiresAt, username: user?.username || '', discordId: row.discord_id };
  }

  /** Validate a session token. This is the check the desktop gate depends on. */
  validateSession(token: string): { authorized: boolean; discordId?: string; username?: string; expiresAt?: number; reason?: string } {
    if (!token) return { authorized: false, reason: 'invalid_session' };
    const now = this.now();
    const s = this.store.getSession(hash(token));
    if (!s) return { authorized: false, reason: 'invalid_session' };
    if (s.revoked) return { authorized: false, reason: 'revoked' };
    if (s.expires_at < now) return { authorized: false, reason: 'expired_session' };
    const user = this.store.getUser(s.discord_id);
    if (user?.revoked) return { authorized: false, reason: 'revoked' };
    this.store.touchSession(s.token_hash, now);
    return { authorized: true, discordId: s.discord_id, username: user?.username || '', expiresAt: s.expires_at };
  }

  /** Slide the session expiry forward (refresh) while it's still valid. */
  refreshSession(token: string): { ok: boolean; expiresAt?: number } {
    const v = this.validateSession(token);
    if (!v.authorized) return { ok: false };
    const now = this.now();
    const expiresAt = now + this.sessionTtlMs;
    this.store.touchSession(hash(token), now, expiresAt);
    return { ok: true, expiresAt };
  }

  logout(token: string, ip: string | null) {
    const s = this.store.getSession(hash(token));
    if (s) { this.store.revokeSession(s.token_hash); this.audit('session_revoked', s.discord_id, ip); }
  }

  // ── admin ──────────────────────────────────────────────────────────────────
  revokeUser(discordId: string) { this.store.setUserRevoked(discordId, true); const n = this.store.revokeUserSessions(discordId); this.audit('access_revoked', discordId, null, `sessions:${n}`); return n; }
  reinstateUser(discordId: string) { this.store.setUserRevoked(discordId, false); this.audit('access_reinstated', discordId, null); }
  listUsers() { return this.store.listUsers(500); }
  listSessions() { return this.store.listSessions(true, this.now(), 500); }
  listAudit() { return this.store.listAudit(500); }
  setConfig(key: string, value: string) { this.store.setConfig(key, value); this.audit('config_changed', null, null, `${key}=${value}`); }
  purge() { this.store.purgeExpired(this.now()); }
}
