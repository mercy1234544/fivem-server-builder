// Exclusive-access verification via Discord OAuth (PKCE, no client secret).
//
// Flow: user clicks "Verify with Discord" → system browser opens Discord's
// authorize page → Discord redirects to a temporary localhost callback → we
// exchange the code for a user token → check membership of the configured
// guild (and optionally a role) → access granted/denied. Result is cached in
// userData/data/access.json and re-checked every 10 minutes.
//
// The "admin panel" is Discord itself: with DISCORD_ACCESS_ROLE_ID set, staff
// grant access by assigning that role to a member (right-click → Roles). With
// it empty, ANY member of the server gets access automatically.

import { shell } from 'electron';
import path from 'path';
import fs from 'fs';
import http from 'http';
import crypto from 'crypto';
import axios from 'axios';

// ═══════════════════ OWNER SETUP ═══════════════════
// 1) discord.com/developers/applications → New Application
// 2) OAuth2 → Redirects → add exactly:  http://127.0.0.1:53682/callback
// 3) OAuth2 → toggle "Public Client" ON → copy the Client ID below
// 4) Discord (Settings → Advanced → Developer Mode ON) → right-click your
//    server icon → Copy Server ID → paste below
// 5) OPTIONAL: to gate by role instead of plain membership, create a role
//    (e.g. "Exclusive"), right-click it → Copy Role ID → paste below.
export const DISCORD_CLIENT_ID = 'PASTE_YOUR_CLIENT_ID_HERE';
export const DISCORD_GUILD_ID = 'PASTE_YOUR_SERVER_ID_HERE';
export const DISCORD_ACCESS_ROLE_ID = ''; // empty = every server member has access

const REDIRECT_PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;
const OAUTH_SCOPES = 'identify guilds.members.read';
const RECHECK_MS = 10 * 60 * 1000; // membership re-check interval

export interface AccessStatus {
  configured: boolean;   // owner has pasted the IDs
  loggedIn: boolean;
  inGuild: boolean;
  hasAccess: boolean;
  username?: string;
  discordId?: string;
  reason?: string;       // human-readable explanation when not granted
}

interface StoredAuth {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  user?: { id: string; username: string };
  lastCheck?: number;
  lastResult?: { inGuild: boolean; hasAccess: boolean };
}

const CLOSE_PAGE = `<!doctype html><html><body style="margin:0;background:#0b0e14;color:#dbe2ee;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh"><div style="text-align:center"><div style="font-size:42px">✅</div><h2 style="margin:8px 0 4px">Verified with Discord</h2><p style="color:#8b94a7;margin:0">You can close this tab and return to Mercy Launcher.</p></div></body></html>`;

export class AccessManager {
  private file: string;
  private loginInFlight = false;

