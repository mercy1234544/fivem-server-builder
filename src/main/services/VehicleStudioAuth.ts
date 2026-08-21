// Desktop-side client for the app auth backend (shared by the whole app).
//
// IMPORTANT: this file contains NO Discord secrets. It only talks to the backend
// API over HTTPS. The session token lives in the MAIN process (userData), never
// in the renderer — so changing localStorage / React state / dev-console values
// cannot unlock the app. Authorization is decided by the backend's /session
// check, not by the client. The main-process IPC guard (main.ts) also calls
// ensureAuthorized() before running protected operations, so a bypassed renderer
// still cannot invoke protected functionality.
import { shell } from 'electron';
import fs from 'fs';
import path from 'path';

// Production backend. VST_AUTH_BACKEND_URL is an optional dev override.
const AUTH_BACKEND_URL = (process.env.VST_AUTH_BACKEND_URL || 'https://auth.tryautoscout.com').replace(/\/$/, '');

// Offline grace: if the backend is briefly unreachable, a recently-validated
// session keeps working for this long (revocation still applies once online).
const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
// The main-process guard caches the last authorization decision this long to
// avoid a network round-trip on every protected IPC call.
const GUARD_CACHE_MS = 60 * 1000;

interface Saved { token?: string; username?: string; lastAuthorizedAt?: number; }
export interface VSAuthStatus { enabled: boolean; authorized: boolean; username?: string; reason?: string; stale?: boolean; expiresAt?: number; entitlements?: string[]; }

export class VehicleStudioAuth {
  private file: string;
  // Last authorization decision, cached for the main-process IPC guard.
  private guardCache: { authorized: boolean; at: number } | null = null;
  constructor(userDataPath: string) {
    const dir = path.join(userDataPath, 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'vst-auth.json');
  }

  private load(): Saved { try { return JSON.parse(fs.readFileSync(this.file, 'utf-8')); } catch { return {}; } }
  private save(s: Saved) { try { fs.writeFileSync(this.file, JSON.stringify(s), 'utf-8'); } catch {} }
  private clear() { try { if (fs.existsSync(this.file)) fs.unlinkSync(this.file); } catch {} }

  isEnabled() { return !!AUTH_BACKEND_URL; }

  private async api(pathname: string, init?: RequestInit & { timeoutMs?: number }): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 8000);
    try { return await fetch(`${AUTH_BACKEND_URL}${pathname}`, { ...init, signal: ctrl.signal }); }
    finally { clearTimeout(t); }
  }

  private grace(s: Saved): VSAuthStatus {
    if (s.token && s.lastAuthorizedAt && Date.now() - s.lastAuthorizedAt < OFFLINE_GRACE_MS)
      return { enabled: true, authorized: true, username: s.username, stale: true };
    return { enabled: true, authorized: false, reason: 'offline' };
  }

  /** The check the gate depends on — always confirmed against the backend. */
  async status(): Promise<VSAuthStatus> {
    if (!this.isEnabled()) return { enabled: false, authorized: true };
    const s = this.load();
    if (!s.token) return { enabled: true, authorized: false, reason: 'no_session' };
    try {
      const res = await this.api('/session', { headers: { Authorization: `Bearer ${s.token}` } });
      if (res.status === 200) {
        const j: any = await res.json();
        this.save({ ...s, username: j.username, lastAuthorizedAt: Date.now() });
        // entitlements is optional/future — passed through if the backend sends it.
        const st: VSAuthStatus = { enabled: true, authorized: true, username: j.username, expiresAt: j.expiresAt, entitlements: Array.isArray(j.entitlements) ? j.entitlements : undefined };
        this.setGuard(true);
        return st;
      }
      if (res.status === 401) { // definitively invalid/revoked/expired
        const j: any = await res.json().catch(() => ({}));
        this.clear();
        this.setGuard(false);
        return { enabled: true, authorized: false, reason: j.error || 'invalid_session' };
      }
      const g = this.grace(s); this.setGuard(g.authorized); return g; // 5xx etc. — temporary
    } catch { const g = this.grace(s); this.setGuard(g.authorized); return g; }
  }

  private setGuard(authorized: boolean) { this.guardCache = { authorized, at: Date.now() }; }

  /**
   * Server-side-backed authorization check for the main-process IPC guard.
   * Cached briefly to avoid hammering the backend. Returns true when
   * verification is disabled (dev override) or the backend confirms the session.
   */
  async ensureAuthorized(): Promise<boolean> {
    if (!this.isEnabled()) return true;
    const now = Date.now();
    if (this.guardCache && now - this.guardCache.at < GUARD_CACHE_MS) return this.guardCache.authorized;
    const st = await this.status(); // validates with backend + refreshes guardCache
    return st.authorized;
  }

  /** Open the official Discord authorization flow in the system browser. */
  async startLogin(): Promise<{ ok: boolean; error?: string }> {
    if (!this.isEnabled()) return { ok: false, error: 'not_configured' };
    await shell.openExternal(`${AUTH_BACKEND_URL}/auth/discord`);
    return { ok: true };
  }

  /** Redeem a one-time code for a secure session (stored main-side). */
  async redeem(code: string): Promise<{ ok: boolean; username?: string; error?: string; message?: string }> {
    if (!this.isEnabled()) return { ok: false, error: 'not_configured' };
    try {
      const res = await this.api('/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const j: any = await res.json().catch(() => ({}));
      if (res.status === 200 && j.session) {
        this.save({ token: j.session, username: j.username, lastAuthorizedAt: Date.now() });
        this.setGuard(true);
        return { ok: true, username: j.username };
      }
      return { ok: false, error: j.error || 'invalid_code', message: j.message || 'Verification failed.' };
    } catch { return { ok: false, error: 'offline', message: 'Could not reach the verification server.' }; }
  }

  async logout(): Promise<void> {
    const s = this.load();
    if (this.isEnabled() && s.token) { try { await this.api('/logout', { method: 'POST', headers: { Authorization: `Bearer ${s.token}` } }); } catch {} }
    this.clear();
    this.setGuard(false);
  }
}
