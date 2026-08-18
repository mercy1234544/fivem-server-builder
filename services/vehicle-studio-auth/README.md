# Vehicle Studio Auth backend

Server-authorized Discord verification for FiveM Server Builder → Vehicle Studio.

All authorization decisions happen **here, server-side**. The desktop app holds
only a session token and asks this backend whether it's valid. Changing
localStorage / React state / a local JSON file **cannot** unlock Vehicle Studio —
there is no client-trusted `verified = true`.

> **No Discord secrets ever live in the desktop app.** The OAuth client secret,
> bot token, and admin token are only in this backend's `.env`.

---

## 1. Architecture

```
Electron main (holds session token in userData)
        │  HTTPS only
        ▼
 vehicle-studio-auth (this service)
        ├─ Express API            (src/app.ts)
        ├─ AuthService  ← all authz decisions (src/service.ts)
        ├─ Discord OAuth + bot    (src/discord.ts)   ← client secret + bot token
        ├─ Store (SQLite)         (src/db/*)         ← users/codes/sessions/audit
        └─ crypto (codes/tokens)  (src/crypto.ts)
```

Flow: **Verify with Discord** → OAuth2 (server-side, with client secret) →
membership + optional role check (bot token) → one-time code `VST-XXXX-XXXX` →
user pastes code in the app → `POST /verify` → backend issues a **session token**
→ the app stores it (main process) and revalidates it via `GET /session` each
time Vehicle Studio opens. Revoke on the server → locked out on next check.

## 2. Files

```
services/vehicle-studio-auth/
  package.json  tsconfig.json  .env.example  .gitignore  README.md
  src/
    config.ts          env loading + validation
    crypto.ts          code/token generation, hashing (codes & tokens stored hashed)
    discord.ts         DiscordClient interface + real fetch implementation
    service.ts         AuthService — the authorization brain
    app.ts             Express routes + CORS + admin auth + no-stack-trace errors
    index.ts           server entrypoint (+ hourly purge of expired rows)
    db/
      store.ts         Store interface (swap SQLite→Postgres later)
      sqlite.ts        SqliteStore (better-sqlite3) + schema
      migrate.ts       idempotent migration runner
  test/security.test.ts   15 security tests (run with a fake Discord — no creds needed)
```

## 3. Database schema (SQLite; abstract via `Store`)

- `users(discord_id PK, username, first_verified_at, last_verified_at, revoked)`
- `codes(code_hash PK, discord_id, created_at, expires_at, used_at)` — codes stored **hashed**, single-use
- `sessions(token_hash PK, discord_id, created_at, expires_at, revoked, last_seen_at)` — tokens stored **hashed**
- `audit(id, ts, event, discord_id, ip, detail)` — security events (no secrets logged)
- `config(key, value)` — admin-editable overrides (require_role, code_expiration)
- `attempts(ip, count, locked_until)` — per-IP failed-attempt lockout

## 4. API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness + whether configured |
| GET | `/auth/discord` | start OAuth (redirects to Discord) |
| GET | `/auth/discord/callback` | OAuth callback → shows the one-time code |
| POST | `/verify` `{code}` | redeem code → `{session}` (rate-limited) |
| GET | `/session` (Bearer) | validate session → `{authorized}` |
| POST | `/session/refresh` (Bearer) | slide session expiry |
| POST | `/logout` (Bearer) | revoke this session |
| GET | `/admin/stats` (X-Admin-Token) | counts + config |
| GET | `/admin/users` / `/admin/sessions` / `/admin/audit` | listings |
| POST | `/admin/revoke` `{discordId}` | revoke a user + all their sessions |
| POST | `/admin/reinstate` `{discordId}` | undo revocation |
| POST | `/admin/config` `{key,value}` | set `require_role` / `code_expiration` |

## 5. Discord setup (what you create in Discord)

1. **discord.com/developers/applications → New Application.**
2. **OAuth2 → copy Client ID + Client Secret.** Add a redirect:
   `‹PUBLIC_BASE_URL›/auth/discord/callback` (e.g. `https://auth.yoursite.com/auth/discord/callback`).
3. **Bot →** add a bot, copy its **token**, and enable **Server Members Intent**
   (Bot → Privileged Gateway Intents). Invite the bot to your server (any role;
   it only needs to read members).
4. **Your server (guild) ID** (Developer Mode → right-click server → Copy ID).
5. *(Optional)* a role ID to require (Copy ID on the role) + set `REQUIRE_ROLE=true`.

## 6. Run locally

```bash
cd services/vehicle-studio-auth
cp .env.example .env      # fill in the Discord values (or leave blank to test shape)
npm install
npm run dev               # builds + starts on PORT (default 8787)
# health: http://localhost:8787/health
```

Run the tests (no credentials needed — Discord is faked):

```bash
npm test
```

## 7. Production deployment (any Node host / VPS)

```bash
npm ci
npm run build             # → dist/
NODE_ENV=production node dist/index.js
```

- Put it behind HTTPS (a reverse proxy like Caddy/Nginx, or the host's TLS).
- Set every value in `.env` (in production, missing secrets abort startup).
- Set `PUBLIC_BASE_URL` to the public HTTPS URL and add the matching redirect in
  the Discord app.
- `DATABASE_URL` is a file path for SQLite; back it up. To move to Postgres,
  implement `Store` in a new file and construct it in `index.ts` — nothing else
  changes.
- Health check: `GET /health`. Logs go to stdout. Expired codes/sessions are
  purged hourly.

## 8. Security tests & results

`npm test` → **15/15 pass**. Proves: invalid / expired / reused codes fail;
codes are single-use and bound to their own Discord account (non-transferable);
non-members and missing-role users are rejected; revoked users and expired
sessions stop working immediately; rate-limiting locks out after
`MAX_FAILED_ATTEMPTS`; a forged/guessed token is **never** authorized; Discord
outages surface as errors (not access); the admin API requires the admin token.

## 9. Electron integration

- `src/main/services/VehicleStudioAuth.ts` (desktop) talks only to this API.
- Set `VST_AUTH_BACKEND_URL` (env) or the constant in that file to this backend's
  URL. **Empty = verification disabled** (Vehicle Studio stays open) so the app
  never locks users out before the backend exists.
- The session token is stored in the Electron **main** process (`userData`),
  never the renderer.

## 10. What you must provide

1. **Hosting** for this service (a VPS or Node host) + HTTPS.
2. **Discord**: Client ID, Client Secret, Bot token (Server Members Intent on),
   Guild ID, and optionally a Role ID.
3. Fill those into `.env`, deploy, then tell me the backend's public URL and I'll
   set `VST_AUTH_BACKEND_URL` in the desktop build and ship it. That flips the
   gate on for everyone.
