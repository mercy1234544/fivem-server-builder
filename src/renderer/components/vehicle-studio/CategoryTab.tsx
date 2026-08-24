// Unified tuning category editor — Performance, Transmission, Drivetrain,
// Brakes, Traction, Suspension, Damage all render through this one component so
// they share the exact same workflow: presets → preview → apply, manual fields
// with tooltips/why/warnings, current vs original, reset field/category, save/undo.
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Save, Undo2, RotateCcw, Gauge, AlertTriangle } from 'lucide-react';
import { useTuning } from './useTuning';
import { TuningField, PresetCard, PresetPreviewModal, HealthBadge, Section, type PreviewChange } from './primitives';
import { fieldWarning, fieldLabel, type Health, type GroupId, groupHealth } from '../../../main/shared/handlingMeta';

interface Derived { label: string; field: string; unit?: string; toDisplay: (raw: number) => string; fromDisplay: (d: string) => string }
interface Radio { label: string; field: string; hint?: string; options: { label: string; value: string }[] }
export interface CatConfig { title: string; groupId?: GroupId; presetsCategory?: string; fields: string[]; radio?: Radio; derived?: Derived[] }

export const CATEGORIES: Record<string, CatConfig> = {
  performance: {
    title: 'Performance', presetsCategory: 'Performance',
    fields: ['fInitialDriveForce', 'fInitialDriveMaxFlatVel', 'fInitialDragCoeff', 'fDriveInertia', 'nInitialDriveGears'],
    derived: [{ label: 'Top speed', field: 'fInitialDriveMaxFlatVel', unit: 'mph (est.)', toDisplay: (r) => String(Math.round(r * 0.92)), fromDisplay: (d) => ((parseFloat(d) || 0) / 0.92).toFixed(6) }],
  },
  transmission: {
    title: 'Transmission', presetsCategory: 'Transmission', groupId: 'transmission',
    fields: ['nInitialDriveGears', 'fClutchChangeRateScaleUpShift', 'fClutchChangeRateScaleDownShift', 'fDriveInertia', 'fInitialDriveMaxFlatVel', 'fDriveBiasFront'],
  },
  drivetrain: {
    title: 'Drivetrain', fields: ['fDriveBiasFront'],
    radio: { label: 'Drive layout', field: 'fDriveBiasFront', hint: '0 = rear-wheel drive · 1 = front-wheel drive · 0.5 = all-wheel drive.', options: [{ label: 'RWD', value: '0.000000' }, { label: 'AWD', value: '0.500000' }, { label: 'FWD', value: '1.000000' }] },
  },
  brakes: { title: 'Brakes', presetsCategory: 'Brakes', groupId: 'braking', fields: ['fBrakeForce', 'fBrakeBiasFront', 'fHandBrakeForce'] },
  traction: { title: 'Traction', presetsCategory: 'Traction', groupId: 'traction', fields: ['fTractionCurveMax', 'fTractionCurveMin', 'fTractionCurveLateral', 'fTractionSpringDeltaMax', 'fLowSpeedTractionLossMult', 'fTractionLossMult', 'fTractionBiasFront'] },
  suspension: { title: 'Suspension', presetsCategory: 'Suspension', groupId: 'suspension', fields: ['fSuspensionForce', 'fSuspensionCompDamp', 'fSuspensionReboundDamp', 'fSuspensionUpperLimit', 'fSuspensionLowerLimit', 'fSuspensionRaise', 'fSuspensionBiasFront', 'fAntiRollBarForce', 'fAntiRollBarBiasFront'] },
  damage: { title: 'Damage', presetsCategory: 'Damage', groupId: 'damage', fields: ['fCollisionDamageMult', 'fEngineDamageMult', 'fDeformationDamageMult', 'fWeaponDamageMult'] },
};

