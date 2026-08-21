// App-wide access gate. Wraps all routed pages (mounted inside Layout, so the
// TitleBar + window controls stay usable while unauthenticated). Authorization
// is decided by the backend; this only reflects it and drives the login UI.
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Loader2, Shield, CheckCircle2, RefreshCw, Hexagon } from 'lucide-react';
import { useAppAuth } from '../stores/useAppAuth';

const FEATURES = ['Server management & console', 'Resource store & installs', 'Vehicle Studio', 'Backups, tools & diagnostics'];

// The backend returns a bare { error: <code> } on /verify with no human text, so
// the client owns the wording. Codes observed from the live backend: expired,
// invalid, invalid_request; plus the client's own offline/not_configured.
const REDEEM_ERRORS: Record<string, string> = {
  expired: 'This code has expired — generate a new one.',
  invalid: 'That code is invalid or has already been used.',
  invalid_code: 'That code is invalid or has already been used.',
  invalid_request: 'That code is invalid or has already been used.',
  used: 'That code is invalid or has already been used.',
  already_used: 'That code is invalid or has already been used.',
  not_found: 'That code is invalid or has already been used.',
  too_many_attempts: 'Too many attempts — please wait a minute and try again.',
  rate_limited: 'Too many attempts — please wait a minute and try again.',
  offline: "Couldn't reach the verification server — check your connection and try again.",
  server_error: 'The verification server hit a problem — please try again in a moment.',
  not_configured: 'Verification is not configured.',
};

export default function AppAccessGate({ children }: { children: React.ReactNode }) {
  const { status, loading, startLogin, redeem, refresh } = useAppAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Checking access — never flash protected content before we know.
  if (loading || !status) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-2 text-surface-500 text-sm"><Loader2 size={18} className="animate-spin" /> Checking access…</div>
      </div>
    );
  }

  // Verification disabled (dev override) or authorized → the app.
  if (!status.enabled || status.authorized) return <>{children}</>;

  const doRedeem = async () => {
    if (!code.trim()) return;
    setBusy(true); setErr(null);
    const r = await redeem(code.trim());
    setBusy(false);
    if (r.ok) { toast.success(`Verified${r.username ? ` as ${r.username}` : ''} — welcome!`); setCode(''); }
    else setErr(REDEEM_ERRORS[r.error || ''] || r.message || 'Verification failed.');
  };

  const reasonBanner = status.reason === 'revoked' ? 'Your access has been revoked.'
    : status.reason === 'offline' ? "Couldn't reach the verification server — check your connection and try again."
    : (status.reason === 'expired' || status.reason === 'expired_session') ? 'Your session has expired — verify with Discord again.'
    : (status.reason === 'invalid' || status.reason === 'invalid_session') ? 'Your session is no longer valid — verify with Discord again.'
    : null;

  return (
    <div className="h-full overflow-y-auto p-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card max-w-md mx-auto mt-8 p-7 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center mx-auto mb-4 shadow-glow-sm">
          <Hexagon size={26} className="text-white" strokeWidth={2.5} />
        </div>
        <h1 className="text-xl font-extrabold text-surface-100">FiveM Server Builder</h1>
        <p className="text-sm text-surface-400 mt-1">This application requires Discord verification.</p>

        <div className="text-left text-xs text-surface-300 my-5 space-y-1.5">
          {FEATURES.map((f) => (
            <div key={f} className="flex items-center gap-2"><CheckCircle2 size={13} className="text-emerald-400 shrink-0" /> {f}</div>
          ))}
        </div>

        {reasonBanner && <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-300 text-xs px-3 py-2 mb-3">{reasonBanner}</div>}

        <button onClick={startLogin} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold bg-[#5865F2] text-white hover:bg-[#6875f5] transition-all">
          <Shield size={15} /> Verify with Discord
        </button>

        <p className="text-[11px] text-surface-500 mt-4 mb-1">Already have a code?</p>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr(null); }}
            onKeyDown={(e) => e.key === 'Enter' && doRedeem()}
            placeholder="PGMQND54Y2" spellCheck={false}
            className="flex-1 bg-[#0d1117] border border-overlay-6 rounded-lg px-3 py-2 text-sm font-mono tracking-widest text-surface-100 placeholder-surface-600 focus:outline-none focus:border-primary-500/40"
          />
          <button onClick={doRedeem} disabled={busy || !code.trim()} className="btn-primary text-xs px-4">{busy ? <Loader2 size={13} className="animate-spin" /> : 'Unlock'}</button>
        </div>
        {err && <p className="text-xs text-red-400 mt-2">{err}</p>}

        <button onClick={refresh} className="text-[11px] text-surface-500 hover:text-surface-300 mt-4 flex items-center gap-1.5 mx-auto"><RefreshCw size={11} /> Check again</button>
      </motion.div>
    </div>
  );
}
