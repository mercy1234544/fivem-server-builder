import dotenv from 'dotenv';
dotenv.config();

const num = (v: string | undefined, d: number) => (v && !isNaN(Number(v)) ? Number(v) : d);
const bool = (v: string | undefined, d: boolean) => (v == null ? d : /^(1|true|yes)$/i.test(v));

export const config = {
  port: num(process.env.PORT, 8787),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:8787').replace(/\/$/, ''),
  sessionSecret: process.env.SESSION_SECRET || '',
  adminToken: process.env.ADMIN_TOKEN || '',
  databaseUrl: process.env.DATABASE_URL || './data/vehicle-studio-auth.db',

  discord: {
    clientId: process.env.DISCORD_CLIENT_ID || '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    botToken: process.env.DISCORD_BOT_TOKEN || '',
    guildId: process.env.DISCORD_GUILD_ID || '',
    requiredRoleId: process.env.DISCORD_REQUIRED_ROLE_ID || '',
  },

  codeExpiration: num(process.env.VERIFICATION_CODE_EXPIRATION, 600),
  sessionTtl: num(process.env.SESSION_TTL, 2592000),
  maxFailedAttempts: num(process.env.MAX_FAILED_ATTEMPTS, 5),
  failedAttemptLockout: num(process.env.FAILED_ATTEMPT_LOCKOUT, 900),
  requireRole: bool(process.env.REQUIRE_ROLE, false),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
};

/** True only when the real Discord credentials are present (production-ready). */
export function isConfigured(): boolean {
  const d = config.discord;
  return !!(d.clientId && d.clientSecret && d.botToken && d.guildId && config.sessionSecret);
}

/** Fail fast in production if secrets are missing. */
export function assertConfigured(): void {
  const missing: string[] = [];
  if (!config.discord.clientId) missing.push('DISCORD_CLIENT_ID');
  if (!config.discord.clientSecret) missing.push('DISCORD_CLIENT_SECRET');
  if (!config.discord.botToken) missing.push('DISCORD_BOT_TOKEN');
  if (!config.discord.guildId) missing.push('DISCORD_GUILD_ID');
  if (!config.sessionSecret) missing.push('SESSION_SECRET');
  if (!config.adminToken) missing.push('ADMIN_TOKEN');
  if (missing.length) throw new Error(`Missing required env: ${missing.join(', ')} (copy .env.example → .env)`);
}