// Health for a category from the values it actually shows.
function catHealth(fieldNames: string[], num: Record<string, number>, groupId?: GroupId): { health: Health; issues: string[] } {
  if (groupId) { const g = groupHealth(groupId, num); if (g.issues.length || g.health !== 'good') return g; }
  const issues: string[] = []; let worst: Health = 'good';
  for (const n of fieldNames) {
    if (!(n in num)) continue;
    const w = fieldWarning(n, num[n]);
    if (w.level === 'extreme') { issues.push(`${fieldLabel(n)}: extreme value`); worst = 'extreme'; }
    else if (w.level === 'warn' && worst === 'good') { issues.push(`${fieldLabel(n)}: outside typical range`); worst = 'warning'; }
  }
  return { health: worst, issues };
}

export function CategoryTab({ root, handlingId, categoryKey, onChanged, onGoHandling }: {
  root: string; handlingId: string; categoryKey: string; onChanged: () => void; onGoHandling: () => void;
}) {
  const cfg = CATEGORIES[categoryKey];
  const t = useTuning(root, handlingId);
  const [presets, setPresets] = useState<{ id: string; name: string }[]>([]);
  const [modal, setModal] = useState<{ id: string; name: string; changes: PreviewChange[]; warnings?: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cfg.presetsCategory) window.electronAPI.vehicleStudio.categoryPresets(cfg.presetsCategory).then(setPresets);
    else setPresets([]);
  }, [cfg.presetsCategory]);

  const shown = cfg.fields.filter((f) => t.present(f));
  const num = useMemo(() => { const o: Record<string, number> = {}; for (const k of shown) o[k] = parseFloat(t.val(k)); return o; }, [shown, t]);
  const health = catHealth(shown, num, cfg.groupId);

  const openPreset = async (id: string) => {
    const p = await window.electronAPI.vehicleStudio.previewCategoryPreset(root, handlingId, cfg.presetsCategory!, id);
    if (!p.ok) { toast.error(p.error || 'Preview failed'); return; }
    setModal({ id, name: p.name || id, changes: p.changes || [], warnings: [] });
  };
  const applyPreset = async () => {
    if (!modal) return; setBusy(true);
    const r = await window.electronAPI.vehicleStudio.applyCategoryPreset(root, handlingId, cfg.presetsCategory!, modal.id);
    setBusy(false);
    if (r.ok) { toast.success(`Applied ${modal.name} (${r.applied} field${r.applied === 1 ? '' : 's'})`); setModal(null); await t.reload(); onChanged(); }
    else toast.error(r.error || 'Apply failed');
  };
  const save = async () => { const r = await t.save(); if (r.ok) { toast.success(`Saved ${r.applied} field${r.applied === 1 ? '' : 's'}`); onChanged(); } else toast.error(r.error || 'Save failed'); };
  const undo = async () => { const r = await t.undoLastSave(); if (r.ok) { toast.success('Reverted last save'); onChanged(); } else toast.error(r.error || 'Nothing to undo'); };
  const resetCategory = () => { t.resetKeysToOriginal(shown); toast('Category staged to original — Save to apply'); };

  if (t.loading) return <div className="flex items-center gap-2 text-sm text-surface-500"><Loader2 size={14} className="animate-spin" /> Reading handling…</div>;
  if (t.readError) return (
    <div className="card flex flex-col items-center py-14 text-center max-w-xl">
      <AlertTriangle size={28} className="text-amber-400 mb-3" />
      <p className="text-sm font-bold text-surface-100">Handling not available</p>
      <p className="text-xs text-surface-500 mt-1 max-w-sm">This vehicle's handling entry is missing — repair it in the Handling tab, then this editor works.</p>
      <button onClick={onGoHandling} className="btn-primary text-xs py-2 mt-4 flex items-center gap-1.5"><Gauge size={13} /> Go to Handling</button>
    </div>
  );

  const dirty = t.dirtyKeys.length;
  const modifiedCount = shown.filter((f) => t.isModified(f)).length;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm font-bold text-surface-100">{cfg.title}</p>
        <HealthBadge health={health.health} title={health.issues.join(' · ') || 'No issues detected'} />
        <span className="flex-1" />
        {modifiedCount > 0 && <button onClick={resetCategory} className="btn-secondary text-[11px] py-1.5 flex items-center gap-1.5"><RotateCcw size={12} /> Reset category</button>}
        <button onClick={undo} className="btn-secondary text-xs py-1.5 flex items-center gap-1.5"><Undo2 size={13} /> Undo</button>
        <button onClick={save} disabled={t.saving || !dirty} className="btn-primary text-xs py-1.5 flex items-center gap-1.5">{t.saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save{dirty ? ` (${dirty})` : ''}</button>
      </div>

      {health.issues.length > 0 && (
        <div className={`rounded-lg border p-2 text-[11px] ${health.health === 'extreme' ? 'border-red-500/25 bg-red-500/10 text-red-300' : 'border-amber-500/25 bg-amber-500/10 text-amber-300'}`}>
          <span className="font-semibold">Configuration health: </span>{health.issues.join(' · ')}
        </div>
      )}

      {presets.length > 0 && (
        <Section title="Presets">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {presets.map((p) => <PresetCard key={p.id} name={p.name} active={modal?.id === p.id} onClick={() => openPreset(p.id)} />)}
          </div>
          {dirty > 0 && <p className="text-[10px] text-amber-400/80 mt-2">You have {dirty} unsaved edit{dirty === 1 ? '' : 's'} — applying a preset will discard them.</p>}
        </Section>
      )}

      {cfg.radio && t.present(cfg.radio.field) && (
        <Section title={cfg.radio.label}>
          <div className="flex gap-2">
            {cfg.radio.options.map((o) => {
              const active = parseFloat(t.val(cfg.radio!.field) || '0').toFixed(2) === parseFloat(o.value).toFixed(2);
              return <button key={o.label} onClick={() => t.setEdit(cfg.radio!.field, o.value)} className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition-all ${active ? 'bg-primary-500/15 text-primary-200 border-primary-500/30' : 'bg-overlay-3 text-surface-300 border-overlay-6 hover:bg-overlay-6'}`}>{o.label}</button>;
            })}
          </div>
          {cfg.radio.hint && <p className="text-[10px] text-surface-600 mt-2">{cfg.radio.hint}</p>}
        </Section>
      )}

      {cfg.derived && cfg.derived.filter((d) => t.present(d.field)).length > 0 && (
        <Section title="Quick controls">
          <div className="space-y-2">
            {cfg.derived.filter((d) => t.present(d.field)).map((d) => (
              <div key={d.field} className="flex items-center gap-2">
                <label className="text-xs text-surface-300 flex-1">{d.label} <span className="text-surface-600">· {d.unit}</span></label>
                <input value={d.toDisplay(parseFloat(t.val(d.field) || '0'))} onChange={(e) => t.setEdit(d.field, d.fromDisplay(e.target.value))}
                  className="w-24 bg-overlay-3 border border-overlay-6 rounded-lg px-2 py-1 text-xs text-right text-surface-100 focus:outline-none focus:border-primary-500/40" />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Values">
        {shown.length === 0 ? <p className="text-xs text-surface-500">None of these fields exist in this vehicle's handling.</p> : (
          <div className="divide-y divide-overlay-4">
            {shown.map((name) => (
              <TuningField key={name} name={name} value={t.val(name)} original={t.original[name]}
                isDirty={t.isDirty(name)} isModified={t.isModified(name)}
                onChange={(v) => t.setEdit(name, v)} onResetToOriginal={() => t.resetToOriginal(name)} />
            ))}
          </div>
        )}
      </Section>

      {modal && (
        <PresetPreviewModal title={`${modal.name} — preview`} subtitle={`${cfg.title} preset`} changes={modal.changes} warnings={modal.warnings}
          busy={busy} onApply={applyPreset} onCancel={() => setModal(null)} />
      )}
    </div>
  );
}
