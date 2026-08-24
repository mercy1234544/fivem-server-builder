// Performance Overview — derived vehicle characteristics computed from the real
// handling values, with an honest "estimate" label (these are comparison indices,
// not physics measurements). Shows before → after (imported → current) whenever
// the vehicle has been modified since import.
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Info, ArrowRight, Gauge } from 'lucide-react';
import { computeMetrics, type Metric } from '../../../main/shared/handlingMeta';

const numMap = (obj: Record<string, string>): Record<string, number> => {
  const o: Record<string, number> = {}; for (const k of Object.keys(obj)) if (!k.includes('.')) o[k] = parseFloat(obj[k]); return o;
};

function MetricCard({ cur, prev }: { cur: Metric; prev?: Metric }) {
  const changed = prev && prev.display !== cur.display && cur.kind !== 'label';
  const better = changed && typeof cur.value === 'number' && typeof prev!.value === 'number' && cur.value !== prev!.value
    ? (cur.value > prev!.value) : null;
  return (
    <div className="rounded-xl border border-overlay-6 bg-overlay-2 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-surface-500 flex items-center gap-1">
        {cur.label}
        {cur.kind === 'estimate' && <span title="Estimated comparison index from handling values — not a physics measurement." className="text-surface-600"><Info size={9} /></span>}
      </p>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span className="text-lg font-bold text-surface-100">{cur.display}</span>
        {changed && (
          <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${better === null ? 'text-surface-400' : better ? 'text-emerald-400' : 'text-amber-400'}`}>
            <span className="text-surface-600 line-through">{prev!.display}</span>
            <ArrowRight size={9} />
          </span>
        )}
      </div>
      {cur.note && <p className="text-[9px] text-surface-600 mt-0.5">{cur.note}</p>}
    </div>
  );
}

export function OverviewTab({ scan, root, handlingId, vehicle }: {
  scan: VSScan; root: string; handlingId: string | null; vehicle: VSVehicle | null;
}) {
  const [cur, setCur] = useState<Metric[] | null>(null);
  const [prev, setPrev] = useState<Metric[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!handlingId) { setCur(null); return; }
    setLoading(true);
    window.electronAPI.vehicleStudio.readHandling(root, handlingId).then((r) => {
      setLoading(false);
      if (!r.ok || !r.fields) { setCur(null); return; }
      const curNum: Record<string, number> = {}; for (const f of r.fields) if (f.value !== undefined) curNum[f.name] = parseFloat(f.value);
      setCur(computeMetrics(curNum));
      setPrev(r.original ? computeMetrics(numMap(r.original)) : null);
    });
  }, [root, handlingId]);

  const modified = useMemo(() => {
    if (!cur || !prev) return false;
    return cur.some((m, i) => m.display !== prev[i]?.display);
  }, [cur, prev]);

  return (
    <div className="max-w-4xl space-y-4">
      {/* Vehicle identity */}
      {vehicle && (
        <div className="card flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-primary-500/15 border border-primary-500/25 flex items-center justify-center shrink-0"><Gauge size={20} className="text-primary-300" /></div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-surface-100">{vehicle.gameName || vehicle.modelName}</p>
            <p className="text-[11px] text-surface-500">Spawn code <span className="font-mono text-surface-300">{vehicle.modelName}</span> · {vehicle.type}{vehicle.makeName ? ` · ${vehicle.makeName}` : ''}</p>
          </div>
        </div>
      )}

      {/* Derived characteristics */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-surface-100">Performance overview</p>
          <span className="text-[10px] text-surface-600 flex items-center gap-1"><Info size={10} /> estimates from handling values, not physics measurements</span>
        </div>
        {loading ? <div className="flex items-center gap-2 text-sm text-surface-500"><Loader2 size={14} className="animate-spin" /> Calculating…</div>
          : !cur ? <div className="card text-sm text-surface-500">No handling available for this vehicle — repair it in the Handling tab.</div>
          : (
            <>
              {modified && <p className="text-[11px] text-amber-400/80 mb-2">Showing before → after vs the imported values (unsaved-to-original changes since import).</p>}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {cur.map((m, i) => <MetricCard key={m.key} cur={m} prev={prev?.[i]} />)}
              </div>
            </>
          )}
      </div>

      {/* Resource summary */}
      <div className="card">
        <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-2">Resource</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><p className="text-[10px] text-surface-500">Vehicles</p><p className="font-bold text-surface-100">{scan.vehicles.length}</p></div>
          <div><p className="text-[10px] text-surface-500">Model files</p><p className="font-bold text-surface-100">{scan.counts.yft}</p></div>
          <div><p className="text-[10px] text-surface-500">Meta files</p><p className="font-bold text-surface-100">{scan.counts.meta}</p></div>
          <div><p className="text-[10px] text-surface-500">Issues</p><p className={`font-bold ${scan.summary.errors ? 'text-red-400' : scan.summary.warnings ? 'text-amber-400' : 'text-emerald-400'}`}>{scan.summary.errors + scan.summary.warnings}</p></div>
        </div>
      </div>
    </div>
  );
}