  constructor(userDataPath: string) {
    const dataDir = path.join(userDataPath, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    this.file = path.join(dataDir, 'access.json');
  }

  private load(): StoredAuth | null {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf-8')); } catch { return null; }
  }
  private save(a: StoredAuth | null) {
    try {
      if (!a) { if (fs.existsSync(this.file)) fs.unlinkSync(this.file); }
      else fs.writeFileSync(this.file, JSON.stringify(a, null, 2), 'utf-8');
    } catch {}
  }

  isConfigured(): boolean {
    return !DISCORD_CLIENT_ID.startsWith('PASTE') && !DISCORD_GUILD_ID.startsWith('PASTE');
  }

  private notConfigured(): AccessStatus {
    return {
      configured: false, loggedIn: false, inGuild: false, hasAccess: false,
      reason: 'Discord verification is not set up yet — the store owner needs to finish setup.',
    };
  }

  /** Full OAuth login: browser consent → token → membership check. */
  async login(): Promise<AccessStatus> {
    if (!this.isConfigured()) return this.notConfigured();
    if (this.loginInFlight) return { ...(await this.status()), reason: 'A login window is already open — finish it in your browser.' };
    this.loginInFlight = true;
    try {
      const verifier = crypto.randomBytes(32).toString('base64url');
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
      const state = crypto.randomBytes(16).toString('hex');

      const code = await new Promise<string>((resolve, reject) => {
        const server = http.createServer((req, res) => {
          try {
            const u = new URL(req.url || '/', REDIRECT_URI);
            if (u.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(CLOSE_PAGE);
            const c = u.searchParams.get('code');
            const st = u.searchParams.get('state');
            setTimeout(() => { try { server.close(); } catch {} }, 100);
            if (!c || st !== state) reject(new Error(u.searchParams.get('error_description') || 'Login was cancelled'));
            else resolve(c);
          } catch (e: any) { reject(e); }
        });
        server.on('error', () => reject(new Error(`Port ${REDIRECT_PORT} is busy — close other apps and try again`)));
        server.listen(REDIRECT_PORT, '127.0.0.1', () => {
          const url =
            `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}` +
            `&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
            `&scope=${encodeURIComponent(OAUTH_SCOPES)}&state=${state}` +
            `&code_challenge=${challenge}&code_challenge_method=S256`;
          shell.openExternal(url);
        });
        // Give the user 3 minutes to finish in the browser.
        setTimeout(() => { try { server.close(); } catch {}; reject(new Error('Login timed out — try again')); }, 180000);
      });

      // Exchange code → token (PKCE public client: no secret required)
      const body = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      });
      const tok = await axios.post('https://discord.com/api/oauth2/token', body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000,
      });

      const auth: StoredAuth = {
        accessToken: tok.data.access_token,
        refreshToken: tok.data.refresh_token,
        expiresAt: Date.now() + (tok.data.expires_in ?? 604800) * 1000,
      };

      const me = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${auth.accessToken}` }, timeout: 15000,
      });
      auth.user = { id: me.data.id, username: me.data.global_name || me.data.username };
      this.save(auth);

      return this.status(true);
    } catch (e: any) {
      const msg = e?.response?.data?.error_description || e?.message || 'Login failed';
      return { configured: true, loggedIn: false, inGuild: false, hasAccess: false, reason: msg };
    } finally {
      this.loginInFlight = false;
    }
  }

  /** Cached status; re-checks membership with Discord when stale or forced. */
  async status(force = false): Promise<AccessStatus> {
    if (!this.isConfigured()) return this.notConfigured();
    let a = this.load();
    if (!a) return { configured: true, loggedIn: false, inGuild: false, hasAccess: false };

    // Refresh the token if it's about to expire.
    if (Date.now() > a.expiresAt - 60_000) {
      if (!a.refreshToken) { this.save(null); return { configured: true, loggedIn: false, inGuild: false, hasAccess: false, reason: 'Session expired — verify again' }; }
      try {
        const body = new URLSearchParams({
          client_id: DISCORD_CLIENT_ID, grant_type: 'refresh_token', refresh_token: a.refreshToken,
        });
        const tok = await axios.post('https://discord.com/api/oauth2/token', body.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000,
        });
        a = {
          ...a,
          accessToken: tok.data.access_token,
          refreshToken: tok.data.refresh_token ?? a.refreshToken,
          expiresAt: Date.now() + (tok.data.expires_in ?? 604800) * 1000,
        };
        this.save(a);
      } catch {
        this.save(null);
        return { configured: true, loggedIn: false, inGuild: false, hasAccess: false, reason: 'Session expired — verify again' };
      }
    }

    // Serve the cached membership result when fresh.
    if (!force && a.lastCheck && a.lastResult && Date.now() - a.lastCheck < RECHECK_MS) {
      return {
        configured: true, loggedIn: true,
        inGuild: a.lastResult.inGuild, hasAccess: a.lastResult.hasAccess,
        username: a.user?.username, discordId: a.user?.id,
        reason: a.lastResult.hasAccess ? undefined : this.denyReason(a.lastResult.inGuild),
      };
    }

    // Live membership (+ optional role) check.
    try {
      const m = await axios.get(`https://discord.com/api/users/@me/guilds/${DISCORD_GUILD_ID}/member`, {
        headers: { Authorization: `Bearer ${a.accessToken}` }, timeout: 15000,
      });
      const roles: string[] = m.data.roles || [];
      const hasAccess = DISCORD_ACCESS_ROLE_ID ? roles.includes(DISCORD_ACCESS_ROLE_ID) : true;
      a.lastCheck = Date.now(); a.lastResult = { inGuild: true, hasAccess };
      this.save(a);
      return {
        configured: true, loggedIn: true, inGuild: true, hasAccess,
        username: a.user?.username, discordId: a.user?.id,
        reason: hasAccess ? undefined : this.denyReason(true),
      };
    } catch (e: any) {
      const notMember = e?.response?.status === 404;
      if (notMember) {
        a.lastCheck = Date.now(); a.lastResult = { inGuild: false, hasAccess: false };
        this.save(a);
        return {
          configured: true, loggedIn: true, inGuild: false, hasAccess: false,
          username: a.user?.username, discordId: a.user?.id,
          reason: this.denyReason(false),
        };
      }
      // Network/API hiccup: fall back to the last known result rather than lock out.
      return {
        configured: true, loggedIn: true,
        inGuild: a.lastResult?.inGuild ?? false,
        hasAccess: a.lastResult?.hasAccess ?? false,
        username: a.user?.username, discordId: a.user?.id,
        reason: 'Could not reach Discord — using last known status',
      };
    }
  }

  private denyReason(inGuild: boolean): string {
    if (!inGuild) return 'You are not in the Discord server yet — join it, then verify again.';
    return 'You are in the server but staff have not granted you the access role yet — open a ticket to request it.';
  }

  logout() { this.save(null); }
}
