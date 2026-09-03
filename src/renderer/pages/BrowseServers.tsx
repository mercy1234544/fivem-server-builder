import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, ArrowLeft, Server } from 'lucide-react';

// Honest landing state for the "Browse Servers" primary FiveM entry point.
// Real server discovery isn't built yet — this says so plainly rather than
// showing fabricated server listings, per the no-fake-data rule.
export default function BrowseServers() {
  const navigate = useNavigate();
  return (
    <div className="h-full flex items-center justify-center p-7">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-orange-500/15 border border-orange-500/25 flex items-center justify-center mx-auto mb-5">
          <Compass size={28} className="text-orange-300" />
        </div>
        <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-overlay-6 text-surface-400 border border-overlay-10 mb-3">Coming Soon</span>
        <h1 className="text-2xl font-extrabold text-surface-100">Browse Servers</h1>
        <p className="text-sm text-surface-400 mt-2 leading-relaxed">
          Real-time FiveM server discovery — with player counts, ping, and one-click join — is planned for a follow-up update. It isn't built yet, so there's nothing live to show here.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <button onClick={() => navigate('/servers')} className="btn-primary text-xs py-2 flex items-center gap-1.5"><Server size={13} /> Go to My Servers</button>
          <button onClick={() => navigate('/fivem')} className="btn-secondary text-xs py-2 flex items-center gap-1.5"><ArrowLeft size={13} /> Back to FiveM</button>
        </div>
      </div>
    </div>
  );
}
