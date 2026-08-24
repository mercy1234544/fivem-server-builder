// Changes / Before & After — everything modified since import, across
// handling.meta and the metadata files, with per-field reset-to-original and a
// revert-all. Source of truth is the file-vs-baseline diff from the service.
import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, RotateCcw, ChevronRight, CheckCircle2, History } from 'lucide-react';
import { fieldLabel } from '../../../main/shared/handlingMeta';

type MetaKind = 'vehicles' | 'carvariations' | 'carcols';
interface HRow { name: string; original: string; current: string }
interface MRow { tag: string; friendly: string; original: string; current: string }

export function ChangesTab({ root, handlingId, modelName, onChanged }: {
  root: string; handlingId: string | null; modelName: string | null; onChanged: () => void;
}) {
  const [handling, setHandling] = useState<HRow[]>([]);
  const [meta, setMeta] = useState<Record<MetaKind, MRow[]>>({ vehicles: [], carvariations: [], carcols: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const h = handlingId ? await window.electronAPI.vehicleStudio.handlingDiff(root, handlingId) : { ok: true, changes: [] };
    setHandling(h.ok && h.changes ? h.changes : []);
    const kinds: MetaKind[] = ['vehicles', 'carvariations', 'carcols'];
    const m: Record<MetaKind, MRow[]> = { vehicles: [], carvariations: [], carcols: [] };
    if (modelName) for (const k of kinds) {
      const key = k === 'carcols' ? modelName : modelName; // carcols keyed by siren name is rare; best-effort
      const r = await window.electronAPI.vehicleStudio.metaDiff(root, k, key);
      if (r.ok && r.changes) m[k] = r.changes;
    }
    setMeta(m);
    setLoading(false);
  }, [root, handlingId, modelName]);
  useEffect(() => { load(); }, [load]);

  const total = handling.length + meta.vehicles.length + meta.carvariations.length + meta.carcols.length;

  const resetHandling = async (name: string) => {
    if (!handlingId) return;
    const r = await window.electronAPI.vehicleStudio.resetHandlingFields(root, handlingId, [name]);
    if (r.ok) { toast.success(`Reset ${fieldLabel(name)}`); await load(); onChanged(); } else toast.error(r.error || 'Reset failed');
  };
  const resetMeta = async (kind: MetaKind, row: MRow) => {
    if (!modelName) return;
    const r = await window.electronAPI.vehicleStudio.writeMeta(root, kind, modelName, [{ tag: row.tag, value: row.original }]);
    if (r.ok) { toast.success(`Reset ${row.friendly}`); await load(); onChanged(); } else toast.error(r.error || 'Reset failed');
  };
  const revertAll = async () => {
    if (!confirm('Revert ALL changes back to the originally imported values? This cannot be undone from here.')) return;
    setBusy(true);
    if (handlingId && handling.length) await window.electronAPI.vehicleStudio.revertHandling(root, handlingId);
    if (modelName) for (const k of ['vehicles', 'carvariations', 'carcols'] as MetaKind[]) {
      for (const row of meta[k]) await window.electronAPI.vehicleStudio.writeMeta(root, k, modelName, [{ tag: row.tag, value: row.original }]);
    }
    setBusy(false);
    toast.success('Reverted all changes to original'); await load(); onChanged();
  };

  if (loading) return <div className="flex items-center gap-2 text-sm text-surface-500"><Loader2 size={14} className="animate-spin" /> Loading changes…</div>;

  const Row = ({ label, raw, from, to, onReset }: { label: string; raw?: string; from: string; to: string; onReset: () => void }) => (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
      <div className="flex-1 min-w-0">
        <span className="text-surface-200">{label}</span>{raw && <span className="text-surface-600 font-mono ml-1.5">{raw}</span>}
      </div>
      <span className="font-mono text-surface-500">{Number.isFinite(parseFloat(from)) ? parseFloat(from) : from}</span>
      <ChevronRight size={11} className="text-surface-600 shrink-0" />
      <span className="font-mono font-semibold text-amber-300">{Number.isFinite(parseFloat(to)) ? parseFloat(to) : to}</span>
      <button onClick={onReset} title="Reset this field to original" className="text-surface-500 hover:text-surface-100 ml-1"><RotateCcw size={12} /></button>
    </div>
  );

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <History size={16} className="text-primary-300" />
        <p className="text-sm font-bold text-surface-100">{total} change{total === 1 ? '' : 's'} since import</p>
        <span className="flex-1" />
        {total > 0 && <button onClick={revertAll} disabled={busy} className="btn-secondary text-xs py-1.5 flex items-center gap-1.5">{busy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Revert all</button>}
      </div>

      {total === 0 ? (
        <div className="card flex flex-col items-center py-14 text-center">
          <CheckCircle2 size={28} className="text-emerald-400 mb-2" />
          <p className="text-sm font-bold text-surface-100">No changes</p>
          <p className="text-xs text-surface-500 mt-1">This vehicle matches the values you imported.</p>
        </div>
      ) : (
        <>
          {handling.length > 0 && (
            <div className="card">
              <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-1">handling.meta · {handling.length}</p>
              <div className="divide-y divide-overlay-4">
                {handling.map((c) => <Row key={c.name} label={fieldLabel(c.name)} raw={c.name} from={c.original} to={c.current} onReset={() => resetHandling(c.name)} />)}
              </div>
            </div>
          )}
          {(['vehicles', 'carvariations', 'carcols'] as MetaKind[]).map((k) => meta[k].length > 0 && (
            <div key={k} className="card">
              <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-1">{k}.meta · {meta[k].length}</p>
              <div className="divide-y divide-overlay-4">
                {meta[k].map((c) => <Row key={c.tag} label={c.friendly} raw={c.tag} from={c.original} to={c.current} onReset={() => resetMeta(k, c)} />)}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
