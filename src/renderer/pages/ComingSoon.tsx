import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Blocks, FlagTriangleRight, Truck, ArrowLeft } from 'lucide-react';

// Shared "Coming Soon" experience for games whose hub doesn't exist yet.
// Honest by design (requirement: never fake functionality) — this only
// describes what's planned, with no controls that pretend to do anything.
const CONFIG: Record<string, { label: string; icon: any; tint: string; blurb: string; planned: string[] }> = {
  '/minecraft': {
    label: 'Minecraft', icon: Blocks, tint: 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300',
    blurb: 'A full Minecraft hub is planned for Mercy Launcher, covering the same kind of management FiveM already gets.',
    planned: ['Server browser & My Servers', 'Create & manage a Minecraft server', 'Profiles (version + mod loader)', 'Mods & modpacks', 'Worlds', 'Java & Bedrock support'],
  },
  '/assetto-corsa': {
    label: 'Assetto Corsa', icon: FlagTriangleRight, tint: 'bg-rose-500/15 border-rose-500/25 text-rose-300',
    blurb: 'A dedicated Assetto Corsa hub is planned, covering both server management and your local content.',
    planned: ['Server browser & My Servers', 'Create & manage a server', 'Cars & tracks', 'Setups', 'Mods & content', 'Championships'],
  },
  '/beamng': {
    label: 'BeamNG.drive', icon: Truck, tint: 'bg-sky-500/15 border-sky-500/25 text-sky-300',
    blurb: 'BeamNG.drive support is planned as the fourth Mercy Launcher game hub.',
    planned: ['Servers', 'Vehicles & mods', 'Maps & scenarios', 'Profiles', 'Mod updates', 'Management tools'],
  },
};

export default function ComingSoon() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const cfg = CONFIG[pathname] || CONFIG['/minecraft'];

  return (
    <div className="h-full flex items-center justify-center p-7">
      <div className="max-w-lg w-full text-center">
        <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center mx-auto mb-5 ${cfg.tint}`}>
          <cfg.icon size={28} />
        </div>
        <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-overlay-6 text-surface-400 border border-overlay-10 mb-3">Coming Soon</span>
        <h1 className="text-2xl font-extrabold text-surface-100">{cfg.label}</h1>
        <p className="text-sm text-surface-400 mt-2 leading-relaxed">{cfg.blurb}</p>

        <div className="mt-6 rounded-2xl border border-overlay-6 bg-surface-900/40 p-5 text-left">
          <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-2.5">Planned for this hub</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {cfg.planned.map((p) => (
              <div key={p} className="flex items-center gap-2 text-xs text-surface-300">
                <span className="w-1 h-1 rounded-full bg-surface-600 shrink-0" /> {p}
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => navigate('/')} className="btn-secondary text-xs py-2 mt-6 mx-auto flex items-center gap-1.5">
          <ArrowLeft size={13} /> Back to Home
        </button>
      </div>
    </div>
  );
}
