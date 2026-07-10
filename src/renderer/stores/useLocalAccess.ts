// Local, no-database admin access. Gates the Admin Panel behind a 4-digit code
// (set on first use, stored on this machine) and tracks which Exclusive scripts
// are unlocked locally. This is a stopgap until the Supabase account system is
// configured — at that point isSupabaseConfigured() is true and the real
// per-account entitlements take over instead of this.
import { create } from 'zustand';

const PIN_KEY = 'fsb_admin_pin';
const GRANT_KEY = 'fsb_local_exclusive';

const readGranted = (): string[] => {
  try { return JSON.parse(localStorage.getItem(GRANT_KEY) || '[]'); } catch { return []; }
};

interface LocalAccessState {
  hasPin: boolean;          // has a code been set on this machine?
  unlocked: boolean;        // entered the code this session
  granted: string[];        // exclusive script_ids unlocked locally

  setPin: (code: string) => void;
  tryPin: (code: string) => boolean;
  changePin: (oldCode: string, newCode: string) => boolean;
  lock: () => void;

  grant: (scriptId: string) => void;
  revoke: (scriptId: string) => void;
  isGranted: (scriptId: string) => boolean;
}

export const useLocalAccess = create<LocalAccessState>((set, get) => ({
  hasPin: !!localStorage.getItem(PIN_KEY),
  unlocked: false,
  granted: readGranted(),

  setPin: (code) => {
    localStorage.setItem(PIN_KEY, code);
    set({ hasPin: true, unlocked: true });
  },

  tryPin: (code) => {
    const ok = localStorage.getItem(PIN_KEY) === code;
    if (ok) set({ unlocked: true });
    return ok;
  },

  changePin: (oldCode, newCode) => {
    if (localStorage.getItem(PIN_KEY) !== oldCode) return false;
    localStorage.setItem(PIN_KEY, newCode);
    return true;
  },

  lock: () => set({ unlocked: false }),

  grant: (scriptId) => {
    const next = Array.from(new Set([...get().granted, scriptId]));
    localStorage.setItem(GRANT_KEY, JSON.stringify(next));
    set({ granted: next });
  },

  revoke: (scriptId) => {
    const next = get().granted.filter((s) => s !== scriptId);
    localStorage.setItem(GRANT_KEY, JSON.stringify(next));
    set({ granted: next });
  },

  isGranted: (scriptId) => get().granted.includes(scriptId),
}));
