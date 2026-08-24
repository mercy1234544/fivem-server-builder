// Upgraded raw Handling editor — keeps full raw-value control but adds search,
// logical grouping, descriptions/why, safe-range + extreme warnings, current vs
// original, reset field/group, copy/paste, undo/redo, and full-handling presets
// with preview. Handling is NOT dumbed down: every parsed field is editable.
import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Save, Undo2, Redo2, RotateCcw, Search, Sparkles } from 'lucide-react';
import { useTuning } from './useTuning';
import { TuningField, PresetCard, PresetPreviewModal, HealthBadge, WhyTip, WarnBadge, type PreviewChange } from './primitives';
import { HANDLING_GROUPS, HANDLING_PRESETS, fieldLabel, groupHealth, type GroupId } from '../../../main/shared/handlingMeta';
import { HandlingRepair } from './repair';

export function HandlingTab({ root, handlingId, modelName, onChanged, onGoDiagnostics }: {
  root: string; handlingId: string; modelName: string; onChanged: () => void; onGoDiagnostics: () => void;
}) {
  const t = useTuning(root, handlingId);
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [modal, setModal] = useState<{ id: string; name: string; changes: PreviewChange[]; warnings?: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const openPreset = async (id: string) => {
    const p = await window.electronAPI.vehicleStudio.previewHandlingPreset(root, handlingId, id);
    if (!p.ok) { toast.error(p.error || 'Preview failed'); return; }
    setModal({ id, name: p.name || id, changes: p.changes || [], warnings: p.warnings });
  };
  const applyPreset = async () => {
    if (!modal) return; setBusy(true);
    const r = await window.electronAPI.vehicleStudio.applyHandlingPreset(root, handlingId, modal.id);
    setBusy(false);
    if (r.ok) { toast.success(`Applied ${modal.name}${typeof r.applied === 'number' ? ` (${r.applied} fields)` : ''}`); setModal(null); await t.reload(); onChanged(); }
    else toast.error(r.error || 'Apply failed');
  };
  const save = async () => { const r = await t.save(); if (r.ok) { toast.success(`Saved ${r.applied} field${r.applied === 1 ? '' : 's'}`); onChanged(); } else toast.error(r.error || 'Save failed'); };
  const undoSave = async () => { const r = await t.undoLastSave(); if (r.ok) { toast.success('Reverted last save'); onChanged(); } else toast.error(r.error || 'Nothing to undo'); };

  if (t.loading) return <div className="flex items-center gap-2 text-sm text-surface-500"><Loader2 size={14} className="animate-spin" /> Reading handling.meta…</div>;
  if (t.readError) return <HandlingRepair root={root} handlingId={handlingId} modelName={modelName} onFixed={() => { t.reload(); onChanged(); }} onGoDiagnostics={onGoDiagnostics} />;

  const match = (n: string) => !search || n.toLowerCase().includes(search.toLowerCase()) || fieldLabel(n).toLowerCase().includes(search.toLowerCase());
  const known = new Set(HANDLING_GROUPS.flatMap((g) => g.fields));
  const scalarFields = t.fields.filter((f) => f.kind !== 'vector');
  const vectorFields = t.fields.filter((f) => f.kind === 'vector');
  const otherScalars = scalarFields.filter((f) => !known.has(f.name)).map((f) => f.name);
  const otherVectors = vectorFields.filter((v) => !known.has(v.name));
  const dirty = t.dirtyKeys.length;
  const allModified = t.fields.flatMap((f) => f.kind === 'vector' ? [`${f.name}.x`, `${f.name}.y`, `${f.name}.z`] : [f.name]).filter((k) => t.isModified(k));

  const groups: { id: GroupId | 'other'; title: string; scalars: string[]; vectors: typeof vectorFields }[] = [
    ...HANDLING_GROUPS.map((g) => ({ id: g.id, title: g.title, scalars: g.fields.filter((n) => t.present(n) && scalarFields.some((f) => f.name === n)), vectors: vectorFields.filter((v) => g.fields.includes(v.name)) })),
    { id: 'other' as const, title: 'Other (from file)', scalars: otherScalars, vectors: otherVectors },
  ];

  const groupNum = (names: string[]) => { const o: Record<string, number> = {}; for (const n of names) o[n] = parseFloat(t.val(n)); return o; };
  const resetGroup = (names: string[]) => { t.resetKeysToOriginal(names.flatMap((n) => { const f = t.fields.find((x) => x.name === n); return f?.kind === 'vector' ? [`${n}.x`, `${n}.y`, `${n}.z`] : [n]; })); toast('Group staged to original — Save to apply'); };

  return (
    <div className="max-w-3xl space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 sticky top-0 bg-surface-950/85 backdrop-blur -mx-1 px-1 py-1.5 z-10">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search fields… (speed, brake, traction)"
            className="w-full bg-overlay-3 border border-overlay-6 rounded-xl pl-9 pr-3 py-2 text-sm text-surface-200 placeholder-surface-600 focus:outline-none focus:border-primary-500/40" />
        </div>
        <button onClick={t.undoEdit} disabled={!t.canUndo} title="Undo edit" className={`btn-secondary text-xs py-2 px-2.5 ${!t.canUndo ? 'opacity-40' : ''}`}><Undo2 size={13} /></button>
        <button onClick={t.redoEdit} disabled={!t.canRedo} title="Redo edit" className={`btn-secondary text-xs py-2 px-2.5 ${!t.canRedo ? 'opacity-40' : ''}`}><Redo2 size={13} /></button>
        <button onClick={undoSave} className="btn-secondary text-xs py-2 flex items-center gap-1.5" title="Restore the last saved backup"><RotateCcw size={13} /> Undo save</button>
        <button onClick={save} disabled={t.saving || !dirty} className="btn-primary text-xs py-2 flex items-center gap-1.5">{t.saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save{dirty ? ` (${dirty})` : ''}</button>
      </div>

      {/* Handling presets */}
      <div className="card">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={13} className="text-primary-300" />
          <p className="text-[10px] uppercase tracking-wider text-surface-500 flex-1">Handling presets</p>
          {allModified.length > 0 && <button onClick={() => resetGroup(t.fields.map((f) => f.name))} className="text-[10px] text-surface-500 hover:text-surface-200 flex items-center gap-1"><RotateCcw size={10} /> Reset all to original</button>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-1.5">
          {HANDLING_PRESETS.map((p) => <PresetCard key={p.id} name={p.name} active={modal?.id === p.id} onClick={() => openPreset(p.id)} />)}
        </div>
        {dirty > 0 && <p className="text-[10px] text-amber-400/80 mt-2">Applying a preset writes to the file and will discard your {dirty} unsaved edit{dirty === 1 ? '' : 's'}.</p>}
      </div>

      {/* Grouped fields */}
      {groups.map((g) => {
        const scalars = g.scalars.filter(match);
        const vectors = g.vectors.filter((v) => match(v.name));
        if (scalars.length === 0 && vectors.length === 0) return null;
        const health = g.id !== 'other' ? groupHealth(g.id, groupNum(g.scalars)) : { health: 'good' as const, issues: [] };
        const groupModified = [...g.scalars, ...g.vectors.map((v) => v.name)].some((n) => { const f = t.fields.find((x) => x.name === n); return f?.kind === 'vector' ? ['x', 'y', 'z'].some((a) => t.isModified(`${n}.${a}`)) : t.isModified(n); });
        const isCollapsed = collapsed[g.title];
        return (
          <div key={g.title} className="card">
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => setCollapsed((c) => ({ ...c, [g.title]: !c[g.title] }))} className="text-[10px] uppercase tracking-wider text-surface-500 hover:text-surface-300">{isCollapsed ? '▸' : '▾'} {g.title}</button>
              {g.id !== 'other' && <HealthBadge health={health.health} title={health.issues.join(' · ') || 'No issues detected'} />}
              <span className="flex-1" />
              {groupModified && <button onClick={() => resetGroup([...g.scalars, ...g.vectors.map((v) => v.name)])} title="Reset this group to original" className="text-[10px] text-surface-500 hover:text-surface-200 flex items-center gap-1"><RotateCcw size={10} /> Reset group</button>}
            </div>
            {!isCollapsed && (
              <div className="divide-y divide-overlay-4">
                {scalars.map((name) => (
                  <TuningField key={name} name={name} value={t.val(name)} original={t.original[name]}
                    isDirty={t.isDirty(name)} isModified={t.isModified(name)}
                    onChange={(v) => t.setEdit(name, v)} onResetToOriginal={() => t.resetToOriginal(name)}
                    onCopy={() => { setCopied(t.val(name)); toast('Copied value'); }} onPaste={() => copied !== null && t.setEdit(name, copied)} canPaste={copied !== null} />
                ))}
                {vectors.map((v) => (
                  <div key={v.name} className="py-1.5">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-surface-200 flex-1 flex items-center gap-1"><span className="truncate">{fieldLabel(v.name)}</span><WhyTip name={v.name} /></label>
                      {(['x', 'y', 'z'] as const).map((ax) => (
                        <input key={ax} value={t.val(`${v.name}.${ax}`)} onChange={(e) => t.setEdit(`${v.name}.${ax}`, e.target.value)} spellCheck={false} title={ax.toUpperCase()}
                          className={`w-16 bg-overlay-3 border rounded-lg px-2 py-1 text-xs font-mono text-right focus:outline-none ${t.isDirty(`${v.name}.${ax}`) ? 'border-primary-500/50 text-primary-200' : 'border-overlay-6 text-surface-200'}`} />
                      ))}
                      <button onClick={() => t.resetKeysToOriginal([`${v.name}.x`, `${v.name}.y`, `${v.name}.z`])} title="Reset to original" className="text-surface-500 hover:text-surface-100"><RotateCcw size={12} /></button>
                    </div>
                    <p className="text-[10px] text-surface-600 font-mono mt-0.5">{v.name} · x / y / z</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <p className="text-[10px] text-surface-600">Edits are surgical — only the fields you change are rewritten, with a backup before every write. Unknown fields and comments are preserved.</p>

      {modal && <PresetPreviewModal title={`${modal.name} — preview`} subtitle="Full-handling preset" changes={modal.changes} warnings={modal.warnings} busy={busy} onApply={applyPreset} onCancel={() => setModal(null)} />}
    </div>
  );
}
