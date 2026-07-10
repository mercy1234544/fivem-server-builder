// Account/auth state for the store's Exclusive access + Admin Panel.
// Talks to Supabase (see src/renderer/lib/supabase.ts). All methods no-op
// safely when Supabase isn't configured yet.
import { create } from 'zustand';
import { supabase, usernameToAuthEmail, Profile, Role, isSupabaseConfigured } from '../lib/supabase';

interface AuthState {
  initialized: boolean;
  loading: boolean;
  profile: Profile | null;          // logged-in account (null = signed out)
  entitlements: string[];           // script_ids this account can download

  init: () => Promise<void>;
  signUp: (username: string, password: string, email?: string) => Promise<{ error?: string }>;
  signIn: (username: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;

  // Admin/owner actions (RLS enforces who may actually do these).
  searchUsers: (query: string) => Promise<Profile[]>;
  getUserEntitlements: (userId: string) => Promise<string[]>;
  grant: (userId: string, scriptId: string) => Promise<{ error?: string }>;
  revoke: (userId: string, scriptId: string) => Promise<{ error?: string }>;
  setRole: (userId: string, role: Role) => Promise<{ error?: string }>;
}

const friendly = (msg?: string): string => {
  const m = (msg || '').toLowerCase();
  if (m.includes('already registered') || m.includes('already exists')) return 'That username is already taken.';
  if (m.includes('invalid login')) return 'Wrong username or password.';
  if (m.includes('password')) return 'Password must be at least 6 characters.';
  if (m.includes('row-level security') || m.includes('violates')) return 'You do not have permission to do that.';
  return msg || 'Something went wrong. Try again.';
};

async function loadProfileAndEntitlements(): Promise<{ profile: Profile | null; entitlements: string[] }> {
  if (!supabase) return { profile: null, entitlements: [] };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { profile: null, entitlements: [] };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, email, role, created_at')
    .eq('id', user.id)
    .single();

  const { data: ents } = await supabase
    .from('entitlements')
    .select('script_id')
    .eq('user_id', user.id);

  return {
    profile: (profile as Profile) ?? null,
    entitlements: (ents ?? []).map((e: any) => e.script_id),
  };
}

export const useAuth = create<AuthState>((set, get) => ({
  initialized: false,
  loading: false,
  profile: null,
  entitlements: [],

  init: async () => {
    if (!isSupabaseConfigured() || !supabase) { set({ initialized: true }); return; }
    const { profile, entitlements } = await loadProfileAndEntitlements();
    set({ profile, entitlements, initialized: true });
    // React to token refresh / sign-in / sign-out from other tabs or flows.
    supabase.auth.onAuthStateChange(async () => {
      const next = await loadProfileAndEntitlements();
      set({ profile: next.profile, entitlements: next.entitlements });
    });
  },

  signUp: async (username, password, email) => {
    if (!supabase) return { error: 'Accounts are not set up yet.' };
    set({ loading: true });
    try {
      const { error } = await supabase.auth.signUp({
        email: usernameToAuthEmail(username),
        password,
        options: { data: { username: username.trim(), email: email?.trim() || null } },
      });
      if (error) return { error: friendly(error.message) };
      const next = await loadProfileAndEntitlements();
      set({ profile: next.profile, entitlements: next.entitlements });
      return {};
    } finally { set({ loading: false }); }
  },

  signIn: async (username, password) => {
    if (!supabase) return { error: 'Accounts are not set up yet.' };
    set({ loading: true });
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: usernameToAuthEmail(username),
        password,
      });
      if (error) return { error: friendly(error.message) };
      const next = await loadProfileAndEntitlements();
      set({ profile: next.profile, entitlements: next.entitlements });
      return {};
    } finally { set({ loading: false }); }
  },

  signOut: async () => {
    await supabase?.auth.signOut();
    set({ profile: null, entitlements: [] });
  },

  refresh: async () => {
    const next = await loadProfileAndEntitlements();
    set({ profile: next.profile, entitlements: next.entitlements });
  },

  searchUsers: async (query) => {
    if (!supabase) return [];
    const q = query.trim();
    let req = supabase.from('profiles').select('id, username, email, role, created_at').order('created_at', { ascending: false }).limit(30);
    if (q) req = supabase.from('profiles').select('id, username, email, role, created_at').ilike('username', `%${q}%`).limit(30);
    const { data } = await req;
    return (data as Profile[]) ?? [];
  },

  getUserEntitlements: async (userId) => {
    if (!supabase) return [];
    const { data } = await supabase.from('entitlements').select('script_id').eq('user_id', userId);
    return (data ?? []).map((e: any) => e.script_id);
  },

  grant: async (userId, scriptId) => {
    if (!supabase) return { error: 'Not set up.' };
    const me = get().profile?.id ?? null;
    const { error } = await supabase.from('entitlements')
      .upsert({ user_id: userId, script_id: scriptId, granted_by: me }, { onConflict: 'user_id,script_id', ignoreDuplicates: true });
    if (error) return { error: friendly(error.message) };
    return {};
  },

  revoke: async (userId, scriptId) => {
    if (!supabase) return { error: 'Not set up.' };
    const { error } = await supabase.from('entitlements').delete().eq('user_id', userId).eq('script_id', scriptId);
    if (error) return { error: friendly(error.message) };
    return {};
  },

  setRole: async (userId, role) => {
    if (!supabase) return { error: 'Not set up.' };
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
    if (error) return { error: friendly(error.message) };
    return {};
  },
}));
