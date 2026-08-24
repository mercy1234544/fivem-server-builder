// Smart Tune — pick a goal, a driving style, and per-axis priorities; the engine
// proposes changes reasoned from THIS vehicle's real values (mass, drivetrain,
// existing power/grip/etc.). Nothing is applied silently — the proposed changes
// are always previewed first. Estimates are labelled as estimates, never physics.
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Sparkles, CheckCircle2, Info, RotateCcw } from 'lucide-react';
import { BeforeAfterRow } from './primitives';
import {
  TUNE_GOALS, DRIVE_STYLES, type TuneGoal, type DriveStyle, type TunePriorities,
} from '../../../main/shared/handlingMeta';

const AXES: { key: keyof TunePriorities; label: string }[] = [
  { key: 'topSpeed', label: 'Top Speed' }, { key: 'acceleration', label: 'Acceleration' },
  { key: 'braking', label: 'Braking' }, { key: 'cornering', label: 'Cornering' },
  { key: 'stability', label: 'Stability' }, { key: 'grip', label: 'Grip' },
];
const PRIORITY_LABEL = (v: number) => (v <= 0.34 ? 'Off' : v < 0.85 ? 'Low' : v <= 1.15 ? 'Normal' : v < 1.7 ? 'High' : 'Max');

export function SmartTuneTab({ root, handlingId, type, onChanged }: {
  root: string; handlingId: string; type: string; onChanged: () => void;
}) {
  const [goal, setGoal] = useState<TuneGoal>('balanced');
  const [style, setStyle] = useState<DriveStyle>('aggressive');
  const [priorities, setPriorities] = useState<TunePriorities>({ topSpeed: 1, acceleration: 1, braking: 1, cornering: 1, stability: 1, grip: 1 });
  const [preview, setPreview] = useState<{ changes: { name: string; from: string; to: string }[]; warnings?: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const req = { goal, style, priorities };
    window.electronAPI.vehicleStudio.smartTunePreview(root, handlingId, req).then((p) => {
      if (cancelled) return;
      setLoading(false);
      setPreview(p.ok ? { changes: p.changes || [], warnings: p.warnings } : null);
      if (!p.ok) toast.error(p.error || 'Preview failed');
    });
    return () => { cancelled = true; };
  }, [root, handlingId, goal, style, JSON.stringify(priorities)]);

  const apply = async () => {
    setBusy(true);
    const r = await window.electronAPI.vehicleStudio.smartTuneApply(root, handlingId, { goal, style, priorities });
    setBusy(false);
    if (r.ok) { toast.success(`Smart Tune applied (${r.applied} field${r.applied === 1 ? '' : 's'})`); onChanged(); }
    else toast.error(r.error || 'Apply failed');
  };
  const undo = async () => { const r = await window.electronAPI.vehicleStudio.undoHandling(root, handlingId); if (r.ok) { toast.success('Reverted last change'); onChanged(); } else toast.error(r.error || 'Nothing to undo'); };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-xl border border-primary-500/20 bg-primary-500/5 p-3 flex items-start gap-2">
        <Info size={14} className="text-primary-300 mt-0.5 shrink-0" />
        <p className="text-[11px] text-surface-300">Smart Tune reasons from <span className="font-semibold text-surface-100">{type}</span>'s real handling values (mass, drivetrain, existing power &amp; grip) and proposes changes for your goal. The characteristics it targets are <span className="text-surface-100">estimates</span>, not physics measurements. Nothing changes until you apply.</p>
      </div>

      <div className="card">
        <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-2">Goal</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {TUNE_GOALS.map((g) => (
            <button key={g.id} onClick={() => setGoal(g.id)}
              className={`text-left rounded-lg border p-2 transition-all ${goal === g.id ? 'border-primary-500/50 bg-primary-500/10' : 'border-overlay-6 bg-overlay-2 hover:border-primary-500/30'}`}>
              <span className="text-xs font-bold text-surface-100">{g.name}</span>
              <p className="text-[10px] text-surface-500 leading-snug">{g.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-2">Driving style</p>
          <div className="flex flex-wrap gap-1.5">
            {DRIVE_STYLES.map((s) => (
              <button key={s.id} onClick={() => setStyle(s.id)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${style === s.id ? 'bg-primary-500/15 text-primary-200 border-primary-500/30' : 'bg-overlay-3 text-surface-300 border-overlay-6 hover:bg-overlay-6'}`}>{s.name}</button>
            ))}
          </div>
          <p className="text-[10px] text-surface-600 mt-2">Style scales how aggressively values change (Casual = gentle, Arcade = strongest).</p>
        </div>

        <div className="card">
          <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-2">Priorities</p>
          <div className="space-y-1.5">
            {AXES.map((a) => (
              <div key={a.key} className="flex items-center gap-2">
                <label className="text-[11px] text-surface-300 w-24 shrink-0">{a.label}</label>
                <input type="range" min={0} max={2} step={0.25} value={priorities[a.key]}
                  onChange={(e) => setPriorities((p) => ({ ...p, [a.key]: parseFloat(e.target.value) }))}
                  className="flex-1 accent-primary-500" />
                <span className="text-[10px] text-surface-400 w-12 text-right">{PRIORITY_LABEL(priorities[a.key])}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-surface-100 flex items-center gap-1.5"><Sparkles size={14} className="text-primary-300" /> Proposed changes</p>
          <div className="flex items-center gap-2">
            <button onClick={undo} className="btn-secondary text-[11px] py-1.5 flex items-center gap-1.5"><RotateCcw size={12} /> Undo last</button>
            <button onClick={apply} disabled={busy || loading || !preview || preview.changes.length === 0} className="btn-primary text-xs py-1.5 flex items-center gap-1.5">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Apply Smart Tune
            </button>
          </div>
        </div>
        {loading ? <div className="flex items-center gap-2 text-sm text-surface-500 py-4"><Loader2 size={14} className="animate-spin" /> Computing…</div>
          : !preview ? <p className="text-xs text-surface-500 py-4">No handling available to tune.</p>
          : preview.changes.length === 0 ? <p className="text-xs text-surface-500 py-4">This vehicle already matches this configuration — no changes.</p>
          : (
            <>
              {preview.warnings && preview.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-2 mb-2 space-y-1">
                  {preview.warnings.map((w, i) => <p key={i} className="text-[11px] text-amber-300">{w}</p>)}
                </div>
              )}
              <p className="text-[11px] text-surface-500 mb-1">{preview.changes.length} field{preview.changes.length === 1 ? '' : 's'} will change:</p>
              <div className="rounded-lg border border-overlay-4 bg-overlay-2 divide-y divide-overlay-4 max-h-72 overflow-y-auto">
                {preview.changes.map((c) => <BeforeAfterRow key={c.name} name={c.name} from={c.from} to={c.to} />)}
              </div>
            </>
          )}
      </div>
    </div>
  );
}
