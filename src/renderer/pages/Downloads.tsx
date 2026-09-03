import React from 'react';
import { Download, Inbox } from 'lucide-react';

// Real, honest empty state — there is no download engine wired up yet (that's
// planned architecture: a shared queue across FiveM/Minecraft/Assetto/BeamNG
// content, once the content-manifest system exists). Per the "never fake
// functionality" rule, this shows "No downloads yet" rather than invented
// progress bars.
const SECTIONS = [
  { label: 'Active', empty: 'Nothing downloading right now.' },
  { label: 'Queued', empty: 'Nothing queued.' },
  { label: 'Completed', empty: 'Nothing completed yet.' },
  { label: 'Failed', empty: 'No failed downloads.' },
];

export default function Downloads() {
  return (
    <div className="p-7 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary-500/15 border border-primary-500/25 flex items-center justify-center"><Download size={20} className="text-primary-300" /></div>
        <div><h1 className="text-xl font-extrabold text-surface-100">Downloads</h1><p className="text-xs text-surface-500">One download manager, shared across every game hub.</p></div>
      </div>

      <div className="rounded-2xl border border-overlay-6 bg-surface-900/40 p-8 flex flex-col items-center text-center">
        <div className="w-12 h-12 rounded-xl bg-overlay-6 flex items-center justify-center mb-3"><Inbox size={22} className="text-surface-500" /></div>
        <p className="text-sm font-bold text-surface-100">No downloads yet</p>
        <p className="text-xs text-surface-500 mt-1 max-w-sm">Server content packages will download and update here once content publishing is available.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {SECTIONS.map((s) => (
          <div key={s.label} className="rounded-2xl border border-overlay-6 bg-surface-900/40 p-4">
            <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-2">{s.label}</p>
            <p className="text-xs text-surface-600">{s.empty}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
