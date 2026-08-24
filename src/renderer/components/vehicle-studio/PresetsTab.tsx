// Presets gallery — the full-handling presets with descriptions, preview, and
// apply. Shares the same preview modal + backend as the Handling tab's preset row.
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Sparkles, RotateCcw } from 'lucide-react';
import { PresetPreviewModal, type PreviewChange } from './primitives';
import { HANDLING_PRESETS } from '../../../main/shared/handlingMeta';

export function PresetsTab({ root, handlingId, onChanged }: { root: string; handlingId: string; onChanged: () => void }) {
  const [modal, setModal] = useState<{ id: string; name: string; changes: PreviewChange[]; warnings?: string[]; special?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const open = async (id: string) => {
    const p = await window.electronAPI.vehicleStudio.previewHandlingPreset(root, handlingId, id);
    if (!p.ok) { toast.error(p.error || 'Preview failed'); return; }
    setModal({ id, name: p.name || id, changes: p.changes || [], warnings: p.warnings, special: id === 'stock' });
  };
  const apply = async () => {
    if (!modal) return; setBusy(true);
    const r = await window.electronAPI.vehicleStudio.applyHandlingPreset(root, handlingId, modal.id);
    setBusy(false);
    if (r.ok) { toast.success(`Applied ${modal.name}`); setModal(null); onChanged(); } else toast.error(r.error || 'Apply failed');
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <p className="text-sm font-bold text-surface-100 flex items-center gap-1.5"><Sparkles size={14} className="text-primary-300" /> Handling presets</p>
        <p className="text-[11px] text-surface-500 mt-0.5">Each preset modifies real handling values (tuned around this vehicle where sensible). Preview every change before applying. "Stock" restores your imported values.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {HANDLING_PRESETS.map((p) => (
          <button key={p.id} onClick={() => open(p.id)}
            className={`text-left rounded-xl border p-3 transition-all ${p.special ? 'border-emerald-500/25 bg-emerald-500/5 hover:border-emerald-500/40' : 'border-overlay-6 bg-overlay-2 hover:border-primary-500/30'}`}>
            <div className="flex items-center gap-1.5">
              {p.special ? <RotateCcw size={13} className="text-emerald-400" /> : <Sparkles size={13} className="text-primary-300" />}
              <span className="text-sm font-bold text-surface-100">{p.name}</span>
            </div>
            <p className="text-[11px] text-surface-500 mt-1 leading-snug">{p.desc}</p>
          </button>
        ))}
      </div>
      {modal && (
        <PresetPreviewModal title={`${modal.name} — preview`} subtitle={modal.special ? 'Restores imported values' : 'Full-handling preset'}
          changes={modal.changes} warnings={modal.warnings} busy={busy}
          applyLabel={modal.special ? 'Restore' : 'Apply'} onApply={apply} onCancel={() => setModal(null)} />
      )}
    </div>
  );
}
