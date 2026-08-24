// Handling-reference repair components, shared by the Handling tab (error state)
// and the Vehicle Studio workspace. Extracted verbatim from the original
// VehicleStudio.tsx so behaviour is unchanged (create / clone / register /
// re-point handling, plus the dependency trace).
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Gauge } from 'lucide-react';

export function HandlingRepair({ root, handlingId, modelName, onFixed, onGoDiagnostics }: {
  root: string; handlingId: string; modelName: string; onFixed: () => void; onGoDiagnostics: () => void;
}) {
  const [diag, setDiag] = useState<VSHandlingDiag | null>(null);
  const [busy, setBusy] = useState(false);
  const [cloneFrom, setCloneFrom] = useState('');

  const run = () => window.electronAPI.vehicleStudio.diagnoseHandling(root, handlingId).then((d) => { setDiag(d); setCloneFrom(d.fuzzy[0]?.name || d.allNames[0]?.name || ''); });
  React.useEffect(() => { run(); }, [root, handlingId]);

  const wrap = async (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    setBusy(true); const r = await fn(); setBusy(false);
    if (r.ok) { toast.success(okMsg); onFixed(); } else toast.error(r.error || 'Failed');
  };

  if (!diag) return <div className="flex items-center gap-2 text-sm text-surface-500"><Loader2 size={14} className="animate-spin" /> Tracing handling reference…</div>;

  const chain = [
    { ok: true, label: `vehicles.meta references "${modelName}"` },
    { ok: true, label: `handlingId = ${handlingId}` },
    { ok: diag.handlingFileExists, label: diag.handlingFileExists ? 'handling.meta found' : 'handling.meta NOT found' },
    { ok: diag.registeredInManifest !== false, label: diag.registeredInManifest === false ? 'handling.meta NOT registered in manifest' : 'handling.meta registered' },
    { ok: !!diag.exactMatch, label: diag.exactMatch ? `entry "${diag.exactMatch.name}" found` : `entry "${handlingId}" MISSING` },
  ];

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
        <p className="text-sm font-bold text-red-300 flex items-center gap-2"><XCircle size={16} /> Handling reference error</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-3 text-xs">
          <div><span className="text-surface-500">Vehicle:</span> <span className="text-surface-100 font-semibold">{modelName}</span></div>
          <div><span className="text-surface-500">Referenced handling:</span> <span className="text-surface-100 font-semibold">{handlingId}</span></div>
        </div>
        <p className="text-xs text-surface-300 mt-2">No matching handling entry was found. Possible causes: handling.meta missing, a differently-spelled handling ID, handling.meta not registered in fxmanifest.lua, wrong location, or an unparseable entry.</p>
      </div>

      <div className="card">
        <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-2">Find cause — reference trace</p>
        <div className="space-y-1">
          {chain.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {c.ok ? <CheckCircle2 size={13} className="text-emerald-400" /> : <XCircle size={13} className="text-red-400" />}
              <span className={c.ok ? 'text-surface-300' : 'text-red-300 font-semibold'}>{c.label}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-primary-300 mt-2">
          Cause: {!diag.handlingFileExists ? 'no handling.meta in the resource.' : diag.registeredInManifest === false ? 'handling.meta is not registered in the manifest.' : `handling.meta has no entry named "${handlingId}".`}
        </p>
      </div>

      <div className="card space-y-3">
        <p className="text-[10px] uppercase tracking-wider text-surface-500">Repair options</p>

        {diag.registeredInManifest === false && diag.handlingFileExists && (
          <RepairRow title="Register handling.meta in the manifest" desc="Adds the data_file 'HANDLING_FILE' line so the game loads it." btn="Register"
            onClick={() => wrap(() => window.electronAPI.vehicleStudio.registerHandling(root), 'Registered handling.meta')} busy={busy} />
        )}

        {diag.fuzzy.length > 0 && (
          <div>
            <p className="text-xs text-surface-400 mb-1.5">Close matches found — point this vehicle at one:</p>
            <div className="space-y-1.5">
              {diag.fuzzy.map((f) => (
                <div key={f.name} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-overlay-4 bg-overlay-2">
                  <span className="text-sm font-mono text-surface-100 flex-1">{f.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${f.similarity >= 90 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{f.similarity}%</span>
                  <button disabled={busy} onClick={() => wrap(() => window.electronAPI.vehicleStudio.setVehicleHandlingId(root, modelName, f.name), `Pointed ${modelName} at ${f.name}`)}
                    className="btn-secondary text-[11px] py-1">Use {f.name}</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <RepairRow title={`Create a new handling entry "${handlingId}"`} desc="Generates a complete, valid handling entry you can then tune." btn="Create"
          onClick={() => wrap(() => window.electronAPI.vehicleStudio.createHandling(root, handlingId), `Created handling "${handlingId}"`)} busy={busy} />

        {diag.allNames.length > 0 && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <p className="text-xs text-surface-400 mb-1">Or clone an existing entry as "{handlingId}":</p>
              <select value={cloneFrom} onChange={(e) => setCloneFrom(e.target.value)} className="w-full bg-overlay-3 border border-overlay-6 rounded-lg px-2 py-1.5 text-xs text-surface-200 focus:outline-none">
                {diag.allNames.map((n) => <option key={n.name} value={n.name}>{n.name}</option>)}
              </select>
            </div>
            <button disabled={busy || !cloneFrom} onClick={() => wrap(() => window.electronAPI.vehicleStudio.cloneHandling(root, cloneFrom, handlingId), `Cloned ${cloneFrom} → ${handlingId}`)}
              className="btn-secondary text-xs py-2">Clone</button>
          </div>
        )}

        <button onClick={onGoDiagnostics} className="text-xs text-primary-300 hover:text-primary-200">Open Diagnostics →</button>
      </div>
    </div>
  );
}

function RepairRow({ title, desc, btn, onClick, busy }: { title: string; desc: string; btn: string; onClick: () => void; busy: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-overlay-4 bg-overlay-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-surface-100">{title}</p>
        <p className="text-[11px] text-surface-500">{desc}</p>
      </div>
      <button disabled={busy} onClick={onClick} className="btn-primary text-[11px] py-1.5 shrink-0">{busy ? <Loader2 size={12} className="animate-spin" /> : btn}</button>
    </div>
  );
}

export function TuneMissing({ modelName, handlingId, onGoHandling }: { modelName: string; handlingId: string; onGoHandling: () => void }) {
  return (
    <div className="card flex flex-col items-center py-14 text-center max-w-xl">
      <AlertTriangle size={30} className="text-amber-400 mb-3" />
      <p className="text-sm font-bold text-surface-100">Can't tune — handling is missing</p>
      <p className="text-xs text-surface-500 mt-1 max-w-sm">{modelName} references handling "{handlingId}", but no matching entry exists yet. Repair it first, then Smart Tune will work.</p>
      <button onClick={onGoHandling} className="btn-primary text-xs py-2 mt-4 flex items-center gap-1.5"><Gauge size={13} /> Repair in Handling tab</button>
    </div>
  );
}

export function NoHandling() {
  return (
    <div className="card flex flex-col items-center py-16 text-center max-w-xl">
      <Gauge size={32} className="text-surface-600 mb-3" />
      <p className="text-sm font-bold text-surface-100">No editable handling found</p>
      <p className="text-xs text-surface-500 mt-1">This resource has no vehicle with a matching handling entry to tune.</p>
    </div>
  );
}
