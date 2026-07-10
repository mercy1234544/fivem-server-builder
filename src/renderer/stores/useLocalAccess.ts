// Local, no-database access system (stopgap until Supabase is configured).
//
// - A 4-digit admin code gates the Admin Panel. Entering it marks THIS machine
//   as an admin (persisted), so the Admin tab only shows for admins — regular
//   users never see it.
// - Each Exclusive script has its own redemption code (e.g. "HB4704"). Admins
//   read the current code out of the Admin Panel and give it to a customer; the
//   customer enters it on the locked item and it unlocks on their machine.
//   Codes are computed offline from a baked-in secret so both apps agree with
//   no server, and they rotate on a schedule ("regenerate") — a leaked code
//   stops working for new redemptions, but anyone who already redeemed keeps
//   access. Real one-time per-person codes arrive with the Supabase backend.
import { create } from 'zustand';

const PIN_KEY = 'fsb_admin_pin';
const UNLOCK_KEY = 'fsb_admin_unlocked';
const GRANT_KEY = 'fsb_local_exclusive';

// ── Redemption code generation ────────────────────────────────────────────────
const CODE_SECRET = 'fsb-exclusive-v1';                 // baked-in shared secret
const CODE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;         // codes rotate weekly
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';    // no ambiguous 0/O/1/I

function hash32(str: string): number {
  let h1 = 0xdeadbeef ^ str.length, h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 >>> 0);
}

/** Current (offset 0) or previous (-1) redemption code for a script. */
export function codeForItem(scriptId: string, offset = 0): string {
  const period = Math.floor(Date.now() / CODE_PERIOD_MS) + offset;
  let n = hash32(`${CODE_SECRET}:${scriptId}:${period}`);
  let out = '';
  for (let i = 0; i < 6; i++) { out += ALPHABET[n % ALPHABET.length]; n = Math.floor(n / ALPHABET.length); }
  return out;
}

const readGranted = (): string[] => {
  try { return JSON.parse(localStorage.getItem(GRANT_KEY) || '[]'); } catch { return []; }
};

interface LocalAccessState {
  hasPin: boolean;          // has an admin code been set on this machine?
  unlocked: boolean;        // is this machine a recognized admin? (persisted)
  granted: string[];        // exclusive script_ids unlocked locally

  setPin: (code: string) => void;
  tryPin: (code: string) => boolean;
  changePin: (oldCode: string, newCode: string) => boolean;
  lock: () => void;         // sign out of admin (hides the tab again)

  grant: (scriptId: string) => void;
  revoke: (scriptId: string) => void;
  isGranted: (scriptId: string) => boolean;

  /** Redeem a customer-entered code for a script. Grants + returns true if valid. */
  redeem: (scriptId: string, input: string) => boolean;
}

export const useLocalAccess = create<LocalAccessState>((set, get) => ({
  hasPin: !!localStorage.getItem(PIN_KEY),
  unlocked: localStorage.getItem(UNLOCK_KEY) === '1',
  granted: readGranted(),

  setPin: (code) => {
    localStorage.setItem(PIN_KEY, code);
    localStorage.setItem(UNLOCK_KEY, '1');
    set({ hasPin: true, unlocked: true });
  },

  tryPin: (code) => {
    const ok = localStorage.getItem(PIN_KEY) === code;
    if (ok) { localStorage.setItem(UNLOCK_KEY, '1'); set({ unlocked: true }); }
    return ok;
  },

  changePin: (oldCode, newCode) => {
    if (localStorage.getItem(PIN_KEY) !== oldCode) return false;
    localStorage.setItem(PIN_KEY, newCode);
    return true;
  },

  lock: () => { localStorage.removeItem(UNLOCK_KEY); set({ unlocked: false }); },

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

  redeem: (scriptId, input) => {
    const norm = input.trim().toUpperCase();
    if (!norm) return false;
    if (norm === codeForItem(scriptId, 0) || norm === codeForItem(scriptId, -1)) {
      get().grant(scriptId);
      return true;
    }
    return false;
  },
}));
