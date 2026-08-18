// Discord integration, behind an interface so the security tests can run with a
// fake (no real credentials needed). The real implementation talks to Discord
// server-side using the client secret + bot token — which never leave the server.
import { config } from './config';

export interface DiscordIdentity { discordId: string; username: string; }
export interface AccessResult { member: boolean; hasRole: boolean; }

export interface DiscordClient {
  /** URL the user is sent to, to authorize the app. */
  authorizeUrl(state: string): string;
  /** Exchange an OAuth code for the authenticated identity. */
  exchangeCode(code: string): Promise<DiscordIdentity>;
  /** Check guild membership (+ role) for a user, via the bot token. */
  checkAccess(discordId: string): Promise<AccessResult>;
}

const API = 'https://discord.com/api';

export class RealDiscordClient implements DiscordClient {
  private redirectUri = `${config.publicBaseUrl}/auth/discord/callback`;

  authorizeUrl(state: string): string {
    const p = new URLSearchParams({
      client_id: config.discord.clientId,
      response_type: 'code',
      scope: 'identify',
      redirect_uri: this.redirectUri,
      state,
      prompt: 'consent',
    });
    return `${API}/oauth2/authorize?${p.toString()}`;
  }

  async exchangeCode(code: string): Promise<DiscordIdentity> {
    const body = new URLSearchParams({
      client_id: config.discord.clientId,
      client_secret: config.discord.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    });
    const tokRes = await fetch(`${API}/oauth2/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    if (!tokRes.ok) throw new Error(`token exchange failed (${tokRes.status})`);
    const tok = await tokRes.json() as any;
    const meRes = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${tok.access_token}` } });
    if (!meRes.ok) throw new Error(`identity fetch failed (${meRes.status})`);
    const me = await meRes.json() as any;
    return { discordId: me.id, username: me.global_name || me.username };
  }

  async checkAccess(discordId: string): Promise<AccessResult> {
    // Bot-token guild member lookup — authoritative, server-side.
    const res = await fetch(`${API}/guilds/${config.discord.guildId}/members/${discordId}`, {
      headers: { Authorization: `Bot ${config.discord.botToken}` },
    });
    if (res.status === 404) return { member: false, hasRole: false };
    if (!res.ok) throw new Error(`guild member lookup failed (${res.status})`);
    const m = await res.json() as any;
    const roles: string[] = m.roles || [];
    const hasRole = config.discord.requiredRoleId ? roles.includes(config.discord.requiredRoleId) : true;
    return { member: true, hasRole };
  }
}
