import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthService, AuthError } from './service';
import { safeEqual } from './crypto';
import { config } from './config';

export interface AppOpts { service: AuthService; adminToken: string; allowedOrigins: string[]; }

const ipOf = (req: Request) => (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '').split(',')[0].trim();
const bearer = (req: Request) => { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7) : ''; };

function sendErr(res: Response, e: unknown) {
  if (e instanceof AuthError) {
    const status = e.kind === 'rate_limited' ? 429 : e.kind === 'invalid_session' ? 401 : e.kind === 'discord_error' ? 503 : 403;
    return res.status(status).json({ ok: false, error: e.kind, message: e.message });
  }
  // Never leak stack traces / internals to clients.
  return res.status(500).json({ ok: false, error: 'server_error', message: 'Something went wrong. Please try again.' });
}

// OAuth "state" store (short-lived, in-memory; single-instance). state → redirect.
const states = new Map<string, { redirect: string | null; ts: number }>();
setInterval(() => { const cut = Date.now() - 5 * 60_000; for (const [k, v] of states) if (v.ts < cut) states.delete(k); }, 60_000).unref?.();

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;background:#0b0e14;color:#dbe2ee;font-family:system-ui,Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#131824;border:1px solid #263042;border-radius:16px;padding:32px;max-width:420px;text-align:center}
.code{font-size:30px;font-weight:800;letter-spacing:4px;color:#8ab4ff;background:#0d1117;border:1px solid #263042;border-radius:12px;padding:14px;margin:16px 0;font-family:ui-monospace,monospace}
.muted{color:#8b94a7;font-size:13px}.err{color:#ff8a8a}h2{margin:0 0 6px}</style></head>
<body><div class="card">${body}</div></body></html>`;
}

export function createApp(opts: AppOpts) {
  const { service, adminToken, allowedOrigins } = opts;
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  // CORS — the Electron main process sends no Origin (allowed). Web origins must
  // be explicitly allow-listed.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (!origin) { /* non-browser (Electron main) — allowed */ }
    else if (allowedOrigins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Admin-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'vehicle-studio-auth', configured: !!config.discord.clientId }));

  // ── OAuth ──────────────────────────────────────────────────────────────────
  app.get('/auth/discord', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const redirect = typeof req.query.redirect === 'string' && /^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(req.query.redirect) ? req.query.redirect : null;
    states.set(state, { redirect, ts: Date.now() });
    res.redirect(service.authorizeUrl(state));
  });

  app.get('/auth/discord/callback', async (req, res) => {
    const { code, state } = req.query as Record<string, string>;
    const st = state && states.get(state);
    if (!code || !st) return res.status(400).send(page('Verification', `<h2 class="err">Verification failed</h2><p class="muted">Invalid or expired request. Please start again from the app.</p>`));
    states.delete(state);
    try {
      const r = await service.completeOAuth(code, ipOf(req));
      const mins = Math.round((r.expiresAt - Date.now()) / 60000);
      // Optional loopback auto-return to the desktop app.
      if (st.redirect) {
        const url = st.redirect + (st.redirect.includes('?') ? '&' : '?') + 'code=' + encodeURIComponent(r.code);
        return res.send(page('Verified', `<h2>✅ Discord verified</h2><p class="muted">Returning to FiveM Server Builder…</p>
          <div class="code">${r.code}</div><p class="muted">If it doesn't return automatically, enter the code above in the app.</p>
          <script>setTimeout(function(){location.href=${JSON.stringify(url)}},800)</script>`));
      }
      return res.send(page('Verified', `<h2>✅ Discord verified</h2><p class="muted">Enter this code in FiveM Server Builder → Vehicle Studio:</p>
        <div class="code">${r.code}</div><p class="muted">Expires in about ${mins} minutes. It can be used once.</p>`));
    } catch (e) {
      const msg = e instanceof AuthError ? e.message : 'Discord verification is temporarily unavailable.';
      return res.status(e instanceof AuthError ? 403 : 503).send(page('Verification', `<h2 class="err">Access not granted</h2><p class="muted">${msg}</p>`));
    }
  });

  // ── verify (redeem code → session) ───────────────────────────────────────────
  app.post('/verify', async (req, res) => {
    try {
      const codeInput = String(req.body?.code || '');
      if (!codeInput) return res.status(400).json({ ok: false, error: 'invalid_code', message: 'Enter a verification code.' });
      const r = await service.redeem(codeInput, ipOf(req));
      res.json({ ok: true, session: r.token, expiresAt: r.expiresAt, username: r.username });
    } catch (e) { sendErr(res, e); }
  });

  // ── session ──────────────────────────────────────────────────────────────────
  app.get('/session', (req, res) => {
    const v = service.validateSession(bearer(req));
    if (!v.authorized) return res.status(401).json({ ok: false, authorized: false, error: v.reason });
    res.json({ ok: true, authorized: true, username: v.username, expiresAt: v.expiresAt });
  });
  app.post('/session/refresh', (req, res) => {
    const r = service.refreshSession(bearer(req));
    if (!r.ok) return res.status(401).json({ ok: false });
    res.json({ ok: true, expiresAt: r.expiresAt });
  });
  app.post('/logout', (req, res) => { service.logout(bearer(req), ipOf(req)); res.json({ ok: true }); });

  // ── admin (server-side protected) ────────────────────────────────────────────
  const admin = (req: Request, res: Response, next: NextFunction) => {
    const t = (req.headers['x-admin-token'] as string) || '';
    if (!adminToken || !safeEqual(t, adminToken)) return res.status(401).json({ ok: false, error: 'unauthorized' });
    next();
  };
  app.get('/admin/stats', admin, (_req, res) => res.json({ ok: true, users: service.listUsers().length, activeSessions: service.listSessions().length, requireRole: service.requireRole, guildId: config.discord.guildId, requiredRoleId: config.discord.requiredRoleId, codeExpiration: service.codeExpirationMs / 1000 }));
  app.get('/admin/users', admin, (_req, res) => res.json({ ok: true, users: service.listUsers() }));
  app.get('/admin/sessions', admin, (_req, res) => res.json({ ok: true, sessions: service.listSessions().map((s) => ({ discord_id: s.discord_id, created_at: s.created_at, expires_at: s.expires_at, last_seen_at: s.last_seen_at })) }));
  app.get('/admin/audit', admin, (_req, res) => res.json({ ok: true, audit: service.listAudit() }));
  app.post('/admin/revoke', admin, (req, res) => { const id = String(req.body?.discordId || ''); if (!id) return res.status(400).json({ ok: false }); res.json({ ok: true, revokedSessions: service.revokeUser(id) }); });
  app.post('/admin/reinstate', admin, (req, res) => { const id = String(req.body?.discordId || ''); if (!id) return res.status(400).json({ ok: false }); service.reinstateUser(id); res.json({ ok: true }); });
  app.post('/admin/config', admin, (req, res) => { const { key, value } = req.body || {}; if (!['require_role', 'code_expiration'].includes(key)) return res.status(400).json({ ok: false, error: 'unknown_key' }); service.setConfig(String(key), String(value)); res.json({ ok: true }); });

  return app;
}
