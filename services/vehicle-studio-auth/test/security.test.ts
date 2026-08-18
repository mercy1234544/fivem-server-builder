import { test } from 'node:test';
import assert from 'node:assert';
import { AddressInfo } from 'net';
import { SqliteStore } from '../src/db/sqlite';
import { AuthService, AuthError } from '../src/service';
import { DiscordClient } from '../src/discord';
import { createApp } from '../src/app';

// Fake Discord — lets tests run with NO real credentials.
class FakeDiscord implements DiscordClient {
  member = true; hasRole = true; identity = { discordId: 'USER_A', username: 'hunter' };
  fail = false;
  authorizeUrl(state: string) { return `https://discord.test/authorize?state=${state}`; }
  async exchangeCode(_code: string) { if (this.fail) throw new Error('discord down'); return this.identity; }
  async checkAccess(_id: string) { if (this.fail) throw new Error('discord down'); return { member: this.member, hasRole: this.hasRole }; }
}

function make() {
  const store = new SqliteStore(':memory:');
  const discord = new FakeDiscord();
  let clock = 1_000_000_000_000;
  const service = new AuthService({ store, discord, now: () => clock });
  return { store, discord, service, advance: (ms: number) => { clock += ms; }, setClock: (v: number) => { clock = v; } };
}

test('happy path: oauth → code → redeem → session authorized', async () => {
  const { service } = make();
  const c = await service.completeOAuth('oauth1', '1.1.1.1');
  assert.match(c.code, /^VST-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  const r = await service.redeem(c.code, '1.1.1.1');
  assert.ok(r.token && r.token.length > 20);
  const v = service.validateSession(r.token);
  assert.equal(v.authorized, true);
  assert.equal(v.discordId, 'USER_A'); // session is bound to the code's owner
});

test('invalid code fails', async () => {
  const { service } = make();
  await assert.rejects(() => service.redeem('VST-ZZZZ-ZZZZ', '1.1.1.1'), (e: AuthError) => e.kind === 'invalid_code');
});

test('expired code fails', async () => {
  const { service, advance } = make();
  const c = await service.completeOAuth('o', '1.1.1.1');
  advance(11 * 60_000); // default 10 min expiry
  await assert.rejects(() => service.redeem(c.code, '1.1.1.1'), (e: AuthError) => e.kind === 'expired_code');
});

test('reused code fails (single-use)', async () => {
  const { service } = make();
  const c = await service.completeOAuth('o', '1.1.1.1');
  await service.redeem(c.code, '1.1.1.1');
  await assert.rejects(() => service.redeem(c.code, '1.1.1.1'), (e: AuthError) => e.kind === 'used_code');
});

test('code always issues a session for its OWN discord account (not transferable)', async () => {
  const { service, discord } = make();
  discord.identity = { discordId: 'OWNER_X', username: 'owner' };
  const c = await service.completeOAuth('o', '1.1.1.1');
  const r = await service.redeem(c.code, '9.9.9.9'); // redeemed from a different IP
  assert.equal(service.validateSession(r.token).discordId, 'OWNER_X'); // still bound to OWNER_X
});

test('non-members cannot get access', async () => {
  const { service, discord } = make();
  discord.member = false;
  await assert.rejects(() => service.completeOAuth('o', '1.1.1.1'), (e: AuthError) => e.kind === 'not_member');
});

test('missing required role cannot get access', async () => {
  const { service, store, discord } = make();
  store.setConfig('require_role', 'true');
  discord.hasRole = false;
  await assert.rejects(() => service.completeOAuth('o', '1.1.1.1'), (e: AuthError) => e.kind === 'missing_role');
});

test('revoked user: session stops working immediately', async () => {
  const { service } = make();
  const c = await service.completeOAuth('o', '1.1.1.1');
  const r = await service.redeem(c.code, '1.1.1.1');
  assert.equal(service.validateSession(r.token).authorized, true);
  service.revokeUser('USER_A');
  assert.equal(service.validateSession(r.token).authorized, false);
});

test('expired session fails', async () => {
  const { service, advance } = make();
  const c = await service.completeOAuth('o', '1.1.1.1');
  const r = await service.redeem(c.code, '1.1.1.1');
  advance(31 * 24 * 60 * 60_000); // default 30-day TTL
  assert.equal(service.validateSession(r.token).authorized, false);
});

test('rate limiting locks out after too many failed attempts', async () => {
  const { service } = make();
  for (let i = 0; i < 5; i++) await assert.rejects(() => service.redeem('VST-BAD0-BAD0', '5.5.5.5'), (e: AuthError) => e.kind === 'invalid_code');
  // 6th attempt is rate-limited, not "invalid"
  await assert.rejects(() => service.redeem('VST-BAD0-BAD0', '5.5.5.5'), (e: AuthError) => e.kind === 'rate_limited');
});

test('client-side manipulation cannot bypass: a forged token is never authorized', () => {
  const { service } = make();
  assert.equal(service.validateSession('totally-made-up-token').authorized, false);
  assert.equal(service.validateSession('').authorized, false);
  assert.equal(service.validateSession('true').authorized, false);
});

test('discord unavailable is surfaced (not access)', async () => {
  const { service, discord } = make();
  discord.fail = true;
  await assert.rejects(() => service.completeOAuth('o', '1.1.1.1'), (e: AuthError) => e.kind === 'discord_error');
});

// ── HTTP-level checks (the client only ever talks to these) ────────────────────
async function startApp() {
  const store = new SqliteStore(':memory:');
  const discord = new FakeDiscord();
  const service = new AuthService({ store, discord });
  const app = createApp({ service, adminToken: 'ADMINSECRET', allowedOrigins: [] });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const port = (server.address() as AddressInfo).port;
  return { base: `http://127.0.0.1:${port}`, service, discord, close: () => server.close() };
}

test('HTTP: /session with a random Bearer is 401 (no client bypass)', async () => {
  const { base, close } = await startApp();
  try {
    const res = await fetch(`${base}/session`, { headers: { Authorization: 'Bearer nope' } });
    assert.equal(res.status, 401);
    const j = await res.json() as any;
    assert.equal(j.authorized, false);
  } finally { close(); }
});

test('HTTP: full verify → session flow', async () => {
  const { base, service, close } = await startApp();
  try {
    const c = await service.completeOAuth('o', '1.1.1.1');
    const vr = await fetch(`${base}/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: c.code }) });
    assert.equal(vr.status, 200);
    const vj = await vr.json() as any;
    assert.ok(vj.session);
    const sr = await fetch(`${base}/session`, { headers: { Authorization: `Bearer ${vj.session}` } });
    assert.equal(sr.status, 200);
    assert.equal((await sr.json() as any).authorized, true);
  } finally { close(); }
});

test('HTTP: admin requires the admin token', async () => {
  const { base, close } = await startApp();
  try {
    assert.equal((await fetch(`${base}/admin/users`)).status, 401);
    assert.equal((await fetch(`${base}/admin/users`, { headers: { 'X-Admin-Token': 'wrong' } })).status, 401);
    assert.equal((await fetch(`${base}/admin/users`, { headers: { 'X-Admin-Token': 'ADMINSECRET' } })).status, 200);
  } finally { close(); }
});
