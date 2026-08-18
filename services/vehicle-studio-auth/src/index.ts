import { config, isConfigured, assertConfigured } from './config';
import { SqliteStore } from './db/sqlite';
import { RealDiscordClient } from './discord';
import { AuthService } from './service';
import { createApp } from './app';

function log(msg: string) { console.log(`[vst-auth] ${new Date().toISOString()} ${msg}`); }

async function main() {
  if (process.env.NODE_ENV === 'production') assertConfigured();
  else if (!isConfigured()) log('WARNING: Discord not fully configured — OAuth will not work until .env is filled in. (Copy .env.example → .env)');

  const store = new SqliteStore(config.databaseUrl);
  const service = new AuthService({ store, discord: new RealDiscordClient() });
  const app = createApp({ service, adminToken: config.adminToken, allowedOrigins: config.allowedOrigins });

  // Housekeeping: purge expired codes/sessions/lockouts hourly.
  setInterval(() => { try { service.purge(); } catch (e) { log('purge error'); } }, 3_600_000).unref?.();

  app.listen(config.port, () => {
    log(`listening on :${config.port}  (public: ${config.publicBaseUrl})`);
    log(`health: ${config.publicBaseUrl}/health`);
    if (!config.adminToken) log('WARNING: ADMIN_TOKEN not set — the /admin API is disabled.');
  });
}

main().catch((e) => { console.error('[vst-auth] fatal:', e.message); process.exit(1); });
