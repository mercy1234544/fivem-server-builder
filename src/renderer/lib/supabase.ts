// Supabase client for the accounts + script-access system.
//
// OWNER SETUP: paste your project's values below (Supabase → Project Settings →
// API). The anon key is meant to be public — security is enforced by the Row
// Level Security policies in supabase/schema.sql, not by hiding this key.
// Until these are filled in, isSupabaseConfigured() is false and the whole
// account/login UI stays hidden, so the app behaves exactly as before.
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'PASTE_YOUR_SUPABASE_URL_HERE';
export const SUPABASE_ANON_KEY = 'PASTE_YOUR_SUPABASE_ANON_KEY_HERE';

export function isSupabaseConfigured(): boolean {
  return !SUPABASE_URL.startsWith('PASTE') && !SUPABASE_ANON_KEY.startsWith('PASTE');
}

// A single shared client (or null when not configured yet).
export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

// Accounts are username-first. Supabase Auth keys on email, so we map each
// username to a stable internal address; the optional real email is kept in the
// profile for recovery/contact. Usernames are lowercased + stripped to keep the
// mapping deterministic (so login by username needs no pre-auth lookup).
export const AUTH_EMAIL_DOMAIN = 'users.fivembuilder.app';
export function usernameToAuthEmail(username: string): string {
  const slug = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return `${slug}@${AUTH_EMAIL_DOMAIN}`;
}

// ── Shared types ────────────────────────────────────────────────────────────
export type Role = 'user' | 'admin' | 'owner';

export interface Profile {
  id: string;
  username: string;
  email: string | null;
  role: Role;
  created_at: string;
}

export interface Entitlement {
  id: string;
  user_id: string;
  script_id: string;
  granted_by: string | null;
  granted_at: string;
}
